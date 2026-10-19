include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-apman
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_MAINTAINER:=Ali

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-apman
  SECTION:=luci
  CATEGORY:=LuCI
  SUBCATEGORY:=Applications
  TITLE:=AP Manager - per-device bandwidth caps, pause and traffic history
  DEPENDS:=+luci-base +kmod-nft-bridge +nftables-json
  PKGARCH:=all
endef

define Package/luci-app-apman/description
  User management for an OpenWrt access point (bridge mode), built for
  the Xiaomi Mi Router 4A Gigabit. Per-device download/upload caps,
  pause and block, live speeds and persistent traffic history behind
  a dark LuCI dashboard. Enforcement and accounting use nftables
  bridge-family rules on br-lan, so wired and wifi clients are treated
  identically and nothing depends on which port carries the uplink.
  Requires ~70KB on top of the base image (plus kmod-nft-bridge).
endef

define Package/luci-app-apman/conffiles
/etc/config/apman
/etc/apman/daily.tsv
endef

# arch-independent: nothing to compile
define Build/Compile
endef

define Package/luci-app-apman/install
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/etc/config/apman $(1)/etc/config/apman

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/etc/init.d/apman $(1)/etc/init.d/apman

	$(INSTALL_DIR) $(1)/etc/apman
	$(INSTALL_DATA) ./files/etc/apman/daily.tsv $(1)/etc/apman/daily.tsv

	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./files/usr/sbin/apman-apply $(1)/usr/sbin/apman-apply
	$(INSTALL_BIN) ./files/usr/sbin/apman-collect $(1)/usr/sbin/apman-collect

	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./files/usr/libexec/rpcd/apman $(1)/usr/libexec/rpcd/apman

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/usr/share/luci/menu.d/luci-app-apman.json $(1)/usr/share/luci/menu.d/luci-app-apman.json

	$(INSTALL_DIR) $(1)/usr/share/luci/acl.d
	$(INSTALL_DATA) ./files/usr/share/luci/acl.d/luci-app-apman.json $(1)/usr/share/luci/acl.d/luci-app-apman.json

	$(INSTALL_DIR) $(1)/usr/share/luci/view/apman
	$(INSTALL_DATA) ./files/usr/share/luci/view/apman/overview.js $(1)/usr/share/luci/view/apman/overview.js
endef

$(eval $(call BuildPackage,luci-app-apman))
