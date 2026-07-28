#!/usr/bin/env bash
# smartglass-simulation 배포 스크립트
# install.sh(클론 ~ .env 준비) 이후, .env에 실제 키가 채워진 상태에서 실행한다.
# 프론트 프로덕션 빌드 + backend/frontend systemd 서비스 등록까지 진행한다.
# 재실행해도 안전하다 (systemd 유닛/패키지는 있으면 건너뛰고, 서비스는 restart).
#
# Cloudflare 터널(HTTPS, LB 앞단)은 기본적으로 꺼져 있다. 파일 맨 아래
# "[선택] Cloudflare 터널" 블록 참고 — 서버가 여러 대(LB 뒤)인 구성에서는
# 그 중 "한 서버에서만" 주석을 풀어야 한다.
set -euo pipefail

REPO_DIR="/root/smartglass-simulation"
SYSTEMD_DIR="/etc/systemd/system"
LB_HOSTNAME="soboro-navben-lb-143639728-e5cc7e8ce00f.kr.lb.naverncp.com"

if [ ! -f "$REPO_DIR/server/.env" ] || grep -q "=$" "$REPO_DIR/server/.env"; then
  echo "!! server/.env에 빈 값이 있습니다. 키를 먼저 채워 넣으세요." >&2
  exit 1
fi

echo "==> [1/4] 백엔드 파이썬 의존성 동기화 (requirements.txt가 install.sh 실행 이후 바뀌었을 수 있음)"
cd "$REPO_DIR/server"
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -q -r requirements.txt
deactivate

echo "==> [2/4] 프론트 프로덕션 빌드"
cd "$REPO_DIR/web"
npm run build

echo "==> [3/4] systemd 유닛 작성 (backend, frontend)"

cat > "$SYSTEMD_DIR/smartglass-backend.service" <<EOF
[Unit]
Description=Smart Glass Simulation - Backend (FastAPI/uvicorn)
After=network.target

[Service]
Type=simple
WorkingDirectory=$REPO_DIR/server
ExecStart=$REPO_DIR/server/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > "$SYSTEMD_DIR/smartglass-frontend.service" <<EOF
[Unit]
Description=Smart Glass Simulation - Frontend (vite preview)
After=network.target

[Service]
Type=simple
WorkingDirectory=$REPO_DIR/web
Environment=PATH=/usr/bin:/usr/local/bin:/bin
ExecStart=/usr/bin/npx vite preview --host 0.0.0.0 --port 80
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

echo "==> [4/4] 서비스 등록 + 기동"
systemctl daemon-reload
systemctl enable --now smartglass-backend smartglass-frontend
# 재실행 시에는 새 빌드/설정을 반영하도록 재시작
systemctl restart smartglass-backend smartglass-frontend

sleep 3
systemctl is-active smartglass-backend smartglass-frontend

backend_health=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health || true)
frontend_status=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:80/ || true)

cat <<EOF

==================================================
배포 완료 (backend/frontend)
  backend  /health  -> HTTP $backend_health
  frontend /        -> HTTP $frontend_status

HTTPS가 필요하면 이 파일 아래쪽 "[선택] Cloudflare 터널" 블록의 주석을
(서버가 여러 대라면 그 중 한 대에서만) 풀고 이 스크립트를 다시 실행하세요.
==================================================
EOF

# ============================================================================
# [선택] Cloudflare 터널 — HTTPS, LB 앞단 (기본 비활성화)
#
# localhost:80이 아니라 "LB 주소"를 가리키므로, LB 뒤에 서버가 여러 대라면
# 이 블록은 그 중 "정확히 한 서버에서만" 켜면 된다. LB가 알아서 나머지
# 서버로 트래픽을 분배해준다. 여러 서버에서 동시에 켜면 서버 대수만큼
# 서로 다른 URL이 따로 생겨서 하나로 안 모인다 (Quick Tunnel은 뜰 때마다
# 새 무작위 URL을 받기 때문).
#
# 이 서버에서 터널을 켜려면: 아래 블록 전체(다음 구분선까지)의 맨 앞 "# "를
# 지우고(주석 해제) 이 스크립트를 다시 실행한다.
# ============================================================================

# echo "==> cloudflared 확인/설치"
# if ! command -v cloudflared >/dev/null 2>&1; then
#   curl -fsSL -o /tmp/cloudflared.deb \
#     https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
#   dpkg -i /tmp/cloudflared.deb
#   rm -f /tmp/cloudflared.deb
# else
#   echo "    이미 설치됨"
# fi
#
# cat > "$SYSTEMD_DIR/smartglass-tunnel.service" <<EOF
# [Unit]
# Description=Smart Glass Simulation - Cloudflare Quick Tunnel (HTTPS for LB, load-balances across backend servers)
# After=network.target
#
# [Service]
# Type=simple
# ExecStart=/usr/bin/cloudflared tunnel --url http://$LB_HOSTNAME --no-autoupdate
# Restart=on-failure
# RestartSec=3
#
# [Install]
# WantedBy=multi-user.target
# EOF
#
# systemctl daemon-reload
# systemctl enable --now smartglass-tunnel
#
# # journalctl -u는 과거 실행 기록까지 다 남아있어서 grep+tail로는 옛날 URL을
# # 잘못 집을 수 있다. 지금 떠 있는 프로세스의 PID로 범위를 좁힌다.
# tunnel_url=""
# tunnel_pid=$(systemctl show -p MainPID --value smartglass-tunnel)
# for _ in $(seq 1 10); do
#   tunnel_url=$(journalctl _PID="$tunnel_pid" --no-pager 2>/dev/null | grep -o "https://[a-z0-9-]*\.trycloudflare\.com" | tail -1)
#   [ -n "$tunnel_url" ] && break
#   sleep 1
# done
#
# echo "tunnel URL -> ${tunnel_url:-'(아직 못 찾음, journalctl -u smartglass-tunnel 확인)'}"
# echo "주의: Quick Tunnel URL은 smartglass-tunnel 재시작 시마다 바뀝니다."
# echo "바뀌면 네이버 지도 콘솔의 Web 서비스 URL도 새 주소로 다시 등록해야 합니다."
# ============================================================================
