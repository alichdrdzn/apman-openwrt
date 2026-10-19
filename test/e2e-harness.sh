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
# Fixture: br-lan = wlan0 (hwsim, mesh mode, real phy80211 port) + veths
#   laneth/upl; netns: NSW=wifi client (phy1 mesh), NSL=wired, NSU=uplink.
# Prints PASS/FAIL lines; exit 0 only if every check passed.
#!/bin/bash
# E2E v2: apman wifi-only limits/accounting + daily/monthly usage caps
# fixture: br-lan = wlan0 (hwsim, mesh mode, real phy80211 port) + veths
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
PASS=0; FAIL=0
pass(){ printf 'PASS  %s\n' "$1"; PASS=$((PASS+1)); }
fail(){ printf 'FAIL  %s\n' "$1"; FAIL=$((FAIL+1)); }
chk(){ if [ "$2" = 0 ]; then pass "$1"; else fail "$1"; fi; }

cleanup(){
	ip netns del $NSW 2>/dev/null
	ip netns del $NSL 2>/dev/null
	ip netns del $NSU 2>/dev/null
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
ip addr flush dev br-lan 2>/dev/null
ip link del br-lan 2>/dev/null
ip link add br-lan type bridge
ip link add laneth type veth peer name lanethp
ip link add upl type veth peer name uplp
ip link set laneth master br-lan; ip link set laneth up
ip link set upl master br-lan;   ip link set upl up
ip link set br-lan up
ip netns add $NSW; ip netns add $NSL; ip netns add $NSU
ip link set lanethp netns $NSL
ip link set uplp netns $NSU
ip netns exec $NSL sh -c 'ip link set lo up; ip link set lanethp up
	ip link set lanethp address aa:aa:aa:aa:aa:02; ip addr add 10.66.66.3/24 dev lanethp'
ip netns exec $NSU sh -c 'ip link set lo up; ip link set uplp up
	ip addr add 10.66.66.1/24 dev uplp'
# wifi AP-side port: mesh mode (the only mode this kernel lets us bridge)
ip link set wlan0 down
iw dev wlan0 set type mp
iw dev wlan0 mesh leave 2>/dev/null
ip link set wlan0 up
ip link set wlan0 master br-lan
iw dev wlan0 mesh join apmanpoc freq 2412
# wifi client: whole phy1 into NSW, mesh with wlan0
iw phy phy1 set netns name $NSW
ip netns exec $NSW sh -c 'ip link set lo up; ip link set wlan1 down
	iw dev wlan1 set type mp; ip addr add 10.66.66.2/24 dev wlan1
	ip link set wlan1 up; iw dev wlan1 mesh join apmanpoc freq 2412'
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
