#!/usr/bin/env bash
set -e

# 创建下载目标目录（集中存放在 public/browsers）
DEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/browsers"
mkdir -p "$DEST_DIR"

echo "=== 开始拉取离线浏览器安装包至本地目录: $DEST_DIR ==="

# 1. Chrome for macOS (Universal / arm64 & x86_64)
CHROME_MAC_URL="https://dl.google.com/chrome/mac/stable/GGRO/googlechrome.dmg"
CHROME_MAC_FILE="$DEST_DIR/googlechrome.dmg"
if [ ! -s "$CHROME_MAC_FILE" ]; then
  echo "--> 正在下载 Chrome for Mac..."
  curl -L -f --progress-bar "$CHROME_MAC_URL" -o "$CHROME_MAC_FILE"
else
  echo "--> Chrome for Mac 已存在 ($(du -h "$CHROME_MAC_FILE" | cut -f1))，跳过。"
fi

# 2. Chrome Standalone for Windows 64-bit
CHROME_WIN_URL="https://dl.google.com/tag/s/appguid%3D%7B8A69D345-D564-463C-AFF1-A69D9E530F96%7D%26iid%3D%7B00000000-0000-0000-0000-000000000000%7D%26lang%3Dzh-CN%26browser%3D4%26usagestats%3D0%26appname%3DGoogle%2520Chrome%26needsadmin%3Dprefers%26ap%3Dx64-stable-statsdef_1%26installdataindex%3Dempty/update2/installers/ChromeStandaloneSetup64.exe"
CHROME_WIN_FILE="$DEST_DIR/ChromeStandaloneSetup64.exe"
if [ ! -s "$CHROME_WIN_FILE" ]; then
  echo "--> 正在下载 Chrome for Windows 64位独立完整安装包..."
  curl -L -f --progress-bar "$CHROME_WIN_URL" -o "$CHROME_WIN_FILE"
else
  echo "--> Chrome for Windows 已存在 ($(du -h "$CHROME_WIN_FILE" | cut -f1))，跳过。"
fi

# 3. Chrome for Linux (deb & rpm)
CHROME_DEB_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb"
CHROME_DEB_FILE="$DEST_DIR/google-chrome-stable_current_amd64.deb"
if [ ! -s "$CHROME_DEB_FILE" ]; then
  echo "--> 正在下载 Chrome for Linux (.deb)..."
  curl -L -f --progress-bar "$CHROME_DEB_URL" -o "$CHROME_DEB_FILE"
else
  echo "--> Chrome for Linux (.deb) 已存在 ($(du -h "$CHROME_DEB_FILE" | cut -f1))，跳过。"
fi

CHROME_RPM_URL="https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm"
CHROME_RPM_FILE="$DEST_DIR/google-chrome-stable_current_x86_64.rpm"
if [ ! -s "$CHROME_RPM_FILE" ]; then
  echo "--> 正在下载 Chrome for Linux (.rpm)..."
  curl -L -f --progress-bar "$CHROME_RPM_URL" -o "$CHROME_RPM_FILE"
else
  echo "--> Chrome for Linux (.rpm) 已存在 ($(du -h "$CHROME_RPM_FILE" | cut -f1))，跳过。"
fi

# 4. Microsoft Edge for Windows
EDGE_WIN_URL="https://c2rsetup.officeapps.live.com/c2r/downloadEdge.aspx?platform=Default&Channel=Stable&language=zh-cn"
EDGE_WIN_FILE="$DEST_DIR/MicrosoftEdgeSetup.exe"
if [ ! -s "$EDGE_WIN_FILE" ]; then
  echo "--> 正在下载 Microsoft Edge for Windows 安装包..."
  curl -L -f --progress-bar "$EDGE_WIN_URL" -o "$EDGE_WIN_FILE"
else
  echo "--> Edge for Windows 已存在 ($(du -h "$EDGE_WIN_FILE" | cut -f1))，跳过。"
fi

