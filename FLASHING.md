# Flashing the Xiaomi Mi Router 4A Gigabit (v1) to OpenWrt 25.12.6

Exact steps, two ways to drive them: from Windows, or from a Linux VM on
your PC with a NAT network. Both work; the differences are called out.

## 0. Before you start

Hardware check:

- Your unit is **v1** (mt7621, 16MB flash, 128MB RAM). Confirm on the
  sticker under the router: model `R4A`, `R4AG` or SKU `DVB42xxGL`.
- If the sticker says **v3** / model **rd05**: it can never run OpenWrt,
  stop here.
- If the sticker says **RB02** / **R4AGV2** (v2): stop and ask, it needs
  a different image.

State check (this decides which chapter you follow):

1. Connect a PC to the router (wifi or cable), then open:
   - `http://192.168.1.1` shows **LuCI** (black/white OpenWrt login)
     -> the router already runs OpenWrt -> go to **chapter 5**.
   - `http://192.168.31.1` or `http://miwifi.com` shows the **Xiaomi
     admin** -> it runs stock firmware -> go to **chapter 2** (Windows)
     or **chapter 3** (VM), then chapter 4.
2. On the Xiaomi admin page note the stock version (bottom of the page,
   e.g. `3.0.24`). Exploit-supported versions: `2.28.62`, `2.28.65`,
   `2.28.132`, `3.0.10`, `3.0.24`, `3.0.27`, `3.2.30`, `3.10.18`.
   Known-bad: `2.30.20`, `3.2.26` -> downgrade first (chapter 6).

Rules that apply everywhere:

- Do the whole procedure from **one machine**, the same one you use to
  log into the Xiaomi admin page. The exploit reuses that login session;
  mixing machines breaks it.
- Use a **wired** connection PC -> router LAN port for flashing.
- If the router is currently configured as AP/repeater with no internet,
  switch it back to gateway mode (WAN cable to the modem) for the
  exploit, or reflash from OpenWrt directly (chapter 5).

## 1. Download and verify the firmware (any environment)

```
URL:    https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/openwrt-25.12.6-ramips-mt7621-xiaomi_mi-router-4a-gigabit-squashfs-sysupgrade.bin
SHA256: 56009dfc5a32fbe9b044d8b5839cccb42ee623361c3852b2e57a75ceaa4c0459
```

Download on the machine you work from:

- Windows (PowerShell):

  ```powershell
  curl.exe -L -o firmware.bin "https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/openwrt-25.12.6-ramips-mt7621-xiaomi_mi-router-4a-gigabit-squashfs-sysupgrade.bin"
  certutil -hashfile firmware.bin SHA256
  ```

  The hash printed by `certutil` must equal the SHA256 above.

- Linux (VM or PC):

  ```sh
  curl -L -o firmware.bin "https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/openwrt-25.12.6-ramips-mt7621-xiaomi_mi-router-4a-gigabit-squashfs-sysupgrade.bin"
  sha256sum firmware.bin
  ```

Keep this file; chapter 4 puts it on the router and flashes it.

## 2. Getting root on stock, FROM WINDOWS

The exploit script (`OpenWRTInvasion`) only runs on Linux/Mac, so on
Windows it runs inside Docker. Docker Desktop does that natively.

### 2.1 Prerequisites

- Docker Desktop installed (needs version **4.34 or newer** for
  `--network host` on Windows; `docker version` to check, update if old).
- Wired connection to the router LAN.

### 2.2 Run the exploit

Open PowerShell:

```powershell
docker build -t openwrtinvasion https://github.com/acecilia/OpenWRTInvasion.git
docker run --network host -it openwrtinvasion
```

If Windows Firewall or SmartScreen asks, **allow** it (choose Private
networks). The router must be able to reach the container: that is the
whole point of `--network host`, and it only works if the firewall lets
it through.

Answer the prompts:

1. `Router IP address [...]`: type `192.168.31.1` and Enter.
2. `Enter router admin password:`: your Xiaomi admin password. The
   script logs in by itself and extracts the `stok` token. If it fails
   with "You need to get the stok manually": log into
   `http://192.168.31.1` in a browser on this same PC, copy the
   `stok=...` value from the address bar, paste it at the prompt (and
   do not log out afterwards).
3. `Which option do you prefer? (default: 1)`: press Enter for `1`
   (local file server).

Wait for:

```
done! Now you can connect to the router using several options: (user: root, password: root)
```

### 2.3 Open a shell on the router

