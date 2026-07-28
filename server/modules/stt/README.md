# STT / 음성 스트리밍 모듈 (`/server/modules/stt`)

담당: ② 지유찬 (`yc/stt`) · CLOVA Speech 기반 음성 인식 + 키워드 스포팅
데모 기준 도시: 서울

내 명령(한국어)과 상대 대화(영어→한국어 번역)를 WebSocket 하나로 모두 인식해, 4개 기능이 공유하는 표준 텍스트/신호를 제공한다.

---

## 실행

통합 서버(`server/main.py`)에 포함되어 있으므로 서버 실행 방법은 [server/README.md](../../README.md)와 같다.

```bash
cd server
pip install -r requirements.txt
cp .env.example .env             # 키 입력 (CLOVA_SPEECH_SECRET, CLOVA_SPEECH_INVOKE_URL), windows는 copy
uvicorn main:app --reload
```

`nest.proto`를 수정했을 때만 생성물 재빌드:

```bash
cd server/modules/stt
python -m grpc_tools.protoc --proto_path=. --python_out=. --grpc_python_out=. nest.proto
```

---

## 1. 내 명령 인식 — 실시간 스트리밍 (gRPC)

- WebSocket: `ws://<서버>:8000/stt/ws?language=ko&lat=37.56&lng=126.97`
  - `language`: `ko`(기본) / `en` / `ja`
  - `lat`, `lng`: 현재 위치 좌표 — 목적지만 말했을 때 길찾기 출발지로 사용
  - `execute`: `true`(기본)면 명령어 감지 시 기능(map 등)까지 실행해서 결과도 보냄
  - `wake_word`: `true`(기본)면 호출어("헤이 글래스")를 들어야 명령을 받는다
  - `listen_timeout`: 호출어 뒤 명령을 받는 시간(초). 0 이하면 무제한
- 입력: 바이너리 프레임 = 16kHz·모노·16bit PCM 오디오 청크
  - `{"action":"stop"}` 종료
  - `{"action":"wake"}` 호출어 없이 바로 명령 수신 상태로 (기능 버튼 클릭 등),
    `{"action":"wake","mode":"dialog"}`면 대화 번역 모드로 직행
  - `{"action":"sleep"}` 호출어 대기 상태로 복귀
- 소켓은 화면 진입 시 한 번 열고 유지한다. 호출어 대기(`idle`) 중에는 이벤트를 보내지 않는다
- 출력: 모두 공통 포맷 [`BaseResponse`](../../schemas/base.py)로 감싼 JSON

```jsonc
{ "status": 200, "msg": "success", "data": { "type": "partial", "text": "경복궁까지" } }        // 중간 자막(갱신)
{ "status": 200, "msg": "success", "data": { "type": "final", "text": "경복궁까지 안내해줘" } }  // 최종 문장(침묵 시 확정)
{ "status": 200, "msg": "success", "data": { "type": "wake", "text": "...", "feature": "navigate" } }  // 기능 감지
{ "status": 200, "msg": "success", "data": { "feature": "navigate", "text": "...", "data": { ... } } } // 기능 실행 결과
```

- `data.type`이 있으면 인식 이벤트, `data.feature`가 있으면 기능 실행 결과다.

| 형식 | 소비하는 쪽 |
|---|---|
| partial / final | ① 자막, ③ LLM 입력 |
| wake | 키워드 라우터 → 기능 실행 |

클라이언트가 쓰는 경로는 이 WebSocket 하나다. 명령어 판별·기능 실행은 서버 내부에서 처리한다
([`service.py`](service.py) → [`server/service.py`](../../service.py) → 기능 모듈).

## 2. 상대 대화 인식 — dialog 모드 (같은 WebSocket)

별도 엔드포인트 없이 위의 `/stt/ws` 소켓 안에서 모드만 바꾼다.

- 진입: 확정 문장에 `번역`/`통역`/`외국인`/`외국어` 중 하나가 있으면 자동 전환 (`is_dialog_start()`).
  화면에서 번역 버튼을 누른 경우엔 `{"action":"wake","mode":"dialog"}`로 곧장 진입
- 종료: dialog 모드 확정 문장에 `stop` 또는 `exit`가 있으면 호출어 대기 상태로 복귀
- 전환 시 서버가 `{"type":"status","mode":"idle"|"listening"|"dialog","text":"<안내문>"}`을 보낸다.
  **상태 판별은 `mode`로 한다** — `text`는 화면에 띄울 안내문이다
- 인식은 `en`, 번역은 `ko` 고정 — CLOVA 스트림의 번역 옵션을 쓰므로 별도 API 호출이 없다
- 자막 이벤트에 `translated`(한국어 번역)가 함께 실린다

```jsonc
{ "status": 200, "msg": "success",
  "data": { "type": "final", "text": "Where is the subway station?",
            "feature": null, "translated": "지하철역이 어디에 있나요?" } }
```

CLOVA 설정(`language`/`translation`)은 스트림 첫 프레임에만 실리므로, 모드가 바뀌면 gRPC 세션을 닫고 새로 연다.

---

## 길찾기 핸드오프 (→ ⑤ 네이버 지도)

`wake:navigate` 후 최종 문장에서 ③이 지명 추출 → ⑤에게:

```jsonc
{ "feature": "navigate", "start": "강남역", "goal": "경복궁" }
```
⑤ 주의: 네이버 Directions는 좌표(경도,위도)를 받으므로 Geocoding으로 지명→좌표 변환 후 호출. 출발지를 현재위치로 하면 GPS 좌표 직접 사용.

---

## 파일 구성

| 파일 | 역할 |
|---|---|
| `service.py` | 모듈 진입점 — 실시간 명령어 인식 세션(`CommandSession`), 명령어 판별(`detect_command`) |
| `stt_session.py` | 실시간 STT 재사용 세션(gRPC) — 인식 언어/번역 설정도 여기서 지정 |
| `keyword_spotter.py` | 키워드 → 기능 매핑 |
| `nest.proto`, `nest_pb2*.py` | CLOVA Speech gRPC 정의/생성물 |

## 협업 규칙

- 브랜치 `yc/stt` → PR
- `server/.env`(실제 키)·`sample.wav`·`venv` 커밋 금지 (`.gitignore` 처리됨)
- 공유 키는 팀 내부 채널로만 전달
