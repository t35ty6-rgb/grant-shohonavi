#!/bin/bash
# G-MAX開発用: Chromeをデバッグポート付きで起動
# 普段のChromeとは別プロファイルを使う (既存のタブ・履歴を汚さない)
echo "=== G-MAX開発用 Chrome 起動 ==="
echo "この窓は開いたままにしてください"
echo ""
echo "起動後の手順:"
echo "  1. 開いたChromeで https://sslgw.jns-asp.jp/granteones/ を開く"
echo "  2. G-MAXにログイン"
echo "  3. Jobsに「ログインできた」と伝える"
echo ""

PROFILE_DIR="$HOME/.skeleton-granteones-dev-profile"
mkdir -p "$PROFILE_DIR"

/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$PROFILE_DIR" \
  "https://sslgw.jns-asp.jp/granteones/"
