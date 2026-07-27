# API ↔ 프론트 연동 설계

작성일: 2026-07-27 · 브랜치: `hw/ui` · 담당: 최현우(프론트)

## 목표

현재 `web/`의 시뮬레이션 UI는 모든 백엔드 호출을 `web/src/lib/simApi.js`의 **mock 함수**로 대체해 둔 상태다. 실제로 구현된 백엔드 기능을 프론트에 연결한다.

**제약**
- **서버(`server/`)는 일절 수정하지 않는다.** 프론트만 연동한다.
- 실동작하는 백엔드는 **지도(map REST)** 와 **음성 인식/명령(STT WebSocket)** 뿐이다. 나머지(번역·QA·이미지·환율)는 서버가 `501`이거나 모듈이 없다.
- 커밋은 사용자의 명시적 지시가 있을 때만 한다.

## 백엔드 구현 현황 (읽기 전용 참고)

| 기능 | 실제 엔드포인트 | 상태 |
|---|---|---|
| 길찾기 | `POST /map/directions`, `GET /map/search`, `GET /map/geocode` | ✅ 동작 |
| 음성 명령 | `WS /stt/ws` (자막 + 명령어 감지 + 기능 오케스트레이션) | ✅ 동작(navigate만 실제 실행) |
| 실시간 번역 | `translate` feature | ❌ 501 |
| 질문 응답 | `qa` feature | ❌ 501 |
| 환율 | `exchange` feature | ❌ 501 |
| 이미지 번역 | (모듈 없음) | ❌ 미구현 |

공통 응답 포맷은 REST·WS 모두 `BaseResponse = { status, msg, data }`. **실패해도 HTTP는 200**이므로 성패는 본문 `status`로 판단한다.

## 인터랙션 모델 — 하이브리드

버튼으로 기능을 고르는 **기존 방식 유지** + **음성 명령으로도 기능 호출** 가능.
- 버튼 클릭: 기존 토글 동작 그대로. 해당 오버레이 렌더.
- 음성: 전역 마이크 버튼 → `WS /stt/ws` 로 마이크 오디오 스트리밍 → 서버가 키워드로 기능을 판별(`wake`)하면 프론트가 해당 오버레이를 자동 활성. navigate는 서버가 지도까지 호출한 결과(`result`)를 함께 받아 그대로 렌더.

## 설계

### 1. 설정 / Base URL
- `simApi.js`:
  - `HTTP_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'`
  - `WS_BASE = HTTP_BASE.replace(/^http/, 'ws')`
- `web/.env.example`에 `VITE_API_BASE=http://localhost:8000` 추가. (실제 키/주소는 사용자가 나중에 설정)

### 2. `simApi.js` — 실연동 / mock 구분

| 함수 | 처리 |
|---|---|
| `getDirections({origin,destination})` | **실연동**. `POST /map/directions`. 서버가 `BaseResponse`를 주므로 파싱해 그대로 반환. 네트워크/파싱 실패는 `{status:502, msg, data:null}`로 감싸 반환 → 오버레이가 `msg` 표시(FR-MAP-6) |
| `startVoiceCommand({origin, language, execute, onEvent})` | **신규 실연동**. `WS /stt/ws?language=&origin=&execute=` 연결 + `getUserMedia({audio})` → 16kHz 모노 PCM 다운샘플/변환(API.md 예제 방식) → 바이너리 전송. 수신 `BaseResponse`를 이벤트로 정규화해 `onEvent(evt)` 호출. 종료용 `{stop()}` 컨트롤러 반환 |
| `askQuestion(question)` | **mock 유지**(서버 501). 응답 `data.mock = true` |
| `translateImage(dataUrl)` | **mock 유지**(모듈 없음). `data.mock = true` |
| `startTranslateStream(onCaption)` | **mock 유지**(서버 501). caption에 `mock:true` |

