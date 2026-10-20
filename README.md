# apman-openwrt

Per-device user management for an OpenWrt access point (bridge mode).

- Per-device download/upload speed caps, wifi clients only
- Daily and monthly wifi usage caps per device (0 = off), released
  automatically when the day or month rolls over
- Pause (timed) and block, wired and wireless
- Whitelist mode (default deny): only allowed devices reach the internet,
  every other wifi device still joins and reaches the LAN. This is the
  reliable answer to randomised MACs, since a new random MAC is a new
  device and therefore gets no internet until it is allowed
- Live speeds per device
- Persistent daily wifi traffic history
- Dark LuCI dashboard: Services -> AP Manager

Everything runs on the router. Speed caps, usage caps and accounting
use nftables bridge-family rules on the LAN bridge, scoped to the wifi
bridge ports (the bridge ports backed by a `phy80211` radio): wired
clients are never rate-limited and their traffic is never counted.
Block and pause still stop wired and wifi traffic alike.

Whitelist mode keys on the **LAN prefixes the bridge carries**, not on
an address range and not on the gateway. Every frame a wifi client
sends either stays on the LAN (permitted) or leaves it (dropped); DHCP,
ARP, EAPOL, IPv6 link-local and ICMPv6 neighbour discovery stay
permitted so clients keep their address and stay associated. A
bridge-mode AP has no default route, which is exactly why the guard
does not need one. Only ingress on wifi bridge ports is matched, so
wired clients are never affected. If the bridge has no IPv4 address the
guard stays off rather than locking every wifi client out, and the
collector retries once a minute until it engages. The uplink
may be a cable or a wifi extender, that never matters. Footprint:
~70KB (package 17KB compressed + 6.4KB `kmod-nft-bridge`).

## Which devices does it run on

Any OpenWrt 25.12 or newer device that puts its wifi into a bridge. The
package is `arch: noarch`: shell and JavaScript only, nothing compiled,
so it is not tied to one router, one SoC or one instruction set.

What it actually needs:

- OpenWrt 25.12 or newer (uses `apk`; the LuCI view needs the
  `26.x` LuCI that ships with it)
- wifi clients bridged into a LAN bridge, which is the stock
  configuration of a router or a dumb AP
- the `bridge` nftables family, from `kmod-nft-bridge` (the only
  architecture-specific dependency, and it is the vendor's own package
  for your target, pulled from your own repo)
- `nft`, `uci`, `ip`, `iw` and the usual busybox applets, all already in
  the base image

Developed and tested on a Xiaomi Mi Router 4A Gigabit Edition (v1,
16MB flash, ramips/mt7621), but nothing in the package names that
target. If your device names its bridge something other than `br-lan`,
set it in Settings -> LAN bridge (or `uci set apman.global.bridge=...`).

Two honest limits:

- Routed (non-bridge) wifi setups are not supported. If wifi clients
  sit on their own subnet behind the AP, the wifi ports are not bridge
  ports and the package will not find them. This is a bridge-mode tool.
- The prebuilt `.apk` in `dist/` is `noarch` and installs on any target,
  but its dependency resolution needs `kmod-nft-bridge` for your own
  kernel. On a device without internet access, install that kmod from
  your target's kmods folder first (see INSTALL.md).

## Repository contents

| Path | What it is |
| --- | --- |
| `luci-app-apman/` | The OpenWrt package source (Makefile + files) |
| `dist/luci-app-apman-1.0.0-r10.apk` | Prebuilt package (`noarch`, OpenWrt 25.12) |
| `INSTALL.md` | Package install, usage and configuration reference |
| `test/e2e-harness.sh` | Host E2E harness: hwsim wifi + wired fixture, 75 checks |

## Quick start

1. Flash OpenWrt on the router. Follow the official guide for your
   device at <https://openwrt.org/toh/start>, and for this one in
   particular <https://openwrt.org/toh/xiaomi/mi_router_4a_gigabit>.
   General install notes: <https://openwrt.org/docs/guide-user/installation/generic.flashing>.
2. Copy the package to the router and install it:

   ```sh
   scp -O dist/luci-app-apman-1.0.0-r10.apk root@192.168.1.1:/tmp/
   ssh root@192.168.1.1
   apk add kmod-nft-bridge
   apk add --allow-untrusted /tmp/luci-app-apman-1.0.0-r10.apk
   ```

   `--allow-untrusted` is required because this package is not signed
   with an OpenWrt release key. `kmod-nft-bridge` is signed, so
   `apk add kmod-nft-bridge` needs no flag. Installing the kmod from
   LuCI is covered in INSTALL.md.

3. The post-install script enables and starts the service and reloads
   `rpcd`, so there is nothing else to do.
4. Open LuCI -> Services -> AP Manager.

Details and all rpc methods: [INSTALL.md](INSTALL.md).

## Building from source

Uses the official OpenWrt SDK (no toolchain build needed, `PKGARCH:=all`):

```sh
# 1. Get the SDK for your target (this example: ramips/mt7621)
curl -LO https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/openwrt-sdk-25.12.6-ramips-mt7621_gcc-14.3.0_musl.Linux-x86_64.tar.xz
tar xf openwrt-sdk-*.tar.xz && cd openwrt-sdk-*

# 2. Drop the package in
cp -r /path/to/this/repo/luci-app-apman package/

# 3. Seed config and build
printf 'CONFIG_PACKAGE_luci-app-apman=y\n' > .config
make defconfig
make package/luci-app-apman/compile

# 4. Result (arch is noarch, only the output folder is target-named)
ls bin/packages/*/base/luci-app-apman-1.0.0-r10.apk
```

Host prerequisite: `apt-get install libncurses-dev`.

Because the package is `noarch`, building it with any target's SDK
produces the same package; only the dependency names differ.

## License

MIT.