# 5. Microsoft Edge for Mac
EDGE_MAC_URL="https://c2rsetup.officeapps.live.com/c2r/downloadEdge.aspx?platform=Mac&Channel=Stable&language=zh-cn"
EDGE_MAC_FILE="$DEST_DIR/MicrosoftEdge.pkg"
if [ ! -s "$EDGE_MAC_FILE" ]; then
  echo "--> 正在下载 Microsoft Edge for Mac 安装包..."
  curl -L -f --progress-bar "$EDGE_MAC_URL" -o "$EDGE_MAC_FILE"
else
  echo "--> Edge for Mac 已存在 ($(du -h "$EDGE_MAC_FILE" | cut -f1))，跳过。"
fi

# 6. Firefox for Windows 64-bit
FIREFOX_WIN_URL="https://download.mozilla.org/?product=firefox-latest-ssl&os=win64&lang=zh-CN"
FIREFOX_WIN_FILE="$DEST_DIR/Firefox-Setup.exe"
if [ ! -s "$FIREFOX_WIN_FILE" ]; then
  echo "--> 正在下载 Firefox for Windows 64位安装包..."
  curl -L -f --progress-bar "$FIREFOX_WIN_URL" -o "$FIREFOX_WIN_FILE"
else
  echo "--> Firefox for Windows 已存在 ($(du -h "$FIREFOX_WIN_FILE" | cut -f1))，跳过。"
fi

# 7. Firefox for Mac
FIREFOX_MAC_URL="https://download.mozilla.org/?product=firefox-latest-ssl&os=osx&lang=zh-CN"
FIREFOX_MAC_FILE="$DEST_DIR/Firefox.dmg"
if [ ! -s "$FIREFOX_MAC_FILE" ]; then
  echo "--> 正在下载 Firefox for Mac 安装包..."
  curl -L -f --progress-bar "$FIREFOX_MAC_URL" -o "$FIREFOX_MAC_FILE"
else
  echo "--> Firefox for Mac 已存在 ($(du -h "$FIREFOX_MAC_FILE" | cut -f1))，跳过。"
fi

# 8. Firefox for Linux (tar.xz)
FIREFOX_LINUX_URL="https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=zh-CN"
FIREFOX_LINUX_FILE="$DEST_DIR/firefox.tar.xz"
if [ ! -s "$FIREFOX_LINUX_FILE" ]; then
  echo "--> 正在下载 Firefox for Linux 压缩包..."
  curl -L -f --progress-bar "$FIREFOX_LINUX_URL" -o "$FIREFOX_LINUX_FILE"
else
  echo "--> Firefox for Linux 已存在 ($(du -h "$FIREFOX_LINUX_FILE" | cut -f1))，跳过。"
fi

# 9. Microsoft Edge for Linux（.deb / .rpm）
# 微软未提供固定文件名的直链，先从稳定版软件源目录解析当前版本号，再拼出两种包地址
EDGE_POOL_URL="https://packages.microsoft.com/repos/edge/pool/main/m/microsoft-edge-stable/"
EDGE_DEB_NAME="$(curl -fsSL -A 'Mozilla/5.0' "$EDGE_POOL_URL" \
  | grep -oE 'microsoft-edge-stable_[0-9.]+-1_amd64\.deb' | sort -uV | tail -n 1)"

if [ -z "$EDGE_DEB_NAME" ]; then
  echo "!! 未能从微软软件源解析 Edge 当前版本，已跳过 Edge Linux 安装包（可稍后重跑本脚本）。" >&2
else
  EDGE_VER="${EDGE_DEB_NAME#microsoft-edge-stable_}"
  EDGE_VER="${EDGE_VER%-1_amd64.deb}"

  EDGE_DEB_FILE="$DEST_DIR/microsoft-edge-stable.deb"
  if [ ! -s "$EDGE_DEB_FILE" ]; then
    echo "--> 正在下载 Microsoft Edge for Linux (.deb, $EDGE_VER)..."
    curl -L -f --progress-bar "${EDGE_POOL_URL}${EDGE_DEB_NAME}" -o "$EDGE_DEB_FILE"
  else
    echo "--> Microsoft Edge for Linux (.deb) 已存在 ($(du -h "$EDGE_DEB_FILE" | cut -f1))，跳过。"
  fi

  EDGE_RPM_FILE="$DEST_DIR/microsoft-edge-stable.rpm"
  if [ ! -s "$EDGE_RPM_FILE" ]; then
    echo "--> 正在下载 Microsoft Edge for Linux (.rpm, $EDGE_VER)..."
    curl -L -f --progress-bar \
      "https://packages.microsoft.com/yumrepos/edge/microsoft-edge-stable-${EDGE_VER}-1.x86_64.rpm" \
      -o "$EDGE_RPM_FILE"
  else
    echo "--> Microsoft Edge for Linux (.rpm) 已存在 ($(du -h "$EDGE_RPM_FILE" | cut -f1))，跳过。"
  fi