Telnet (simplest; Windows ships the client, enable it once:
Settings -> Apps -> Optional features -> Add a feature -> "Telnet
Client"):

```powershell
telnet 192.168.31.1
```

Login `root`, password `root`.

Or SSH (built-in OpenSSH client, stock dropbear needs the legacy
algorithms):

```powershell
ssh -o KexAlgorithms=+diffie-hellman-group1-sha1 -o HostKeyAlgorithms=+ssh-rsa -c 3des-cbc -o StrictHostKeyChecking=no root@192.168.31.1
```

Continue at **chapter 4**.

If `docker run` errors with `network host not supported` or the router
never fetches the files: update Docker Desktop, or use the VM procedure
(chapter 3) instead.

## 3. Getting root on stock, FROM A LINUX VM (NAT network)

Any distro (Ubuntu/Debian shown). The VM already reaches the device
through NAT, which is enough for everything the script sends itself. The
one thing NAT breaks is the callback described below, so read 3.3.

### 3.1 Run the exploit

```sh
sudo apt update && sudo apt install -y python3 python3-pip git
git clone https://github.com/acecilia/OpenWRTInvasion.git
cd OpenWRTInvasion
pip3 install -r requirements.txt      # (use: python3 -m pip install ...)
python3 remote_command_execution_vulnerability.py
```

Prompts:

1. `Router IP address [...]`: `192.168.31.1` + Enter.
2. `Enter router admin password:`: your Xiaomi admin password (the
   script derives the `stok` itself; manual-stok fallback as in 2.2).
3. `Which option do you prefer?` -> see 3.3 first.

### 3.2 Why your NAT VM needs a choice here

The script offers two ways to hand its files to the router:

- **Option 1** starts a file server on the machine running the script
  and makes the router pull from it on a random port.
- **Option 2** makes the router download the files from GitHub itself
  (needs internet on the router).

Under NAT the router does not see your VM, it sees your PC's IP, and
nothing listens on your PC's random port. So under NAT, option 1 always
fails.

### 3.3 The exact decision at the prompt

```
Does the router have internet right now?  (test: browse any website
from a PC that is connected through this router)
│
├─ YES -> answer "2"  (router pulls the files from GitHub; NAT is fine)
│
└─ NO  -> shut the VM down, in VM settings change the NIC to
          "Bridged Adapter", start it again, re-run the script and
          answer "1"  (bridged gives the VM a real LAN IP, so the
          callback reaches it)
```

Same-IP rule: under NAT your browser and the script both appear as your
PC's IP, so that requirement is satisfied automatically. If you switch
to bridged, log into the Xiaomi admin from the same VM too.

### 3.4 Open a shell on the router

```sh
telnet 192.168.31.1          # login root / root
# or, if telnet is missing in the VM: sudo apt install -y telnet
# or ssh with legacy algorithms:
ssh -o KexAlgorithms=+diffie-hellman-group1-sha1 -o HostKeyAlgorithms=+ssh-rsa -c 3des-cbc -o StrictHostKeyChecking=no root@192.168.31.1
```

Continue at **chapter 4**.

## 4. Put the image on the router and flash (both environments)

All commands run **inside the router shell** (telnet/ssh from chapter
2.3 or 3.4).

### 4.1 Get firmware.bin onto the router

Pick whichever matches your situation:

**A. Router has internet** (you chose option 2):

```sh
cd /tmp
curl -L -o firmware.bin "https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/openwrt-25.12.6-ramips-mt7621-xiaomi_mi-router-4a-gigabit-squashfs-sysupgrade.bin"
```

**B. Router has no internet** (you chose option 1): the exploit also
starts an FTP server on the router (port 21, `root`/`root`, writable).
Upload from the machine you work on, where `firmware.bin` from chapter 1
sits:

- Windows (PowerShell):

  ```powershell
  curl.exe -u root:root -T firmware.bin "ftp://192.168.31.1/tmp/firmware.bin"
  ```

  (no curl.exe? built into Windows 10 1803+; or use the old client:
  `ftp 192.168.31.1`, login `root`/`root`, then `binary`, `lcd`,
  `put firmware.bin`, `bye`.)

- Linux VM:

  ```sh
  curl -u root:root -T firmware.bin "ftp://192.168.31.1/tmp/firmware.bin"
  ```

### 4.2 Verify on the router (do not skip)

```sh
cd /tmp
./busybox sha256sum firmware.bin
```

Expected:

```
56009dfc5a32fbe9b044d8b5839cccb42ee623361c3852b2e57a75ceaa4c0459  firmware.bin
```

Anything else: delete and re-download, never flash a wrong file.

### 4.3 Check the flash layout, then flash

```sh
cat /proc/mtd
```

The list **must contain a partition named `OS1`**. If it does not:
**stop**, the flash layout differs from v1 and this command would brick
the router (chapter 6 tells you what to do).

Flash and reboot:

```sh
mtd -e OS1 -r write firmware.bin OS1
```

The router rewrites the firmware and reboots (~2 minutes). The Xiaomi
wifi disappears, OpenWrt comes up.

## 5. If it already runs OpenWrt (no exploit needed)

From the PC or the VM (NAT is fine, everything is outgoing):

**Browser:** LuCI at `http://192.168.1.1` -> System -> Backup / Flash
Firmware -> Firmware image -> upload the `...squashfs-sysupgrade.bin`
from chapter 1 -> uncheck "Keep settings" -> Flash.

**Or CLI:**

```sh
# Linux VM (or Windows 10+ which ships scp/ssh):
scp -O openwrt-25.12.6-ramips-mt7621-xiaomi_mi-router-4a-gigabit-squashfs-sysupgrade.bin root@192.168.1.1:/tmp/
ssh root@192.168.1.1 "sysupgrade -n /tmp/openwrt-25.12.6-ramips-mt7621-xiaomi_mi-router-4a-gigabit-squashfs-sysupgrade.bin"
```

(`-O` forces the classic scp protocol that OpenWrt speaks; drop the flag
only if your scp is old enough to not know it.)

After the reboot: LuCI at `192.168.1.1`, root, no password -> set one
immediately.

## 6. First boot, then the package

1. PC -> cable into a LAN port, DHCP on, open `http://192.168.1.1`.
2. Set the root password (System -> Administration).
3. Wifi: Network -> Wireless, configure your SSID, bridge it into `lan`.
4. Dumb AP mode: Network -> Interfaces -> `lan`:
   - protocol static IP on your modem's subnet (e.g. `192.168.1.2`) or
     DHCP, but **not** the modem's address;
   - DHCP server on `lan` -> check "Ignore interface" (so this AP never
     serves DHCP and the modem stays the only DHCP/gateway);
   - do not set a WAN interface, the modem remains the gateway.
5. Install the package (internet on the AP simplifies step a):

   ```sh
   apk add kmod-nft-bridge            # a: from OpenWrt's repo
   scp -O luci-app-apman-1.0.0-r3.apk root@192.168.1.1:/tmp/
   ssh root@192.168.1.1
   apk add /tmp/luci-app-apman-1.0.0-r3.apk
   /etc/init.d/apman enable
   /etc/init.d/apman start
   ```

   No internet on the AP: fetch `kmod-nft-bridge-6.12.112-r1.apk` from

   ```
   https://downloads.openwrt.org/releases/25.12.6/targets/ramips/mt7621/kmods/6.12.112-1-aa81475ddbdbcc69877f69037ae40cd8/
   ```

   (on any PC) and scp it over exactly like the package above.

6. Open LuCI -> Services -> AP Manager. Usage: `INSTALL.md`.

## 7. Troubleshooting

**Exploit says firmware not supported / hangs at "start exec
command..."** -> stock version is newer than the exploit supports (or
`2.30.20` / `3.2.26`). Downgrade stock to `3.0.24 INT` first: in the
Xiaomi admin UI open the firmware upgrade page, upload the `.bin`,
upgrade, wait for reboot, then re-run the exploit. Image (both links
verified working):

