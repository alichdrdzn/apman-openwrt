# Installing and using AP Manager

Prerequisite: the router runs OpenWrt (see `FLASHING.md`). Everything
below runs on the router itself; no extra hardware.

## Install

Copy the package to the router, then (as root):

```sh
apk add kmod-nft-bridge
apk add /tmp/luci-app-apman-1.0.0-r2.apk
/etc/init.d/apman enable
/etc/init.d/apman start
```

`kmod-nft-bridge` is the only dependency that is not already in the base
image (6.4KB). If the router has internet, `apk add kmod-nft-bridge`
pulls it from OpenWrt's own repository; otherwise download the file from

```
https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/kmods/6.12.112-1-aa81475ddbdbcc69877f69037ae40cd8/
```

on a PC and scp it over the same way as the package.

Then open LuCI -> Services -> AP Manager.

Size: package 17KB compressed, ~53KB installed, total footprint ~70KB.

## Using it

- **Not managed**: devices seen on the network that are not adopted yet.
  Press *Adopt*, give the device a name.
- **Devices**: one card per adopted device with:
  - live download/upload speed (updates every few seconds),
  - today's usage,
  - its download and upload cap,
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
  - MACs to hide from the device list.

## How it works

| Path | Purpose |
| --- | --- |
| `/usr/sbin/apman-apply` | uci -> nftables rules, atomic whole-table regeneration, counter preserving |
| `/usr/sbin/apman-collect` | samples counters, computes speeds and usage, writes `/tmp/apman/status.json`, rolls usage into `/etc/apman/daily.tsv` |
| `/usr/libexec/rpcd/apman` | ubus object `apman` (backend for the UI) |
| `/usr/share/luci/view/apman/overview.js` | the dashboard view |
| `/etc/config/apman` | settings + one section per device (survives sysupgrades) |
| `/etc/apman/daily.tsv` | daily usage history (survives sysupgrades) |

Runtime data lives in `/tmp/apman` (tmpfs: cleared on reboot on purpose,
so flash writes stay minimal). On boot the service re-applies rules from
uci and starts sampling again.

Rules are installed in the nftables **bridge** family on `br-lan`:

- chain order: blocking -> discovery -> rate limiting -> accounting, so
  capped traffic never counts toward usage;
- rate limiting uses `limit rate over ... drop` (no tc, no ifb);
- accounting counts every frame on the bridge, skipping multicast and
  broadcast; counters survive rule regeneration;
- MAC sets, counters and dynamic discovery are regenerated as one atomic
  nftables transaction (delete table + create) to avoid EBUSY and stale
  entries.

Nothing in it cares which port carries the uplink: wired clients, wifi
clients, cable backhaul or wifi extender all hit the same chains.

## ubus API (for scripting)

```
ubus call apman status        # devices, unknown devices, settings, dhcp names
ubus call apman history       # {"days":{"YYYY-MM-DD":{"<id>":[up,down]}}}
ubus call apman save          # mac, alias, down_kbps, up_kbps, limit_enabled, block
ubus call apman pause         # mac, minutes (0 clears)
ubus call apman unblock       # mac
ubus call apman forget        # mac
ubus call apman adopt         # mac, alias
ubus call apman ignore        # mac (hide from unknown list)
ubus call apman settings      # enabled, interval, history_days, snapshot_minutes, ignored_macs
ubus call apman apply         # re-run apman-apply now
```

## Building

See `README.md` (official SDK, no toolchain build, `PKGARCH:=all`).

## License

MIT.
