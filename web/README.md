# web — 프론트엔드 / UI

스마트글래스 시뮬레이션의 **웹 프론트엔드**입니다. 웹캠 화면 위에 각종 정보(번역
자막, 길찾기 경로, 환율, 알림)를 오버레이로 띄우고, 현재 어떤 기능이 실행 중인지
UI 상태를 관리합니다.

- **담당:** 최현우 (프론트엔드 / UI)
- **작업 브랜치:** `hw/ui`

## 목차

- [실행 방법](#실행-방법)
- [필요 라이브러리](#필요-라이브러리)
- [담당 기능](#담당-기능)
- [모듈 구조](#모듈-구조)
- [다른 모듈과의 연동](#다른-모듈과의-연동)
- [에셋 출처 (크레딧)](#에셋-출처-크레딧)
- [협업 규칙](#협업-규칙)
- [작성자](#작성자)

## 실행 방법

```bash
cd web
npm install      # 최초 1회 (또는 의존성 변경 시)
npm run dev      # 개발 서버 실행 → http://localhost:5173
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 (HMR 지원) |
| `npm run build` | 프로덕션 빌드 → `dist/` |
| `npm run preview` | 빌드 결과물 로컬 미리보기 |
| `npm run lint` | oxlint 검사 |

> 웹캠을 쓰기 때문에 브라우저가 카메라 권한을 요청합니다. `localhost`는 보안
> 컨텍스트로 취급되어 개발 중에도 `getUserMedia`가 정상 동작합니다.

## 필요 라이브러리

```
# 런타임
react                 # UI 프레임워크 (v19)
react-dom
react-router-dom      # 라우팅 (v7)
three                 # 3D 렌더링 (히어로 포인트 클라우드)
@react-three/fiber    # three.js React 바인딩
@react-three/drei     # three.js 헬퍼 (OrbitControls 등)
tailwindcss           # 스타일 (v4)
@tailwindcss/vite

# 개발
vite                  # 빌드 도구 (v8)
@vitejs/plugin-react
oxlint                # 린터
```

## 담당 기능

- **웹캠 화면 표시 / 교체** — `getUserMedia`로 카메라 스트림을 받아 화면에 표시
  (이미지 번역 시 캡처 프레임으로 화면 대체)
- **오버레이 렌더링** — 웹캠 위에 정보 레이어를 얹음
  - 실시간 번역 자막
  - 길찾기 경로 안내 (거리·시간·경유 안내)
  - 이미지 번역 결과
  - 질문 응답 (+ TTS 음성)
- **UI 상태 관리** — 지금 어떤 기능(번역/이미지/길찾기/질문응답)이 실행 중인지
  관리하며, **한 번에 하나의 주 기능만** 활성화
- **버튼 트리거** — 하단 기능 바 버튼으로 각 기능 on/off

## 모듈 구조

```
web/
├── index.html              # 진입 HTML
├── package.json
├── vite.config.js
├── public/                 # 정적 파일 (빌드 시 그대로 복사: 3D 모델·아이콘 등)
└── src/
    ├── main.jsx            # React 앱 진입점 + 라우팅 (/ , /simulation)
    ├── index.css           # 전역 스타일 · 디자인 토큰 (Tailwind v4 @theme)
    ├── assets/             # 이미지 등 번들 에셋
    ├── pages/
    │   ├── Home.jsx        # 인트로 히어로 (3D 포인트 클라우드 → 시뮬레이션 진입)
    │   └── Simulation.jsx  # 시뮬레이션 화면 (웹캠 + 오버레이 오케스트레이터)
    ├── components/
    │   ├── Glasses.jsx         # 히어로용 3D 컴포넌트
    │   ├── GlassesTuner.jsx
    │   ├── PointCloudHead.jsx
    │   ├── Starfield.jsx
    │   └── sim/                # 시뮬레이션 화면 컴포넌트
    │       ├── WebcamView.jsx  # getUserMedia 웹캠 표시 + 프레임 캡처
    │       ├── FeatureBar.jsx  # 하단 기능 토글 바
    │       └── overlays/       # 기능별 정보 오버레이
    │           ├── TranslateOverlay.jsx
    │           ├── ImageTranslateOverlay.jsx
    │           ├── MapOverlay.jsx
    │           └── QaOverlay.jsx
    └── lib/
        └── simApi.js       # 서버 연동 경계 (현재 mock, BaseResponse 포맷)
```

## 다른 모듈과의 연동

프론트는 다른 팀원들이 만드는 모듈에서 데이터를 받아 화면에 그립니다. 백엔드가
아직 초안 단계라, 현재는 `src/lib/simApi.js`에서 **공통 응답 포맷
`{ status, msg, data }`(BaseResponse)** 를 그대로 반환하는 **mock**으로 대체하고
있습니다. 백엔드가 준비되면 각 함수 내부만 실제 호출로 교체합니다.

| 받아오는 데이터 | 출처 모듈 | 담당 | 엔드포인트(안) | 연동 방식 |
| --- | --- | --- | --- | --- |
| 실시간 STT 자막 | `server` (STT) | 지유찬 | `WS /stt/stream` | WebSocket |
| 목적지/경로·시간 정보 | `server` (map) | 윤태준 | `POST /map/directions` (+`/search`,`/geocode`) | REST |
| 목적지 추출 | `server` (llm) | 박찬영 | `POST /llm/extract-destination` | REST |
| 질문응답 | `server` (llm/rag) | 박찬영 | `POST /llm/ask` | REST |
| 이미지 번역 | `server` (papago) | 미정 | `POST /papago/image` | REST |
| 핸드폰 알림 | `server` | 윤태준 | `WS /notification/stream` (조사 중) | 미정 |

> 모든 REST 응답은 공통 포맷 `{ status, msg, data }`를 따릅니다.
> 길찾기 `data` 스키마는 `server/schemas/map.py`(`DirectionsData`)를 기준으로 합니다.

## 에셋 출처 (크레딧)

| 에셋 | 위치 | 저작자 | 라이선스 |
| --- | --- | --- | --- |
| Glasses (스마트글래스 3D) | `public/glasses/glasses.glb` | jeremy (poly.pizza) | CC-BY 3.0 |

## 협업 규칙

- 이 폴더(`web/`)는 프론트 담당 영역입니다. 다른 폴더는 각 담당자 영역이라 웬만하면
  건드리지 않습니다. (남의 영역을 수정하는 PR은 그 담당자의 승인을 받습니다.)
- 브랜치 이름: `이니셜/기능` (예: `hw/ui`, 세부 작업 시 `hw/ui-overlay`)
- 작업 흐름: `hw/ui`에서 개발 → `push` → GitHub에서 `main`으로 **Pull Request**
  → 팀원 1명 승인 후 병합
- `main`에는 직접 push 하지 않습니다.

## 작성자

최현우 (프론트엔드 / UI)
