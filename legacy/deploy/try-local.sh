#!/usr/bin/env bash
# 어울을 이 PC에서 켜고, 휴대폰에서 열 https 주소를 만들어요(혼자 시험용, macOS·Linux).
#   bash deploy/try-local.sh           # 휴대폰까지 (Cloudflare 임시 터널)
#   bash deploy/try-local.sh --local   # 이 PC에서만 (http://localhost:8787)
# 시험 데이터는 server/data-try/에 따로 저장돼요. 끝내려면 Ctrl+C.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${EOUL_PORT:-8787}"
LOCAL=0
[ "${1:-}" = "--local" ] && LOCAL=1
DATA="$PWD/server/data-try"
mkdir -p "$DATA"

node_ok() {
  command -v node >/dev/null 2>&1 &&
    node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 13) ? 0 : 1)'
}
if ! node_ok; then
  echo "Node.js 22.13 이상이 필요해요."
  if command -v brew >/dev/null 2>&1; then
    read -r -p "Homebrew로 Node.js 22를 설치할까요? [y/N] " answer
    if [ "$answer" = "y" ]; then
      brew install node@22
      export PATH="$(brew --prefix node@22)/bin:$PATH"
    fi
  fi
  node_ok || { echo "https://nodejs.org 에서 22 LTS를 설치한 뒤 다시 실행해 주세요."; exit 1; }
fi

if [ "$LOCAL" = 0 ] && ! command -v cloudflared >/dev/null 2>&1; then
  echo "휴대폰용 https 주소를 만들려면 cloudflared가 필요해요."
  if command -v brew >/dev/null 2>&1; then
    read -r -p "Homebrew로 cloudflared를 설치할까요? [y/N] " answer
    [ "$answer" = "y" ] && brew install cloudflared
  fi
  command -v cloudflared >/dev/null 2>&1 || {
    echo "설치 안내: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
    echo "또는 이 PC에서만 열기: bash deploy/try-local.sh --local"
    exit 1
  }
fi

if curl -fsS "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1; then
  echo "포트 $PORT에서 이미 서버가 돌고 있어요. 그 창을 닫거나 EOUL_PORT=8788 bash deploy/try-local.sh 처럼 바꿔 주세요."
  exit 1
fi

INVITE="test-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
export EOUL_DATA_DIR="$DATA" EOUL_PORT="$PORT" EOUL_INVITE_CODE="$INVITE" EOUL_TRUST_PROXY=cloudflare \
  EOUL_COMMUNITY=on EOUL_COMMUNITY_CONTACT=test@example.com

SERVER="" TUNNEL=""
cleanup() {
  [ -n "$TUNNEL" ] && kill "$TUNNEL" 2>/dev/null || true
  [ -n "$SERVER" ] && kill "$SERVER" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "앱을 만들고 서버를 켜는 중이에요…"
node app/tools/build.mjs >/dev/null
node server/index.mjs >"$DATA/server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 40); do
  curl -fsS "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "http://127.0.0.1:$PORT/v1/health" >/dev/null 2>&1 || { echo "서버가 켜지지 않았어요. 기록: $DATA/server.log"; tail -n 20 "$DATA/server.log"; exit 1; }

URL=""
if [ "$LOCAL" = 0 ]; then
  echo "휴대폰용 주소를 만드는 중이에요…"
  cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$DATA/tunnel.log" 2>&1 &
  TUNNEL=$!
  for _ in $(seq 1 60); do
    URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$DATA/tunnel.log" | grep -v '^https://api\.' | head -n 1 || true)"
    [ -n "$URL" ] && break
    sleep 0.5
  done
  [ -n "$URL" ] || { echo "주소를 만들지 못했어요. 기록: $DATA/tunnel.log"; tail -n 20 "$DATA/tunnel.log"; exit 1; }
fi

echo
echo "=================================================================="
[ -n "$URL" ] && echo "  휴대폰에서 여세요:  $URL"
echo "  이 PC에서 여세요:   http://localhost:$PORT"
echo "  가입할 때 초대 코드: $INVITE"
echo "------------------------------------------------------------------"
[ -n "$URL" ] && echo "  · 주소는 켤 때마다 바뀌어요. 휴대폰에서 '계정에 저장'으로 가입해 두면"
[ -n "$URL" ] && echo "    다음에 새 주소에서 로그인해 옷장을 다시 받을 수 있어요."
[ -n "$URL" ] && echo "  · 주소를 아는 사람은 열 수 있어요. 시험이 끝나면 꺼 주세요."
echo "  · 끝내려면 이 창에서 Ctrl+C"
echo "=================================================================="
wait "$SERVER"
