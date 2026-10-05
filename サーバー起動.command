#!/bin/bash
# ===== グラント処方ナビ ワンクリック起動 =====
# サーバー + Chrome(debug) + Grant 処方ナビ(localhost) + G-MAX を全部起動
cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "========================================"
echo " グラント処方ナビ 起動中…"
echo "========================================"

# 1) 既存のサーバーを停止 (重複起動防止)
pkill -f "node server.mjs" 2>/dev/null
sleep 1

# 2) サーバー起動 (バックグラウンド)
cd "$ROOT/server"
nohup node server.mjs > /tmp/grant-server.log 2>&1 &
SERVER_PID=$!
echo "✓ 自動化サーバー起動 (pid=$SERVER_PID, log=/tmp/grant-server.log)"

# サーバーの起動を待つ (最大10秒)
for i in {1..10}; do
  if curl -sS --max-time 1 http://127.0.0.1:3333/api/ping > /dev/null 2>&1; then
    echo "✓ サーバー ready (http://localhost:3333/)"
    break
  fi
  sleep 1
done

# 3) Chrome を debug mode で起動 (既に 9222 で動いてたらスキップ)
if curl -sS --max-time 1 http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
  echo "✓ Chrome (debug mode) はすでに起動中"
else
  PROFILE_DIR="$HOME/.skeleton-granteones-dev-profile"
  mkdir -p "$PROFILE_DIR"
  echo "→ Chrome を debug mode で起動"
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=9222 \
    --user-data-dir="$PROFILE_DIR" \
    "http://localhost:3333/" \
    "https://sslgw.jns-asp.jp/granteones/" &
  sleep 2
  echo "✓ Chrome 起動完了"
fi

echo ""
echo "========================================"
echo " 準備完了"
echo "========================================"
echo " 1. Chrome の G-MAX タブでログイン"
echo " 2. Chrome の 処方ナビ タブ (http://localhost:3333/) で処方を開く"
echo " 3. 「G-MAX 注文リスト」→ お客様情報入力 → ボタン"
echo ""
echo " ※ このウィンドウは閉じないでください (サーバー停止します)"
echo " ※ 停止する場合は Ctrl+C"
echo ""

# サーバープロセスを foreground で待つ (ウィンドウ閉じたらkillされる)
wait $SERVER_PID
