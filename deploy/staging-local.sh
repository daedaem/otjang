#!/usr/bin/env bash
# 운영과 같은 구성(Docker 이미지, 데이터 볼륨, Litestream 백업, 터널 컨테이너)을 이 PC에서 켜요. 도메인 없이 임시 주소를 씁니다.
#   bash deploy/staging-local.sh          # 켜기(처음이면 .env.staging을 만들어요)
#   bash deploy/staging-local.sh url      # 휴대폰 주소 다시 보기
#   bash deploy/staging-local.sh logs     # 서버 기록 보기
#   bash deploy/staging-local.sh down     # 끄기(데이터는 남음)
#   bash deploy/staging-local.sh reset    # 끄고 시험 데이터·백업까지 지우기
# 실제 운영(eoul)과 프로젝트 이름·포트·내부 네트워크·백업 폴더를 따로 써서 같은 PC에서 함께 켜도 섞이지 않아요.
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=.env.staging
compose() { docker compose -p eoul-staging --env-file "$ENV_FILE" -f docker-compose.yml -f docker-compose.quick.yml "$@"; }

docker info >/dev/null 2>&1 || { echo "Docker가 켜져 있지 않아요. Docker Desktop을 켠 뒤 다시 실행해 주세요."; exit 1; }

if [ ! -f "$ENV_FILE" ]; then
  INVITE="stage-$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
  sed -e "s/^EOUL_INVITE_CODE=.*/EOUL_INVITE_CODE=$INVITE/" \
      -e "s/^EOUL_COMMUNITY=.*/EOUL_COMMUNITY=on/" \
      -e "s/^EOUL_COMMUNITY_CONTACT=.*/EOUL_COMMUNITY_CONTACT=test@example.com/" \
      -e "s/^EOUL_OPERATOR_NAME=.*/EOUL_OPERATOR_NAME=어울(시험 운영)/" \
      -e "s#^EOUL_BACKUP_DIR=.*#EOUL_BACKUP_DIR=./backups-staging#" \
      -e "s/^EOUL_LOCAL_PORT=.*/EOUL_LOCAL_PORT=8788/" \
      -e "s#^EOUL_EDGE_SUBNET=.*#EOUL_EDGE_SUBNET=172.31.88.0/24#" \
      -e "s#^EOUL_EDGE_AUTO_RANGE=.*#EOUL_EDGE_AUTO_RANGE=172.31.88.128/25#" \
      -e "s/^EOUL_TUNNEL_ADDRESS=.*/EOUL_TUNNEL_ADDRESS=172.31.88.10/" \
      .env.example > "$ENV_FILE"
  printf '\n# 이 파일을 env_file로도 씁니다(staging-local.sh가 만듦).\nEOUL_ENV_FILE=%s\n' "$ENV_FILE" >> "$ENV_FILE"
  echo "시험 운영 설정을 만들었어요: deploy/$ENV_FILE"
fi
INVITE="$(grep -E '^EOUL_INVITE_CODE=' "$ENV_FILE" | cut -d= -f2-)"
PORT="$(grep -E '^EOUL_LOCAL_PORT=' "$ENV_FILE" | cut -d= -f2-)"

tunnel_url() { compose logs --no-color tunnel 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | grep -v '^https://api\.' | tail -n 1 || true; }

case "${1:-up}" in
  url) URL="$(tunnel_url)"; echo "${URL:-주소가 아직 없어요. 잠시 뒤 다시 해 보세요.}"; exit 0 ;;
  logs) compose logs -f --tail 100 eoul; exit 0 ;;
  down) compose down; echo "껐어요. 데이터는 남아 있어요(다시 켜기: bash deploy/staging-local.sh)."; exit 0 ;;
  reset)
    compose down -v
    rm -rf backups-staging
    echo "시험 데이터와 백업을 지웠어요. 설정 파일(deploy/$ENV_FILE)은 남겨 두었어요."
    exit 0 ;;
  up) ;;
  *) sed -n 2,8p "$0"; exit 1 ;;
esac

echo "운영과 같은 구성으로 켜는 중이에요(처음에는 이미지를 만드느라 몇 분 걸려요)…"
compose up -d --build
for _ in $(seq 1 60); do
  [ "$(compose ps --format '{{.Health}}' eoul 2>/dev/null)" = "healthy" ] && break
  sleep 2
done
[ "$(compose ps --format '{{.Health}}' eoul 2>/dev/null)" = "healthy" ] || { echo "서버가 준비되지 않았어요."; compose logs --tail 30 eoul; exit 1; }

URL=""
for _ in $(seq 1 60); do
  URL="$(tunnel_url)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "휴대폰 주소를 만들지 못했어요."; compose logs --tail 30 tunnel; exit 1; }

echo
echo "=================================================================="
echo "  휴대폰에서 여세요:  $URL"
echo "  이 PC에서 여세요:   http://localhost:$PORT"
echo "  가입할 때 초대 코드: $INVITE"
echo "------------------------------------------------------------------"
echo "  운영과 같은 것: Docker 이미지, 데이터 볼륨, 자동 백업(deploy/backups-staging),"
echo "                  터널 컨테이너, 방문자 주소 처리"
echo "  운영과 다른 것: 주소가 임시(다시 켜면 바뀜), 시험용 설정(deploy/$ENV_FILE)"
echo "------------------------------------------------------------------"
echo "  상태 보기:  docker compose -p eoul-staging ps"
echo "  주소 다시 보기: bash deploy/staging-local.sh url"
echo "  끄기:       bash deploy/staging-local.sh down"
echo "=================================================================="