fi

# 10. 360 极速浏览器（Windows 与 macOS）
# Windows 安装包有固定别名，始终指向当前版本
CSE_WIN_URL="https://sedl.360tpcdn.com/cse/360csex_setup.exe"
CSE_WIN_FILE="$DEST_DIR/360csex_setup.exe"
if [ ! -s "$CSE_WIN_FILE" ]; then
  echo "--> 正在下载 360 极速浏览器 for Windows..."
  curl -L -f --progress-bar "$CSE_WIN_URL" -o "$CSE_WIN_FILE"
else
  echo "--> 360 极速浏览器 for Windows 已存在 ($(du -h "$CSE_WIN_FILE" | cut -f1))，跳过。"
fi

# macOS 安装包文件名带版本号，先从下载页解析当前版本再拼包地址（Intel 与 Apple 芯片各一个）
CSE_MAC_PAGE="https://browser.360.cn/ee/mac/index.html"
CSE_MAC_LIST="$(curl -fsSL -A 'Mozilla/5.0' "$CSE_MAC_PAGE" || true)"
CSE_MAC_INTEL_NAME="$(printf '%s' "$CSE_MAC_LIST" \
  | grep -oE '360Browser_for_mac_[0-9]+\.[0-9.]*\.pkg' | sort -uV | tail -n 1 || true)"
CSE_MAC_ARM_NAME="$(printf '%s' "$CSE_MAC_LIST" \
  | grep -oE '360Browser_for_mac_arm_[0-9]+\.[0-9.]*\.pkg' | sort -uV | tail -n 1 || true)"

CSE_MAC_INTEL_FILE="$DEST_DIR/360Browser_for_mac.pkg"
if [ -s "$CSE_MAC_INTEL_FILE" ]; then
  echo "--> 360 极速浏览器 for Mac (Intel) 已存在 ($(du -h "$CSE_MAC_INTEL_FILE" | cut -f1))，跳过。"
elif [ -n "$CSE_MAC_INTEL_NAME" ]; then
  echo "--> 正在下载 360 极速浏览器 for Mac (Intel, $CSE_MAC_INTEL_NAME)..."
  curl -L -f --progress-bar "https://sedl.360tpcdn.com/cse/${CSE_MAC_INTEL_NAME}" -o "$CSE_MAC_INTEL_FILE"
else
  echo "!! 未能从 360 下载页解析 Intel 版安装包地址，已跳过（可稍后重跑本脚本）。" >&2
fi

CSE_MAC_ARM_FILE="$DEST_DIR/360Browser_for_mac_arm.pkg"
if [ -s "$CSE_MAC_ARM_FILE" ]; then
  echo "--> 360 极速浏览器 for Mac (Apple 芯片) 已存在 ($(du -h "$CSE_MAC_ARM_FILE" | cut -f1))，跳过。"
elif [ -n "$CSE_MAC_ARM_NAME" ]; then
  echo "--> 正在下载 360 极速浏览器 for Mac (Apple 芯片, $CSE_MAC_ARM_NAME)..."
  curl -L -f --progress-bar "https://sedl.360tpcdn.com/cse/${CSE_MAC_ARM_NAME}" -o "$CSE_MAC_ARM_FILE"
else
  echo "!! 未能从 360 下载页解析 Apple 芯片安装包地址，已跳过（可稍后重跑本脚本）。" >&2
fi

echo "=== 下载与检查完成！当前 public/browsers 目录: ==="
ls -lh "$DEST_DIR"
