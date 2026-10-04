#!/bin/bash
cd "$(dirname "$0")/server"
echo "=== グラント処方ナビ 自動化サーバー ==="
echo "起動中... ブラウザを閉じてもこのウィンドウを開いたまま"
echo ""
node server.mjs
