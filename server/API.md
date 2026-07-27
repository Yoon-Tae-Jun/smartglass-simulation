# API 문서 (클라이언트용)

`/web` 등 클라이언트가 서버를 호출할 때 쓰는 경로 정리.

- Base URL: `http://localhost:8000` (WebSocket은 `ws://localhost:8000`)
- Swagger: `http://localhost:8000/docs` — REST만 표시된다 (WebSocket은 표시되지 않음)

## 목차
- [공통 응답 포맷](#공통-응답-포맷)
- [1. 음성 명령 — WebSocket `/stt/ws`](#1-음성-명령--websocket-sttws)
- [2. 지도 REST](#2-지도-rest)
- [3. 기타](#3-기타)
- [기능(feature) 목록](#기능feature-목록)

---

## 공통 응답 포맷

REST·WebSocket 할 것 없이 모든 응답은 아래 형태다.

```jsonc
{
  "status": 200,        // HTTP 상태 코드와 같은 의미
  "msg": "success",     // 실패 시 원인 문구
  "data": { ... }       // 실패 시 null
}
```

**주의: 실패해도 HTTP 상태는 200이다.** 실패 판단은 HTTP 코드가 아니라 본문의 `status`로 한다.

```js
const res = await fetch(...);
const body = await res.json();
if (body.status !== 200) showError(body.msg);
```

| status | 의미 |
|---|---|
| 200 | 성공 |
| 400 | 입력이 부족/이상함 (예: 목적지를 알아듣지 못함) |
| 404 | 대상을 찾지 못함 (장소·경로 없음, 명령어 아님) |
| 500 | 서버 설정 문제 (예: CLOVA 키 미설정) |
| 501 | 키워드는 잡혔지만 아직 구현되지 않은 기능 |
| 502 | 외부 API(네이버·CLOVA) 호출 실패 |

---

## 1. 음성 명령 — WebSocket `/stt/ws`

**클라이언트가 쓰는 주 경로.** 소켓 하나로 자막부터 기능 실행 결과까지 다 받는다.
명령어 판별과 기능 실행(지도 호출 등)은 서버 내부에서 처리하므로 클라이언트가 따로 호출할 API는 없다.

```
ws://localhost:8000/stt/ws?language=ko&lat=37.5666103&lng=126.9783882
```

### 쿼리 파라미터

| 이름 | 기본값 | 설명 |
|---|---|---|
| `language` | `ko` | 인식 언어 (`ko` / `en` / `ja`) |
| `lat`, `lng` | 없음 | 현재 위치 좌표 (위도, 경도). 둘 다 있어야 인정된다 |
| `execute` | `true` | `false`면 인식만 하고 기능은 실행하지 않는다 |

### 길찾기 출발지 규칙

| 사용자가 말한 내용 | 출발지 |
|---|---|
| "**강남역에서** 경복궁까지 가는 길 알려줘" | 말한 지명(`강남역`)을 서버가 도로명 주소로 변환해 사용. `lat`/`lng`는 무시 |
| "경복궁까지 안내해줘" (목적지만) | `lat`/`lng`를 서버가 **도로명 주소로 역변환**해서 사용 |
| 목적지만 말했는데 `lat`/`lng`도 없음 | `400 출발지를 알 수 없습니다. 현재 위치 좌표를 함께 전달해주세요` |

좌표는 브라우저 `navigator.geolocation.getCurrentPosition()`으로 얻어서 연결 시 넘기면 된다.

### 보내는 것

| 형식 | 내용 |
|---|---|
| 바이너리 프레임 | 16kHz · 모노 · 16bit PCM 오디오 청크 |
| 텍스트 프레임 | `{"action": "stop"}` — 종료 요청 |

### 받는 것

메시지는 4종이고, 전부 `BaseResponse`로 감싸여 있다.
**`data.type`이 있으면 인식 이벤트, 없고 `data.feature`가 있으면 기능 실행 결과다.**

```jsonc
// ① 중간 자막 — 말하는 동안 계속 갱신된다
{ "status": 200, "msg": "success",
  "data": { "type": "partial", "text": "경복궁까지", "feature": null } }

// ② 확정 문장 — 침묵이 감지되면 확정된다
{ "status": 200, "msg": "success",
  "data": { "type": "final", "text": "경복궁까지 가는 길 알려줘", "feature": null } }

// ③ 명령어 감지 — 확정 문장에서 기능이 잡혔을 때만 온다
{ "status": 200, "msg": "success",
  "data": { "type": "wake", "text": "경복궁까지 가는 길 알려줘", "feature": "navigate" } }

// ④ 기능 실행 결과 — 서버가 지도 API까지 호출한 결과 (execute=true일 때)
{ "status": 200, "msg": "success",
  "data": { "feature": "navigate", "text": "경복궁까지 가는 길 알려줘",
            "data": { "summary": {...}, "path": [...], "section": [...], "guide": [...] } } }
```

`data.data`의 구조는 기능마다 다르다. `navigate`는 [지도 경로 응답](#post-mapdirections)과 같다.

### 실패 메시지

```jsonc
// 서버에 CLOVA 키가 없음 -> 이 메시지를 보내고 소켓을 닫는다
{ "status": 500, "msg": "CLOVA Speech 환경변수가 설정되지 않았습니다", "data": null }

// 목적지를 알아듣지 못함 (인식 이벤트는 정상적으로 오고, 실행 결과만 실패)
{ "status": 400, "msg": "목적지를 알아듣지 못했습니다: 길 알려줘", "data": null }

// 목적지만 말했는데 현재 위치 좌표가 없음
{ "status": 400, "msg": "출발지를 알 수 없습니다. 현재 위치 좌표를 함께 전달해주세요", "data": null }

// 좌표에 해당하는 도로명 주소가 없음 (바다 위 등)
{ "status": 404, "msg": "좌표에 해당하는 주소가 없습니다: 33.0,126.0", "data": null }

// 아직 구현되지 않은 기능
{ "status": 501, "msg": "아직 지원하지 않는 기능입니다: translate", "data": null }
```

### 처리 순서 예시

`lat=37.5666103&lng=126.9783882`(서울시청)로 연결하고 "경복궁까지 가는 길 알려줘"라고 말한 경우:

```
(오디오 전송)
  → partial "경복궁까지"
  → partial "경복궁까지 가는 길 알려줘"
  → final   "경복궁까지 가는 길 알려줘"
  → wake    feature=navigate
       (서버 내부: 좌표 → "서울특별시 중구 세종대로 110" 역변환 → 경로 조회)
  → 실행 결과 (거리 2,244m / 예상 택시비 5,900원)
```

`{"action":"stop"}`을 보낸 뒤에도 실행 중인 기능 결과가 있으면 그것까지 보내고 소켓이 닫힌다(최대 10초 대기).

### 클라이언트 예제 (브라우저)

```js
// 현재 위치를 받아 좌표로 연결한다 (목적지만 말했을 때 출발지로 쓰인다)
const pos = await new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err));
const { latitude: lat, longitude: lng } = pos.coords;

const ws = new WebSocket(`ws://localhost:8000/stt/ws?language=ko&lat=${lat}&lng=${lng}`);
ws.binaryType = "arraybuffer";

ws.onmessage = (ev) => {
  const res = JSON.parse(ev.data);
  if (res.status !== 200) return showError(res.msg);

  const d = res.data;
  if (d.type === "partial")      showSubtitle(d.text);        // 중간 자막
  else if (d.type === "final")   fixSubtitle(d.text);         // 확정 자막
  else if (d.type === "wake")    showFeatureBadge(d.feature); // 기능 호출 표시
  else                           renderResult(d.feature, d.data); // 기능 실행 결과
};

// 마이크 -> 16kHz PCM 전송
ws.onopen = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain(); mute.gain.value = 0;   // 스피커 피드백 방지
  src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);

  proc.onaudioprocess = (e) => {
    const pcm = floatTo16BitPCM(downsampleTo16k(e.inputBuffer.getChannelData(0), ctx.sampleRate));
    if (ws.readyState === 1) ws.send(pcm);
  };
};

// 종료
function stop() {
  ws.send(JSON.stringify({ action: "stop" }));
}

function downsampleTo16k(buffer, inRate) {
  const outRate = 16000;
  if (inRate === outRate) return buffer;
  const ratio = inRate / outRate, newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let oR = 0, oB = 0;
  while (oR < newLen) {
    const next = Math.round((oR + 1) * ratio);
    let acc = 0, cnt = 0;
    for (let i = oB; i < next && i < buffer.length; i++) { acc += buffer[i]; cnt++; }
    result[oR++] = acc / (cnt || 1); oB = next;
  }
  return result;
}

function floatTo16BitPCM(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out.buffer;
}
```

---

## 2. 지도 REST

음성 없이 지도 기능만 직접 쓸 때 사용한다.

> 한글 파라미터는 URL 인코딩 필수. 인코딩하지 않으면 서버가 `400 Bad Request`(빈 본문)를 반환한다.
> JS의 `fetch`/`URLSearchParams`는 자동으로 인코딩한다.

### GET `/map/search`

상호명으로 장소를 찾아 도로명 주소를 돌려준다.

| 파라미터 | 설명 |
|---|---|
| `query` | 상호명/장소명 |

```jsonc
// GET /map/search?query=경복궁
{ "status": 200, "msg": "success",
  "data": { "name": "경복궁", "road_address": "서울특별시 종로구 사직로 161 경복궁" } }

// 없는 장소
{ "status": 404, "msg": "장소를 찾을 수 없습니다: zzzxxxqqq없는장소12345", "data": null }
```

### GET `/map/geocode`

도로명 주소를 좌표로 변환한다.

| 파라미터 | 설명 |
|---|---|
| `address` | 도로명 주소 |

```jsonc
// GET /map/geocode?address=서울특별시 중구 세종대로 110
{ "status": 200, "msg": "success", "data": { "lat": 37.5666103, "lng": 126.9783882 } }
```

### POST `/map/directions`

출발지 → 목적지 경로를 계산한다. 출발지/목적지 모두 **상호명 또는 도로명 주소**를 쓸 수 있다.

```jsonc
// 요청
{ "origin": "서울특별시 중구 세종대로 110", "destination": "경복궁" }
```

```jsonc
// 응답 (path/section/guide는 길어서 일부만 표기)
{
  "status": 200,
  "msg": "success",
  "data": {
    // 서버가 확정한 출발지/목적지 도로명 주소
    "origin": "서울특별시 중구 세종대로 110",
    "destination": "서울특별시 종로구 사직로 161 경복궁",
    "summary": {
      "distance": 2244,      // m
      "duration": 872633,    // ms
      "toll_fare": 0,        // 원
      "taxi_fare": 5900,     // 원
      "fuel_price": 299      // 원
    },
    "path": [ { "lat": 37.5666103, "lng": 126.9783882 } ],   // 경로 좌표 (예: 83개)
    "section": [
      { "point_index": 6, "point_count": 29, "distance": 906,
        "name": "세종대로", "congestion": 3, "speed": 8 }
    ],
    "guide": [
      { "point_index": 6, "type": 3, "instructions": "'세종대로' 방면으로 우회전",
        "distance": 107, "duration": 40720 }
    ]
  }
}
```

- `origin` / `destination`: 서버가 확정한 도로명 주소. 상호명("경복궁")으로 요청해도 주소로 변환되어 나간다
- `congestion`: 0=없음, 1=원활, 2=서행, 3=혼잡
- `type`: 분기점 코드 (1=직진, 2=좌회전, 3=우회전, 6=유턴 등)
- `point_index`: `path` 배열에서의 위치 → 지도에 안내 지점을 찍을 때 사용

### 좌표 → 도로명 주소 (REST 미제공)

역변환은 WebSocket 길찾기 안에서만 쓰이므로 엔드포인트로 열려 있지 않다.
서버 코드에서는 [`modules/map/service.py`](modules/map/service.py)의 `reverse_geocode(Coordinate)`로 호출한다.

```python
reverse_geocode(Coordinate(lat=37.5666103, lng=126.9783882))
# {"status": 200, "msg": "success", "data": {"road_address": "서울특별시 중구 세종대로 110"}}
```

---

## 3. 기타

### GET `/health`

서버 상태 확인. 이 응답만 `BaseResponse` 형식이 아니다.

```json
{ "status": "ok" }
```

### GET `/example/ping`

모듈 작성 예시용 엔드포인트.

```json
{ "status": 200, "msg": "success", "data": { "message": "pong" } }
```

---

## 기능(feature) 목록

WebSocket의 `wake` 이벤트에서 오는 `feature` 값이다.

| feature | 트리거 키워드 | 상태 |
|---|---|---|
| `navigate` | 안내, 경로, 까지, 가는 길, 어떻게 가, 길 알려 | **동작** — 지도 경로 반환 |
| `translate` | 번역, 통역 | 미구현 (`501`) |
| `exchange` | 환율, 환전, 얼마, 가격, 원으로 | 미구현 (`501`) |
| `qa` | 알려줘, 뭐야, 궁금, 찾아, 설명, 질문 | 미구현 (`501`) |

키워드는 [`modules/stt/keyword_spotter.py`](modules/stt/keyword_spotter.py), 기능 실행은 [`service.py`](service.py)에서 관리한다.

### 아직 없는 것

- **상대 대화 인식(장문 STT)** — 인식 함수는 [`modules/stt/long_stt.py`](modules/stt/long_stt.py)에 있으나 엔드포인트로 연결되지 않았다.
- **이미지 인식 / 번역** — 모듈 미구현.
