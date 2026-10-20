# Installing and using AP Manager

Prerequisite: the router runs OpenWrt 25.12 or newer. For the firmware
itself follow the official documentation for your device, starting at
<https://openwrt.org/toh/start>. For the Xiaomi Mi Router 4A Gigabit
Edition (v1) that this package was developed on, see
<https://openwrt.org/toh/xiaomi/mi_router_4a_gigabit>, and the general
install notes at <https://openwrt.org/docs/guide-user/installation/generic.flashing>.

Everything below runs on the router itself; no extra hardware.

## Install

### 1. The kernel module

`kmod-nft-bridge` is the only dependency that is not already in a stock
image. It is a signed package from OpenWrt's own repository, so install
it from the LuCI interface:

1. Open **System -> Software**.
2. Press **Update lists** once, so the package index is current.
3. Type `kmod-nft-bridge` in the filter box.
4. Press **Install** on that row and confirm.

That pulls the module plus anything it needs from your target's own
repository, which is why no download or file copy is needed.

If the router has no internet access, download
`kmod-nft-bridge-<version>.apk` for your target from
`https://downloads.openwrt.org/releases/25.12.6/targets/<target>/<subtarget>/kmods/<kernel-hash>/`
on a PC, then use the same **System -> Software -> Upload Package**
button to install it. It is a signed package, so the interface installs
it without any extra flag.

### 2. The package

`luci-app-apman` is built locally and is not signed with an OpenWrt
release key, so it needs `--allow-untrusted`. This is the documented
way to install a self-built or externally downloaded `.apk`, see
<https://openwrt.org/docs/guide-user/additional-software/apk>.

```sh
scp -O luci-app-apman-1.0.0-r11.apk root@192.168.1.1:/tmp/
ssh root@192.168.1.1
apk add --allow-untrusted /tmp/luci-app-apman-1.0.0-r11.apk
```

