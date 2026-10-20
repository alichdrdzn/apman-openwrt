#!/bin/bash
# E2E harness for luci-app-apman (verify before release).
#
# Needs: root on Linux, mac80211_hwsim (wlan0/wlan1), nftables, iproute2,
#   python3, and the uci/jsonfilter stubs from the host test harness
#   (default TE=/data/offload/apman-build/testenv, used as $TE/bin;
#   override with TE=...).
# Host wrappers /usr/sbin/apman-apply and /usr/sbin/apman-collect must
#   exec the repo copies, e.g.:
#     #!/bin/sh
#     exec bash /path/to/repo/luci-app-apman/files/usr/sbin/apman-apply "$@"
#   run under bash: /lib/functions.sh uses export -n, which dash lacks
#   (busybox ash on the router supports it).
# Fixture: bridge $BRIDGE (apmanbr0) = wlan0 (hwsim, mesh mode, real
# phy80211 port) + veths
#   laneth/upl; netns: NSW=wifi client (phy1 mesh), NSL=wired, NSU=uplink.
# Prints PASS/FAIL lines; exit 0 only if every check passed.
#!/bin/bash
# E2E v2: apman wifi-only limits/accounting + daily/monthly usage caps
# fixture: bridge $BRIDGE = wlan0 (hwsim, mesh mode, real phy80211 port) + veths
# laneth/upl; netns: NSW=wifi client (phy1 mesh), NSL=wired, NSU=uplink
REPO="$(cd "$(dirname "$0")/.." && pwd)/luci-app-apman/files"
TE=${TE:-/data/offload/apman-build/testenv}
RUN=/tmp/apman-e2e
unset APMAN_WIFI_PORTS
export PATH=$TE/bin:$PATH
export UCISTORE=$RUN/uci.db
export APMAN_RUN_DIR=$RUN
export APMAN_DAILY_FILE=$RUN/daily.tsv
DAILY=$RUN/daily.tsv
NSW=nsapw; NSL=nsapl; NSU=nsapu
# never br-lan: the harness must not be able to touch a real LAN bridge
BRIDGE=apmanbr0
export APMAN_BRIDGE=$BRIDGE
# inherit nothing that silently redirects the code under test: a stray
# APMAN_LAN_NETS/APMAN_GW_MAC in the parent shell would make these tests lie
unset APMAN_LAN_NETS APMAN_WIFI_PORTS APMAN_DEVICES_TSV APMAN_GW_MAC
PASS=0; FAIL=0
pass(){ printf 'PASS  %s\n' "$1"; PASS=$((PASS+1)); }
fail(){ printf 'FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }
chk(){ if [ "$2" = 0 ]; then pass "$1"; else fail "$1"; fi; }

cleanup(){
	ip netns del $NSW 2>/dev/null
	ip netns del $NSL 2>/dev/null
	ip netns del $NSU 2>/dev/null
	ip netns del $NSI 2>/dev/null
	ip link del inet0 2>/dev/null
	ip link del laneth 2>/dev/null
	ip link del upl 2>/dev/null
	iw phy phy1 set netns 1 2>/dev/null
	ip link set wlan0 nomaster 2>/dev/null
	ip link set wlan0 down 2>/dev/null
	iw dev wlan0 mesh leave 2>/dev/null
	iw dev wlan0 set type managed 2>/dev/null
	nft delete table bridge apman 2>/dev/null
	rm -rf "$RUN"
}
trap cleanup EXIT

# ---------- fixture ----------
rm -rf "$RUN"; mkdir -p "$RUN"
ip link show wlan0 >/dev/null 2>&1 || modprobe mac80211_hwsim radios=2
# rescue phy1 if an earlier run left it in a stray namespace
ip netns exec mtest iw phy phy1 set netns 1 2>/dev/null
ip netns del mtest 2>/dev/null
[ -d /sys/class/ieee80211/phy1 ] || { echo "ABORT: phy1 not in initial ns"; exit 1; }
# The fixture bridge is NOT called br-lan on purpose: this harness must never
# be able to delete or reconfigure a real LAN bridge on the machine running it
# (APMAN_BRIDGE is what apman-apply reads, so the name is configurable).
ip link del "$BRIDGE" 2>/dev/null
ip link add "$BRIDGE" type bridge
ip link add laneth type veth peer name lanethp
ip link add upl type veth peer name uplp
ip link set laneth master "$BRIDGE"; ip link set laneth up
ip link set upl master "$BRIDGE";   ip link set upl up
ip addr add 10.66.66.254/24 dev "$BRIDGE"
ip link set "$BRIDGE" up
NSI=nsapi
ip netns add $NSW; ip netns add $NSL; ip netns add $NSU; ip netns add $NSI
# an off-LAN target so whitelist mode can be proven with real traffic: the
# gateway NSU routes 10.99.99.0/24 out a second link to "the internet"
ip link add inet0 type veth peer name inet1
ip link set inet0 netns $NSU; ip link set inet1 netns $NSI
ip link set lanethp netns $NSL
ip link set uplp netns $NSU
ip netns exec $NSL sh -c 'ip link set lo up; ip link set lanethp up
	ip link set lanethp address aa:aa:aa:aa:aa:02; ip addr add 10.66.66.3/24 dev lanethp
	ip route add default via 10.66.66.1'
ip netns exec $NSU sh -c 'ip link set lo up; ip link set uplp up
	ip addr add 10.66.66.1/24 dev uplp
	ip link set inet0 up; ip addr add 10.99.99.1/24 dev inet0; echo 1 > /proc/sys/net/ipv4/ip_forward'
ip netns exec $NSI sh -c 'ip link set lo up; ip link set inet1 up
	ip addr add 10.99.99.9/24 dev inet1; ip route add 10.66.66.0/24 via 10.99.99.1'
# wifi AP-side port: mesh mode (the only mode this kernel lets us bridge)
ip link set wlan0 down
iw dev wlan0 set type mp
iw dev wlan0 mesh leave 2>/dev/null
ip link set wlan0 up
ip link set wlan0 master "$BRIDGE"
iw dev wlan0 mesh join apmanpoc freq 2412
# wifi client: whole phy1 into NSW, mesh with wlan0
iw phy phy1 set netns name $NSW
ip netns exec $NSW sh -c 'ip link set lo up; ip link set wlan1 down
	iw dev wlan1 set type mp; ip addr add 10.66.66.2/24 dev wlan1
	ip link set wlan1 up; iw dev wlan1 mesh join apmanpoc freq 2412
	ip route add default via 10.66.66.1'
sleep 3

W1MAC=$(ip netns exec $NSW cat /sys/class/net/wlan1/address 2>/dev/null | tr 'A-F' 'a-f')
[ -n "$W1MAC" ] || { echo "ABORT: cannot read wlan1 MAC"; exit 1; }
AID=$(echo "$W1MAC" | tr -d ':')
BB=aa:aa:aa:aa:aa:02
BID=$(echo "$BB" | tr -d ':')

# fixture sanity: wifi + wired paths must carry traffic before testing rules
okw=1; okl=1
for i in 1 2 3 4 5 6 7 8 9 10; do
	ip netns exec $NSW ping -n -c1 -W1 10.66.66.1 >/dev/null 2>&1 && { okw=0; break; }
	sleep 1
done
ip netns exec $NSL ping -n -c2 -W1 10.66.66.1 >/dev/null 2>&1 && okl=0
if [ "$okw" != 0 ] || [ "$okl" != 0 ]; then
	echo "ABORT: fixture connectivity broken (wifi=$okw wired=$okl)"
	ip netns exec $NSW ping -n -c1 -W2 10.66.66.1 2>&1 | tail -1
	ip netns exec $NSL ping -n -c1 -W2 10.66.66.1 2>&1 | tail -1
	iw dev wlan0 station dump 2>&1 | head -4
	exit 1
fi
echo "FIXTURE OK: wifi client $W1MAC via mesh+bridge, wired $BB"

# ---------- uci seed ----------
cat > "$UCISTORE" <<EOF
apman|global||global
apman|global|enabled|1
apman|global|interval|10
apman|global|history_days|30
apman|global|snapshot_minutes|10
apman|dev_wifi01||device
apman|dev_wifi01|mac|$W1MAC
apman|dev_wifi01|alias|Wifi phone
apman|dev_wifi01|down_kbps|5000
apman|dev_wifi01|up_kbps|2000
apman|dev_wifi01|limit_enabled|1
apman|dev_wifi01|block|0
apman|dev_wifi01|pause_until|0
apman|dev_wifi01|quota_daily_mb|0
apman|dev_wifi01|quota_monthly_mb|0
apman|dev_lan02||device
apman|dev_lan02|mac|$BB
apman|dev_lan02|alias|Wired PC
apman|dev_lan02|down_kbps|1
apman|dev_lan02|up_kbps|1
apman|dev_lan02|limit_enabled|1
apman|dev_lan02|block|0
apman|dev_lan02|pause_until|0
apman|dev_lan02|quota_daily_mb|0
apman|dev_lan02|quota_monthly_mb|0
EOF

DATE=$(date +%Y-%m-%d)
MONTH=${DATE%-*}

# ---------- helpers ----------
loss(){ # loss <ns> <target> [size] [count] -> integer % packet loss
	local out num
	out=$(ip netns exec "$1" ping -n -s "${3:-1400}" -c "${4:-50}" -i 0.02 -W 1 "$2" 2>&1 \
		| grep -o '[0-9.]*% packet loss' | head -1)
	num=${out%% *}; num=${num:-100}; num=${num%\%}
	echo "$num"
}
ctr(){ # ctr <counter-name> -> bytes
	nft --terse list table bridge apman 2>/dev/null | awk -v n="$1" '
		/counter (up|dn)_[0-9a-f]+ \{/ { k = $2; sub(/\{/, "", k); want = (k == n); next }
		want && /bytes/ { for (i = 1; i <= NF; i++) if ($i == "bytes") { print $(i+1); exit } }'
}
wifset(){ nft list table bridge apman 2>/dev/null | sed -n '/set wifports/,/^\t}/p'; }
qset(){    nft list table bridge apman 2>/dev/null | sed -n '/set overquota/,/^\t}/p'; }
setcap(){ uci -q set "apman.dev_wifi01.$1=$2"; uci -q commit apman; /usr/sbin/apman-apply >/dev/null 2>&1; }

# ---------- T1: apply + real wifi port discovery ----------
/usr/sbin/apman-apply >"$RUN/apply.log" 2>&1
chk "T1 apply loads ruleset (rc)" $?
S=$(wifset)
echo "$S" | grep -q '"wlan0"'
chk "T1 wifports discovers real wifi port wlan0 (phy80211 walk)" $?
echo "$S" | grep -qE '"(laneth|upl)"'
chk "T1 wifports excludes wired ports (expect no match)" $((1 - $?))
[ "$(nft list table bridge apman | grep -c 'hook forward')" -ge 3 ]
chk "T1 download chains live on bridge forward hook" $?
nft list table bridge apman | grep -q 'chain lim_ul'
chk "T1 upload limiter chain present" $?

APMAN_WIFI_PORTS=laneth /usr/sbin/apman-apply >/dev/null 2>&1
wifset | grep -q '"laneth"'
chk "T1b APMAN_WIFI_PORTS override works" $?
/usr/sbin/apman-apply >/dev/null 2>&1
wifset | grep -q '"wlan0"'
chk "T1b override restored (wlan0 back)" $?

# ---------- T2: wifi traffic counted both directions ----------
ip netns exec $NSW ping -n -c 8 -i 0.15 -W 1 10.66.66.1 >/dev/null 2>&1
ip netns exec $NSU ping -n -c 8 -i 0.15 -W 1 10.66.66.2 >/dev/null 2>&1
UW=$(ctr up_$AID); DW=$(ctr dn_$AID)
[ -n "$UW" ] && [ "$UW" -gt 0 ]; chk "T2 wifi upload counter moves (up=$UW)" $?
[ -n "$DW" ] && [ "$DW" -gt 0 ]; chk "T2 wifi download counter moves (dn=$DW)" $?

# ---------- T3: wired traffic untouched ----------
L1=$(loss $NSL 10.66.66.1)
L2=$(loss $NSU 10.66.66.3)
[ "$L1" -le 5 ] && [ "$L2" -le 5 ]
chk "T3 wired flows although caps are 1kbit (loss ${L1}%/${L2}%)" $?
[ "$(ctr up_$BID)" = 0 ] && [ "$(ctr dn_$BID)" = 0 ]
chk "T3 wired counters stay 0 (no wired accounting)" $?

# ---------- T4: wifi IS capped, wired NOT, at the same tiny caps ----------
setcap down_kbps 1; setcap up_kbps 1
W1L=$(loss $NSU 10.66.66.2)
W2L=$(loss $NSW 10.66.66.1)
[ "$W1L" -ge 60 ] && [ "$W2L" -ge 60 ]
chk "T4 wifi throttled at 1kbit (loss dn=${W1L}% up=${W2L}%)" $?
L3=$(loss $NSU 10.66.66.3)
[ "$L3" -le 5 ]
chk "T4 wired unthrottled while wifi capped (loss ${L3}%)" $?
setcap down_kbps 5000; setcap up_kbps 2000
L4=$(loss $NSU 10.66.66.3)
[ "$L4" -le 5 ]; chk "T4 wired ok after wifi cap restore (loss ${L4}%)" $?

# ---------- T5: daily usage cap (wifi only) ----------
setcap quota_daily_mb 1
printf '%s\t%s\t%d\t%d\n' "$DATE" "$AID" 1500000 600000 > "$RUN/today.tsv"
APMAN_ONCE=1 /usr/sbin/apman-collect >"$RUN/collect1.log" 2>&1
grep -qx "$W1MAC" "$RUN/quota.mac" 2>/dev/null
chk "T5 collector marks wifi device over daily quota" $?
grep -qx "$BB" "$RUN/quota.mac" 2>/dev/null
chk "T5 wired device NOT quota-blocked (expect no match)" $((1 - $?))
qset | grep -qi "$W1MAC"
chk "T5 nft overquota set contains wifi MAC" $?
Q1=$(loss $NSU 10.66.66.2 100 20)
Q2=$(loss $NSW 10.66.66.1 100 20)
[ "$Q1" -ge 80 ] && [ "$Q2" -ge 80 ]
chk "T5 wifi blocked by quota both directions (loss ${Q1}%/${Q2}%)" $?
Q3=$(loss $NSU 10.66.66.3 100 50)
[ "$Q3" -le 5 ]; chk "T5 wired unaffected by wifi quota (loss ${Q3}%)" $?
python3 - "$RUN/status.json" "$AID" "$BID" <<'PYEOF'
import json, sys
st = json.load(open(sys.argv[1])); aid, bid = sys.argv[2], sys.argv[3]
d = st['devices'][aid]
assert d['overquota'] == 1, d
assert d['state'] == 'capped', d
assert d['quota_daily_mb'] == 1, d
assert d['used_month'] >= 2100000, d
assert d['today_up'] + d['today_dn'] >= 2100000, d
assert st['devices'][bid]['overquota'] == 0
print("status.json ok:", d['state'], d['used_month'])
PYEOF
chk "T5 status.json quota fields + capped state" $?

# ---------- T6: daily quota releases when usage drops ----------
printf '%s\t%s\t%d\t%d\n' "$DATE" "$AID" 50000 50000 > "$RUN/today.tsv"
APMAN_ONCE=1 /usr/sbin/apman-collect >"$RUN/collect2.log" 2>&1
[ -f "$RUN/quota.mac" ] && [ ! -s "$RUN/quota.mac" ]
chk "T6 overquota list empties when usage below cap" $?
Q4=$(loss $NSU 10.66.66.2 100 20)
[ "$Q4" -le 20 ]; chk "T6 wifi passes again (loss ${Q4}%)" $?

# ---------- T7: monthly cap summed from daily.tsv (non-today rows) ----------
setcap quota_daily_mb 0
setcap quota_monthly_mb 1
if [ "$(date +%d)" = "01" ]; then
	echo "SKIP  T7 monthly test (today is the 1st)"
else
	MDATE="$MONTH-01"
	printf '%s\t%s\t%d\t%d\n%s\t%s\t%d\t%d\n' \
		"$DATE" "$AID" 50000 50000 \
		"$MDATE" "$AID" 2000000 0 > "$DAILY"
	APMAN_ONCE=1 /usr/sbin/apman-collect >"$RUN/collect3.log" 2>&1
	grep -qx "$W1MAC" "$RUN/quota.mac" 2>/dev/null
	chk "T7 monthly cap trips via daily.tsv history (day usage small)" $?
	Q5=$(loss $NSU 10.66.66.2 100 20)
	[ "$Q5" -ge 80 ]; chk "T7 wifi blocked by monthly cap (loss ${Q5}%)" $?
	setcap quota_monthly_mb 0
	printf '%s\t%s\t%d\t%d\n' "$DATE" "$AID" 50000 50000 > "$DAILY"
	APMAN_ONCE=1 /usr/sbin/apman-collect >"$RUN/collect4.log" 2>&1
	Q6=$(loss $NSU 10.66.66.2 100 20)
	[ "$Q6" -le 20 ]; chk "T7 wifi released after cap reset (loss ${Q6}%)" $?
fi

# ---------- T8: reboot does not lose today's flashed history ----------
printf '%s\t%s\t%d\t%d\n' "$DATE" "$AID" 400000 377777 > "$DAILY"
rm -f "$RUN/today.tsv" "$RUN/state.tsv" "$RUN/quota.mac" "$RUN/rates.tsv" "$RUN/lastsnap"
APMAN_ONCE=1 /usr/sbin/apman-collect >"$RUN/collect5.log" 2>&1
awk -F'\t' -v d="$DATE" -v i="$AID" '$1==d && $2==i && $3==400000 && $4==377777' "$RUN/today.tsv" | grep -q .
chk "T8 today.tsv seeded from daily.tsv after /tmp wipe" $?
awk -F'\t' -v d="$DATE" -v i="$AID" '$1==d && $2==i && $3==400000 && $4==377777' "$DAILY" | grep -q .
chk "T8 daily.tsv keeps today row after snapshot (no data loss)" $?

# ---------- T9: rpcd save is partial + quota fields ----------
RPCD=$REPO/usr/libexec/rpcd/apman
OUT=$(echo '{"mac":"'"$W1MAC"'","block":1}' | $RPCD call save 2>&1)
echo "$OUT" | grep -q '"ok":1'; chk "T9 partial save (block toggle) succeeds ($OUT)" $?
[ "$(uci -q get apman.dev_wifi01.block)" = 1 ]; chk "T9 block written" $?
[ "$(uci -q get apman.dev_wifi01.alias)" = "Wifi phone" ]
chk "T9 partial save keeps alias (bug fixed)" $?
[ "$(uci -q get apman.dev_wifi01.down_kbps)" = 5000 ]
chk "T9 partial save keeps down_kbps (bug fixed)" $?
[ "$(uci -q get apman.dev_wifi01.limit_enabled)" = 1 ]
chk "T9 partial save keeps limit_enabled" $?
OUT=$(echo '{"mac":"'"$W1MAC"'","block":0,"alias":"Phone","quota_daily_mb":25,"quota_monthly_mb":500}' | $RPCD call save 2>&1)
echo "$OUT" | grep -q '"ok":1'; chk "T9 save with quota fields succeeds ($OUT)" $?
[ "$(uci -q get apman.dev_wifi01.quota_daily_mb)" = 25 ] \
	&& [ "$(uci -q get apman.dev_wifi01.quota_monthly_mb)" = 500 ] \
	&& [ "$(uci -q get apman.dev_wifi01.alias)" = "Phone" ]
chk "T9 quota fields + alias written" $?
$RPCD list | python3 -c 'import json,sys; l=json.load(sys.stdin); assert "save" in l and "quota_daily_mb" in l["save"], l'
chk "T9 list schema advertises quota_daily_mb" $?
echo '{}' | $RPCD call status | python3 -c 'import json,sys; d=json.load(sys.stdin); assert "devices" in d and "settings" in d, d.keys()'
chk "T9 call status returns full payload" $?
uci -q set apman.dev_wifi01.quota_daily_mb=0; uci -q set apman.dev_wifi01.quota_monthly_mb=0
uci -q set apman.dev_wifi01.alias='Wifi phone'
uci -q commit apman; /usr/sbin/apman-apply >/dev/null 2>&1
APMAN_ONCE=1 /usr/sbin/apman-collect >/dev/null 2>&1

# ---------- T10: regenerate is idempotent, counters preserved ----------
C1=$(ctr up_$AID)
/usr/sbin/apman-apply >/dev/null 2>&1
C2=$(ctr up_$AID)
[ -n "$C1" ] && [ "$C1" = "$C2" ]
chk "T10 counters preserved across re-apply ($C1 -> $C2)" $?
[ "$(nft list tables | grep -c '^table bridge apman$')" = 1 ]
chk "T10 single apman table after re-apply" $?

# ---------- T11: unknown-device discovery end to end (regression) ----------
# Three faults made the "Not managed" list permanently empty:
#   1. parse_unk_set used 'nft --terse list set', and --terse omits elements
#   2. it queried sets named unknown_u/unknown_d (real names: _up/_dn)
#   3. an early '/}/' reset the line matcher, dropping single-line element lists
# Assert the whole chain: unscoped discovery -> set -> parser -> status.json.
UNKMAC=aa:aa:aa:aa:aa:03
# the wired client's real interface inside NSL is lanethp; giving it a MAC
# that is not in uci makes it an unmanaged device for discovery
ip netns exec $NSL ip link set lanethp address $UNKMAC
ip netns exec $NSL ping -c 5 -W1 -i 0.2 10.66.66.1 >/dev/null 2>&1
nft list set bridge apman unknown_up 2>/dev/null | grep -qi "$UNKMAC"
chk "T11 unmanaged MAC enters unknown_up set" $?
APMAN_ONCE=1 /usr/sbin/apman-collect >"$RUN/collect-unk.log" 2>&1
chk "T11 collect after unknown traffic (rc)" $?
python3 - "$RUN/status.json" "$UNKMAC" <<'PY'
import json, sys
st = json.load(open(sys.argv[1])); mac = sys.argv[2]
u = st.get('unknown') or {}
sys.exit(0 if mac in u and (u[mac]['up'] + u[mac]['dn']) > 0 else 1)
PY
chk "T11 unknown device reaches status.json with bytes" $?
grep -qi "^$UNKMAC" "$RUN/unknown.tsv" 2>/dev/null
chk "T11 unknown device persisted to unknown.tsv" $?
# the parser must survive the parser-vs-nft format boundary: no --terse on sets
grep -q 'nft list set bridge apman' "$REPO/usr/sbin/apman-collect"
chk "T11 collector reads sets without --terse" $?

# ---------- T12: whitelist mode (default deny) ----------
# Randomised MACs make per-device rules useless, so whitelist mode inverts the
# model: non-allowed wifi clients keep the LAN but lose everything off-LAN.
# The guard matches the LAN prefixes the bridge carries, NOT a gateway MAC:
# a bridge-mode AP has no default route, and the old gateway-based guard
# silently never installed, so the UI claimed "net off" while traffic flowed.
# a whitelist test needs an UNMANAGED wifi client, so drop the device entry
# (keep a copy: later checks restore it)
cp "$UCISTORE" "$RUN/uci.before-t12"
uci -q delete apman.dev_wifi01; uci -q commit apman
uci -q set apman.global.whitelist=1; uci -q commit apman
/usr/sbin/apman-apply >/dev/null 2>&1
nft list chain bridge apman wlguard >/dev/null 2>&1
chk "T12 wlguard chain created when enabled (no gateway needed)" $?
# ---- real traffic: the whole point of the feature ----
ip netns exec $NSI ping -n -c1 -W1 10.99.99.1 >/dev/null 2>&1
WL_INET=$(loss $NSW 10.99.99.9 100 20)
[ "$WL_INET" -ge 80 ]
chk "T12 unmanaged wifi client loses the internet (loss ${WL_INET}%)" $?
WL_LAN=$(loss $NSW 10.66.66.3 100 10)
[ "$WL_LAN" -le 20 ]
chk "T12 unmanaged wifi client still reaches the LAN (loss ${WL_LAN}%)" $?
WL_AP=$(loss $NSW 10.66.66.254 100 10)
[ "$WL_AP" -le 20 ]
chk "T12 unmanaged wifi client still reaches the AP UI (loss ${WL_AP}%)" $?
WL_GW=$(loss $NSW 10.66.66.1 100 10)
[ "$WL_GW" -le 20 ]
chk "T12 unmanaged wifi client still reaches the gateway LAN side (loss ${WL_GW}%)" $?
WL_WIRED=$(loss $NSL 10.99.99.9 100 20)
[ "$WL_WIRED" -le 20 ]
chk "T12 wired client unaffected by whitelist (loss ${WL_WIRED}%)" $?
# allowing the device restores its internet immediately
cp "$RUN/uci.before-t12" "$UCISTORE"
uci -q set apman.global.whitelist=1; uci -q commit apman
/usr/sbin/apman-apply >/dev/null 2>&1
WL_OK=$(loss $NSW 10.99.99.9 100 20)
[ "$WL_OK" -le 20 ]
chk "T12 allowed device gets the internet back (loss ${WL_OK}%)" $?
# blocking it removes it from allowed, so its internet dies again
setcap block 1
/usr/sbin/apman-apply >/dev/null 2>&1
WL_BLK=$(loss $NSW 10.99.99.9 100 20)
[ "$WL_BLK" -ge 80 ]
chk "T12 blocked device loses the internet (loss ${WL_BLK}%)" $?
setcap block 0
/usr/sbin/apman-apply >/dev/null 2>&1
nft list set bridge apman lan4 2>/dev/null | grep -q '10\.66\.66\.'
chk "T12 LAN prefix captured from the bridge address" $?

nft list chain bridge apman wlguard | grep -q 'ether saddr @allowed accept'
chk "T12 allowed devices exempted before any drop" $?
nft list chain bridge apman wlguard | grep -q 'ip daddr @lan4 accept'
chk "T12 LAN destinations still accepted" $?
nft list chain bridge apman wlguard | grep -q 'udp dport 67 accept'
chk "T12 DHCP still accepted (client keeps its lease)" $?
nft list chain bridge apman wlguard | grep -q 'ether type arp accept'
chk "T12 ARP still accepted" $?
nft list chain bridge apman wlguard | grep -q 'ip6 daddr fe80::/10 accept'
chk "T12 IPv6 link-local still accepted" $?
nft list chain bridge apman wlguard | grep -q 'meta l4proto ipv6-icmp accept'
chk "T12 ICMPv6/neighbour discovery still accepted" $?
nft list chain bridge apman wlguard | grep -q 'iifname @wifports ether saddr != @allowed drop'
chk "T12 final rule drops only off-LAN traffic from wifi" $?
nft list chain bridge apman wlguard | grep -q 'iifname .*laneth'
chk "T12 guard never matches the wired port (expect no match)" $((1 - $?))
nft list set bridge apman allowed 2>/dev/null | grep -qi "$W1MAC"
chk "T12 managed device is allowed" $?
setcap block 1
/usr/sbin/apman-apply >/dev/null 2>&1
nft list set bridge apman allowed 2>/dev/null | grep -qi "$W1MAC"
chk "T12 blocked device removed from allowed (expect no match)" $((1 - $?))
setcap block 0
/usr/sbin/apman-apply >/dev/null 2>&1
nft list set bridge apman allowed 2>/dev/null | grep -qi "$W1MAC"
chk "T12 unblocked device returns to allowed" $?
: > "$RUN/devices.tsv.empty"
APMAN_DEVICES_TSV=$RUN/devices.tsv.empty /usr/sbin/apman-apply >/dev/null 2>&1
nft list chain bridge apman wlguard | grep -q 'ether saddr != @allowed drop'
chk "T12 empty allowlist still generates the deny rule" $?
/usr/sbin/apman-apply >/dev/null 2>&1
# fail open for real: a bridge with no address at all has no LAN prefix, so
# the guard must not install (denying everyone would brick the wifi)
ip addr flush dev "$BRIDGE" 2>/dev/null
/usr/sbin/apman-apply >/dev/null 2>&1
nft list chain bridge apman wlguard >/dev/null 2>&1
chk "T12 no LAN prefix => guard absent (fail open)" $((1 - $?))
ip addr add 10.66.66.254/24 dev "$BRIDGE"
/usr/sbin/apman-apply >/dev/null 2>&1
nft list chain bridge apman wlguard >/dev/null 2>&1
chk "T12 guard returns once the LAN address is back" $?
APMAN_LAN_NETS=10.9.9.0/24 /usr/sbin/apman-apply >/dev/null 2>&1
nft list set bridge apman lan4 2>/dev/null | grep -q '10\.9\.9\.0/24'
chk "T12 APMAN_LAN_NETS override honoured" $?
uci -q set apman.global.whitelist=0; uci -q commit apman
/usr/sbin/apman-apply >/dev/null 2>&1
nft list chain bridge apman wlguard >/dev/null 2>&1
chk "T12 guard removed when whitelist disabled (expect absent)" $((1 - $?))
APMAN_ONCE=1 /usr/sbin/apman-collect >/dev/null 2>&1
python3 -c "
import json;s=json.load(open('$RUN/status.json'));assert 'whitelist' in s['settings'];assert 'lan_prefix' in s['settings']"
chk "T12 status.json reports whitelist state + LAN prefix" $?

# ---------- summary ----------
echo "=============================================="
echo "PASS=$PASS FAIL=$FAIL"
echo "--- wifports ---"; wifset
echo "--- quota.mac ---"; cat "$RUN/quota.mac" 2>/dev/null; echo "(end)"
if [ "$FAIL" != 0 ]; then
	ls -la "$RUN" 2>&1 | head -30
	for lg in apply collect1 collect2 collect3 collect5; do
		[ -f "$RUN/$lg.log" ] && { echo "--- $lg.log ---"; tail -5 "$RUN/$lg.log"; }
	done
fi
[ "$FAIL" = 0 ]
