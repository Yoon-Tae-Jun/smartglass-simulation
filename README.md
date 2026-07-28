# 개요
여행을 위한 스마트 글래스 시뮬레이션
데모 시 여행지는 서울로 한다.

# 폴더 구조
- /llm
llm 관련 파일

- /rag
rag 관련 파일

- /server
API 서버 관련 파일
각 naver api 호출 기능은 /server/modules에 작성한다.
ex) 네이버 맵 API: /server/modules/map

- /web
프론트엔드 관련 파일


# BRANCH 생성 규칙
이름/역할
예시: hw/ui

# 서버 배포
운영 서버 셋업/배포는 스크립트 2개로 자동화되어 있다. 재실행해도 안전하다(이미 되어있는
단계는 건너뜀).

- `install.sh` — 저장소 클론(또는 git pull), python3/venv·의존성 설치, .env 준비까지.
  `server/.env`, `web/.env`에 키 입력 전까지 진행한다.
- `setup.sh` — `install.sh` 이후, 키를 채운 상태에서 실행. 의존성 재동기화, 프론트
  프로덕션 빌드, backend/frontend systemd 서비스 등록·기동까지 한다. HTTPS(Cloudflare
  터널)는 기본 꺼져 있음 — 서버가 여러 대(LB 뒤)면 파일 하단 안내대로 그중 한 곳에서만 켠다.

```bash
sudo bash install.sh
# server/.env, web/.env 에 키 입력 후
sudo bash setup.sh
```