# apman-openwrt

Per-device user management for an OpenWrt access point (bridge mode), built
for the Xiaomi Mi Router 4A Gigabit Edition (v1, 16MB flash).

- Per-device download/upload speed caps, wifi clients only
- Daily and monthly wifi usage caps per device (0 = off), released
  automatically when the day or month rolls over
- Pause (timed) and block, wired and wireless
- Live speeds per device
- Persistent daily wifi traffic history
- Dark LuCI dashboard: Services -> AP Manager

Everything runs on the router. Speed caps, usage caps and accounting
use nftables bridge-family rules on `br-lan`, scoped to the wifi
bridge ports (the bridge ports backed by a `phy80211` radio): wired
clients are never rate-limited and their traffic is never counted.
Block and pause still stop wired and wifi traffic alike. The uplink
may be a cable or a wifi extender, that never matters. Footprint:
~70KB (package 17KB compressed + 6.4KB `kmod-nft-bridge`).

## Repository contents

| Path | What it is |
| --- | --- |
| `luci-app-apman/` | The OpenWrt package source (Makefile + files) |
| `dist/luci-app-apman-1.0.0-r3.apk` | Prebuilt package for mipsel_24kc (OpenWrt 25.12) |
| `FLASHING.md` | Exact flashing steps: Windows and Linux VM with NAT |
| `INSTALL.md` | Package install, usage and configuration reference |
| `test/e2e-harness.sh` | Host E2E harness: hwsim wifi + wired fixture, 38 checks |

## Quick start

1. Flash OpenWrt 25.12.6 on the router: see [FLASHING.md](FLASHING.md).
2. Install the package:

   ```sh
   scp -O dist/luci-app-apman-1.0.0-r3.apk root@192.168.1.1:/tmp/
   ssh root@192.168.1.1
   apk add kmod-nft-bridge
   apk add /tmp/luci-app-apman-1.0.0-r3.apk
   /etc/init.d/apman enable
   /etc/init.d/apman start
   ```

3. Open LuCI -> Services -> AP Manager.

Details and all rpc methods: [INSTALL.md](INSTALL.md).

## Building from source

Uses the official OpenWrt SDK (no toolchain build needed, `PKGARCH:=all`):

```sh
# 1. Get the SDK for this target
curl -LO https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/openwrt-sdk-25.12.6-ramips-mt7621_gcc-14.3.0_musl.Linux-x86_64.tar.xz
tar xf openwrt-sdk-*.tar.xz && cd openwrt-sdk-*

# 2. Drop the package in
cp -r /path/to/this/repo/luci-app-apman package/

# 3. Seed config and build
printf 'CONFIG_PACKAGE_luci-app-apman=y\n' > .config
make defconfig
make package/luci-app-apman/compile

# 4. Result
ls bin/packages/mipsel_24kc/base/luci-app-apman-1.0.0-r3.apk
```

Host prerequisite: `apt-get install libncurses-dev`.

## License

MIT.