`startVoiceCommand`가 `onEvent`로 넘기는 정규화 이벤트:
- `{ kind:'partial', text }` — 중간 자막
- `{ kind:'final', text }` — 확정 문장
- `{ kind:'wake', feature, text }` — 명령어 감지(서버 feature 이름)
- `{ kind:'result', feature, text, data }` — 기능 실행 결과(navigate만 `status===200`)
- `{ kind:'error', status, msg }` — 실패(마이크 거부, 서버 500/501/502 등)

서버 메시지 판별 규칙(API.md): `data.type`이 있으면 인식 이벤트, 없고 `data.feature`가 있으면 기능 실행 결과. `status !== 200`이면 error.

### 3. UI 배선 (`Simulation.jsx`)
- 상태 추가: `listening`(불리언), `voiceCaption`({text, final}), `voiceCtrl`(컨트롤러 ref).
- **전역 마이크 토글 버튼**(헤더 우측 ⚙ 옆): 켜면 `startVoiceCommand` 시작, 끄면 `stop()`.
- 듣는 동안 하단에 **라이브 자막 오버레이**(partial/final) 표시. 이미 활성 오버레이(번역/QA)가 하단을 쓰면 위치 충돌하지 않게 마이크 자막은 상단 또는 별도 위치.
- `wake` → 서버 feature를 프론트 key로 매핑해 `setActiveFeature`:
  - `navigate → map`, `translate → translate`, `qa → qa` (`exchange`는 대응 오버레이 없음 → 무시하고 자막에만 표시)
- `result`(feature=navigate, status 200) → `directionsFromVoice` 상태에 저장 → `MapOverlay`에 주입.
- `error` → 자막 영역에 `msg` 표시. 마이크 종료.
- 버튼 클릭 경로(`handleToggle`)는 그대로 둔다.

### 4. `MapOverlay` 리팩터
- optional prop `directions` 추가.
  - 있으면(음성 결과) 그 `DirectionsData`를 즉시 렌더(로딩/fetch 생략).
  - 없으면(버튼 진입) 기존대로 `getDirections({origin,destination})` 호출.
- 데모 기본값을 서울로 변경: `origin='서울특별시 중구 세종대로 110'`, `destination='경복궁'` (API.md 검증 예시).

### 5. mock 명시 (정직성)
- `TranslateOverlay`, `QaOverlay`, `ImageTranslateOverlay`에 공통 **"MOCK" 배지** 표시(서버 미구현임을 사용자에게 명확히).
- 음성으로 translate/qa를 wake하면 오버레이는 뜨지만 내용은 mock이다. 서버가 뒤이어 보내는 501 `result`/`error`는 **navigate가 아니면 무시**(오버레이 자체 mock이 화면을 담당).

## 에러 처리
- 마이크 권한 거부/미지원: `startVoiceCommand`가 `{kind:'error'}` 방출 → 자막에 안내, listening 해제.
- 서버 CLOVA 키 없음: 서버가 `{status:500}` 후 소켓 close → error 이벤트 → 안내.
- map 네트워크 실패: `getDirections`가 `{status:502}` 반환 → MapOverlay가 "경로를 찾을 수 없습니다: {msg}".

## 검증 방법 / 한계
- 실동작에는 서버 실행 + NAVER(map)·CLOVA(stt) 키가 필요. 키는 사용자가 이후 설정.
- 로컬에서 가능한 검증: `npm run build` / `npm run lint` 통과, mock 경로 렌더, REST 요청 형태(개발자도구 네트워크) 확인.
- 실제 음성 스트리밍·경로 결과는 키가 있는 환경에서 사용자가 확인.

## 범위 밖 (YAGNI)
- 서버 코드 수정, 새 엔드포인트 추가.
- 환율(exchange) 오버레이 신규 UI(현재 UI에 없음).
- 상대 대화 장문 STT(`/stt/dialog`, 서버 미연결).
- 인증/세션/재연결 백오프 등 프로덕션 견고화.