```
https://github.com/acecilia/OpenWRTInvasion/raw/master/firmwares/stock/miwifi_r4a_all_03233_3.0.24_INT.bin
http://cdn.awsde0-fusion.fds.api.mi-img.com/xiaoqiang/rom/r4a/miwifi_r4a_all_03233_3.0.24_INT.bin
```

**Script finishes but `telnet 192.168.31.1` refuses** -> wait 10s and
retry; re-run the exploit once (it is safe to repeat); make sure you are
on the same machine/network and wired.

**Docker on Windows: `network host` not supported** -> update Docker
Desktop to 4.34+, or do it from the VM (chapter 3), or enable WSL2
mirrored networking (`.wslconfig` -> `[wsl2] networkingMode=mirrored`)
and run the script inside WSL2 instead of Docker.

**Router in AP/repeater mode during the exploit fails** (documented
upstream issue) -> put it in gateway mode (WAN to modem) for flashing.

**`Could not open mtd device: OS1`** -> different flash layout: do not
retry, this is v1-only territory. Identify your version (chapter 0) and
ask before doing anything else.

**Worst case, router does not boot after flashing** -> recovery is
possible: the "MiWiFi Repair" tool on Windows (official, finds the
router in recovery mode and restores stock), then start over. Serial
console / TFTP and community debricking guides are linked from the
OpenWrt wiki page for this device.

## References

- Exploit: https://github.com/acecilia/OpenWRTInvasion
- Device page: https://openwrt.org/toh/xiaomi/xiaomi_mi_router_4a_gigabit_edition
- This package: https://github.com/alichdrdzn/apman-openwrt
