#!/usr/bin/env bash
# smartglass-simulation 서버 셋업 스크립트
# git clone부터 .env 파일 준비(키 주입 전)까지 자동화한다. 재실행해도 안전하게
# 동작하도록 각 단계는 이미 되어 있으면 건너뛴다.
set -euo pipefail

REPO_URL="https://github.com/Yoon-Tae-Jun/smartglass-simulation.git"
REPO_DIR="/root/smartglass-simulation"
NODE_MAJOR_REQUIRED=20

echo "==> [1/5] 저장소 준비"
if [ -d "$REPO_DIR/.git" ]; then
  echo "    이미 클론되어 있음 -> git pull"
  git -C "$REPO_DIR" pull
else
  git clone "$REPO_URL" "$REPO_DIR"
fi

echo "==> [2/5] python3-venv 확인/설치"
if ! python3 -c "import ensurepip" >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y python3-venv
else
  echo "    이미 설치됨"
fi

echo "==> [3/5] server 가상환경 + 의존성 설치"
cd "$REPO_DIR/server"
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
deactivate

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "    server/.env 생성 완료 (키 미입력 상태)"
else
  echo "    server/.env 이미 존재 -> 건드리지 않음"
fi

echo "==> [4/5] Node.js ${NODE_MAJOR_REQUIRED}+ 확인/설치"
node_current_major=0
if command -v node >/dev/null 2>&1; then
  node_current_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
fi
if [ "$node_current_major" -lt "$NODE_MAJOR_REQUIRED" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
  rm -f /tmp/nodesource_setup.sh
else
  echo "    이미 설치됨 ($(node -v))"
fi

echo "==> [5/5] web 의존성 설치"
cd "$REPO_DIR/web"
npm install

cat <<EOF

==================================================
셋업 완료 (.env는 키 미입력 상태, 여기까지만 진행).
다음 단계:
  1. server/.env, web/.env 에 실제 키를 채워 넣는다.
  2. 백엔드 실행: cd server && source .venv/bin/activate && uvicorn main:app --reload
  3. 프론트 실행: cd web && npm run dev
==================================================
EOF
