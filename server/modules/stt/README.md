# STT / 음성 스트리밍 모듈 (`/server/modules/stt`)

담당: ② 지유찬 (`yc/stt`) · CLOVA Speech 기반 음성 인식 + 키워드 스포팅
데모 기준 도시: 서울

내 명령(실시간)과 상대 대화(한/영 자동)를 모두 인식해, 4개 기능이 공유하는 표준 텍스트/신호를 제공한다.

---

## 실행

```bash
cd server/modules/stt
python -m venv venv
venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env           # 키 입력 (CLOVA_SPEECH_SECRET, CLOVA_SPEECH_INVOKE_URL)
python -m grpc_tools.protoc --proto_path=. --python_out=. --grpc_python_out=. nest.proto
uvicorn ws_server:app --host 0.0.0.0 --port 5001
```

---

## 1. 내 명령 인식 — 실시간 스트리밍 (gRPC)

- WebSocket: `ws://<서버>:5001/ws/stt?lang=ko`  (lang: `ko`(기본) / `en` / `ja`)
- 입력: 바이너리 프레임 = 16kHz·모노·16bit PCM 오디오 청크, 종료는 `{"action":"stop"}`
- 출력(표준 JSON):

```jsonc
{ "type": "partial", "text": "안녕하세" }              // 중간 자막(갱신)
{ "type": "final",   "text": "안녕하세요" }            // 최종 문장(침묵 시 확정)
{ "type": "wake",    "feature": "translate" }          // 기능 호출 (translate|navigate|qa|exchange)
```

| 형식 | 소비하는 쪽 |
|---|---|
| partial / final | ① 자막, ③ LLM 입력 |
| wake | 키워드 라우터 → 기능 실행 |

## 2. 상대 대화 인식 — 장문 REST (한/영 자동)

- `POST /api/dialog-stt` — 오디오 파일(multipart, 필드명 `audio`) → `{"text":"..."}`
- 한/영 동시 인식(`enko`) 사용 → 상대가 한국어/영어 섞어 말해도 자동 인식
- 반환된 `text`는 ③(LLM)이 번역
- 언어값 참고: `enko`(한/영) · `ko-KR` · `en-US` · `ja` · `zh-cn` · `zh-tw`

동작: ① 상대 발화 녹음 → `POST /api/dialog-stt` → ② 인식 텍스트 반환 → ③ 번역 → ① 표시

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
| `stt_session.py` | 실시간 STT 재사용 세션(gRPC) |
| `ws_server.py` | WebSocket + `/api/dialog-stt` 서버 |
| `long_stt.py` | 장문 REST 인식(한/영 enko) |
| `keyword_spotter.py` | 키워드 → 기능 매핑 |
| `nest.proto`, `nest_pb2*.py` | CLOVA Speech gRPC 정의/생성물 |
| `spike.py`, `mic 계열`, `record.py`, `rest_test.py` | 검증용 스크립트 |
| `test.html` | 모듈 동작 확인용 데모 페이지(실제 UI는 `/web`) |

## 협업 규칙

- 브랜치 `yc/stt` → PR
- `.env`(실제 키)·`sample.wav`·`venv` 커밋 금지 (`.gitignore` 처리됨)
- 공유 키는 팀 내부 채널로만 전달
