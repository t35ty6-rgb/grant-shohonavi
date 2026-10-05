#!/bin/bash
# ===== グラント処方ナビ サーバー停止 =====
echo "停止中…"
pkill -f "node server.mjs" 2>/dev/null
pkill -f "cloudflared.*3333" 2>/dev/null
sleep 1
echo "✓ サーバー + Tunnel を停止しました"
echo " (Chrome は閉じていません。手動で閉じてください)"
echo ""
echo "このウィンドウは閉じてOK"
exit 0
