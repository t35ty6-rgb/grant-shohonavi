#!/bin/bash
# ===== グラント処方ナビ ワンクリック起動 =====
# サーバー + Cloudflare Tunnel + Chrome(debug) 全部起動
# Mac mini 常時稼働前提

cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "========================================"
echo " グラント処方ナビ 起動中…"
echo "========================================"

# 1) 既存プロセスを停止
pkill -f "node server.mjs" 2>/dev/null
pkill -f "cloudflared.*3333" 2>/dev/null
sleep 1

# 2) 自動化サーバー起動 (バックグラウンド)
cd "$ROOT/server"
nohup node server.mjs > /tmp/grant-server.log 2>&1 &
SERVER_PID=$!
echo "✓ 自動化サーバー起動 (pid=$SERVER_PID)"

# サーバーの ready 待ち
for i in {1..10}; do
  if curl -sS --max-time 1 http://127.0.0.1:3333/api/ping > /dev/null 2>&1; then
    echo "✓ サーバー ready (http://localhost:3333/)"
    break
  fi
  sleep 1
done

# 3) Cloudflare Tunnel 起動
cd "$ROOT"
nohup cloudflared tunnel --url http://localhost:3333 --no-autoupdate > /tmp/grant-tunnel.log 2>&1 &
TUNNEL_PID=$!
echo "✓ Cloudflare Tunnel 起動 (pid=$TUNNEL_PID)"

# tunnel URL 取得待ち (最大20秒)
TUNNEL_URL=""
for i in {1..20}; do
  TUNNEL_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/grant-tunnel.log 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    echo "✓ Tunnel URL: $TUNNEL_URL"
    break
  fi
  sleep 1
done

# 4) tunnel URL を repo に書いて push (GitHub Pages 側が参照する)
if [ -n "$TUNNEL_URL" ]; then
  echo "$TUNNEL_URL" > "$ROOT/tunnel-url.txt"
  cd "$ROOT"
  if ! git diff --quiet tunnel-url.txt 2>/dev/null; then
    git add tunnel-url.txt > /dev/null 2>&1
    git commit -m "tunnel URL update: $TUNNEL_URL" > /dev/null 2>&1
    git push > /dev/null 2>&1 &
    echo "✓ tunnel-url.txt を GitHub Pages に push (反映 ~1min)"
  else
    echo "✓ tunnel-url.txt は既に最新"
  fi
fi

# 5) Chrome を debug mode で起動
if curl -sS --max-time 1 http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
  echo "✓ Chrome (debug mode) はすでに起動中"
else
  PROFILE_DIR="$HOME/.skeleton-granteones-dev-profile"
  mkdir -p "$PROFILE_DIR"
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=9222 \
    --user-data-dir="$PROFILE_DIR" \
    "http://localhost:3333/" \
    "https://sslgw.jns-asp.jp/granteones/" > /dev/null 2>&1 &
  sleep 2
  echo "✓ Chrome 起動完了 (localhost + G-MAX タブ)"
fi

echo ""
echo "========================================"
echo " 準備完了"
echo "========================================"
echo " ローカル: http://localhost:3333/"
if [ -n "$TUNNEL_URL" ]; then
  echo " 外部:     $TUNNEL_URL/"
  echo " GitHub:   https://t35ty6-rgb.github.io/grant-shohonavi/"
fi
echo ""
echo " [次] Chrome の G-MAX タブでログイン → 処方ナビで処方開く → ボタン"
echo ""
echo " このウィンドウは閉じてOKです (サーバーは裏で動き続けます)"
echo " 止めるときは サーバー停止.command をダブルクリック"
echo ""

# shell から 子プロセスを切り離す (ウィンドウ閉じても動き続ける)
disown -a 2>/dev/null || true
exit 0