Do not use the LuCI upload button for this file: in 25.12 the package
manager runs `apk` without `--allow-untrusted`, so an unsigned package
fails with `UNTRUSTED signature`
(<https://github.com/openwrt/luci/issues/8482>). The command line is the
supported path.

The post-install script enables and starts the service and reloads
`rpcd` so the `apman` object becomes visible immediately (rpcd only
scans `/usr/libexec/rpcd` on startup; without the reload every UI call
fails with `Object not found`). Nothing else to do.

Then open LuCI -> Services -> AP Manager, and hard-refresh the page
(Ctrl+Shift+R) so the dashboard script is not served from cache.

Size: package 17KB compressed, ~70KB installed, plus 6.4KB for
`kmod-nft-bridge`.

## Using it

- **Not managed**: devices seen on the network that are not adopted yet.
  Press *Adopt*, give the device a name.
- **Devices**: one card per adopted device with:
  - live download/upload speed (updates every few seconds),
  - today's usage,
  - its download and upload cap (wifi only),
  - daily and monthly usage caps in MB (wifi only, 0 = off): the
    device is cut off when it crosses the cap and released again when
    the day or the month rolls over,
  - *Pause* (15 min / 1 h / 4 h / 24 h / custom): traffic drops while
    paused, the device recovers by itself when the time is up,
  - *Block* / *Unblock*: full block, wired and wireless,
  - *Edit*: name, caps, enforcement on/off,
  - *Forget*: remove from the managed list.
- **Traffic history**: daily up/down bars, per device or all devices,
  kept for the configured number of days (default 30).
- **Settings**:
  - enforcement on/off (one switch for all caps),
  - sampling interval,
  - how much history to keep,
  - how often usage counters are written to flash,
  - MACs to hide from the device list,
  - whitelist mode (default deny), see below,
  - the LAN bridge to police (default `br-lan`).

### Whitelist mode

For phones that randomise their MAC: per-device rules stop working,
because every new random MAC looks like a new device. Whitelist mode
inverts the rule instead of chasing MACs.

- On: only allowed devices reach the internet. Every other device can
  still connect to wifi and reach the LAN (printer, NAS, router UI),
  but nothing past it.
- Off: every device may use the internet and you restrict individual
  ones with caps, pause or block.

How to allow a device: adopt it, or leave it adopted. Pausing or
blocking removes it from the allowed set, so it loses internet until it
is released.

The permitted LAN is whatever prefixes the bridge carries, plus DHCP,
ARP, EAPOL, IPv6 link-local and ICMPv6, so a client keeps its lease and
stays associated while its internet is cut. Only wifi ports are
filtered: wired clients always keep full access. If the bridge has no
IPv4 address the guard stays off rather than cutting every wifi client,
and the collector retries once a minute. The settings dialog shows a
warning in that state.

## How it works

| Path | Purpose |
| --- | --- |
| `/usr/sbin/apman-apply` | uci -> nftables rules, atomic whole-table regeneration, counter preserving |
| `/usr/sbin/apman-collect` | samples counters, computes speeds and usage, writes `/tmp/apman/status.json`, rolls usage into `/etc/apman/daily.tsv` |
| `/usr/libexec/rpcd/apman` | ubus object `apman` (backend for the UI) |
| `/www/luci-static/resources/view/apman/overview.js` | the dashboard view (JS asset, served by uhttpd) |
| `/etc/config/apman` | settings + one section per device (survives sysupgrades) |
| `/etc/apman/daily.tsv` | daily usage history (survives sysupgrades) |

Runtime data lives in `/tmp/apman` (tmpfs: cleared on reboot on purpose,
so flash writes stay minimal). On boot the service re-applies rules from
uci and starts sampling again.

Rules are installed in the nftables **bridge** family on the configured
LAN bridge (`br-lan` unless changed):

- wifi port set: bridge ports whose netdev has a `phy80211` radio;
  every speed cap, usage cap and accounting rule is scoped to that set,
  so wired traffic passes untouched;
- upload rules run on the bridge prerouting hook (`iifname` wifi set),
  download rules on the bridge forward hook (`oifname` wifi set);
- chain order: blocking -> whitelist guard -> discovery -> rate
  limiting -> usage cap drop -> accounting, so capped or over-quota
  traffic never counts toward usage;
- blocking and pause are deliberately not wifi-only: they cut both
  wired and wifi for the device;
- the whitelist guard runs at prerouting -200 and matches the bridge's
  own LAN prefixes, so it needs no default route and no gateway MAC;
- rate limiting uses `limit rate over ... drop` (no tc, no ifb);
- the collector compares daily and monthly sums (today's tmpfs sample
  plus the flash history, kept at least 31 days) against each device's
  caps and writes over-quota MACs into an nft set, releasing them at
  the day/month rollover or when usage drops below the cap;
- accounting counts every frame on the wifi ports, skipping multicast
  and broadcast; counters survive rule regeneration;
- MAC sets, counters and dynamic discovery are regenerated as one atomic
  nftables transaction (delete table + create) to avoid EBUSY and stale
  entries.

The uplink side never matters: cable or wifi extender, the same
uplink chains apply. Wired clients are simply outside the wifi set,
so caps and usage accounting never touch them.

If the uplink is itself wifi, it still stays out of the set. A routed
station interface in the `wan` zone is not a bridge port at all. A
bridged mesh or WDS backhaul would be one, so each bridge port is
checked with `iw dev <if> info` and `managed` (station) ports are
excluded: a station joins another network, it does not serve clients.
Mesh and ad-hoc ports stay in, since a mesh AP does serve clients.

## ubus API (for scripting)

```
ubus call apman status        # devices, unknown devices, settings, dhcp names
ubus call apman history       # {"days":{"YYYY-MM-DD":{"<id>":[up,down]}}}
ubus call apman save          # mac, alias, down_kbps, up_kbps, limit_enabled, block,
                              # quota_daily_mb, quota_monthly_mb (omit a key to keep it)
ubus call apman pause         # mac, minutes (0 clears)
ubus call apman unblock       # mac
ubus call apman forget        # mac
ubus call apman adopt         # mac, alias
ubus call apman ignore        # mac (hide from unknown list)
ubus call apman settings      # enabled, interval, history_days, snapshot_minutes,
                              # ignored_macs, whitelist, bridge
ubus call apman apply         # re-run apman-apply now
```

## Troubleshooting

- **`RPC call failed with error -32000: Object not found`**: rpcd has
  not scanned the plugin. Run `/etc/init.d/rpcd reload`. The package
  does this on install, so this only happens if the service was updated
  by hand.
- **Page loads but no devices**: check
  `nft list set bridge apman unknown_up`. If it is empty, no wifi
  client has sent traffic since the rules were loaded.
- **Whitelist on, device still has internet**: run
  `nft list set bridge apman lan4`. Empty means the bridge has no IPv4
  address and the guard is failing open; give the bridge an address.
  Also confirm the bridge name in Settings matches your device.
- **`UNTRUSTED signature` when installing from LuCI**: expected for this
  package, install from the command line with `--allow-untrusted`.

## Building

See `README.md` (official SDK, no toolchain build, `PKGARCH:=all`).

## License

MIT.
