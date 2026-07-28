# API 문서 (클라이언트용)

`/web` 등 클라이언트가 서버를 호출할 때 쓰는 경로 정리.

- Base URL: `http://localhost:8000` (WebSocket은 `ws://localhost:8000`)
- Swagger: `http://localhost:8000/docs` — REST만 표시된다 (WebSocket은 표시되지 않음)

| 경로 | 방식 | 용도 |
|---|---|---|
| `/stt/ws` | WebSocket | **주 경로** — 음성 명령 + 실시간 대화 번역 |
| `/map/search`, `/map/geocode`, `/map/directions` | REST | 지도 (음성 없이 직접 쓸 때) |
| `/imgPapago/image` | POST | 이미지 번역 (카메라 캡처 → 번역 이미지) |
| `/health`, `/example/ping` | GET | 상태 확인 |

## 목차
- [공통 응답 포맷](#공통-응답-포맷)
- [1. 음성 명령 — WebSocket `/stt/ws`](#1-음성-명령--websocket-sttws)
  - [1-1. command 모드 (한국어 명령)](#1-1-command-모드-한국어-명령)
  - [1-2. dialog 모드 (외국인 대화 번역)](#1-2-dialog-모드-외국인-대화-번역)
- [2. 지도 REST](#2-지도-rest)
- [3. 이미지 번역 REST](#3-이미지-번역-rest)
- [4. 기타](#4-기타)
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
| 500 | 서버 설정 문제 (예: CLOVA·파파고 키 미설정) |
| 501 | 키워드는 잡혔지만 아직 구현되지 않은 기능 |
| 502 | 외부 API(네이버·CLOVA·파파고) 호출 실패 |

---

## 1. 음성 명령 — WebSocket `/stt/ws`

**클라이언트가 쓰는 주 경로.** 소켓 하나로 자막·명령어 감지·기능 실행 결과·대화 번역을 전부 받는다.
명령어 판별과 기능 실행(지도 호출 등)은 서버 내부에서 처리하므로 클라이언트가 따로 호출할 API는 없다.

```
ws://localhost:8000/stt/ws?language=ko&lat=37.5666103&lng=126.9783882
```

### 쿼리 파라미터

| 이름 | 기본값 | 설명 |
|---|---|---|
| `language` | `ko` | command 모드의 인식 언어 (`ko` / `en` / `ja`) |
| `lat`, `lng` | 없음 | 현재 위치 좌표 (위도, 경도). 둘 다 있어야 인정된다 |
| `execute` | `true` | `false`면 인식만 하고 기능은 실행하지 않는다 |

### 보내는 것

| 형식 | 내용 |
|---|---|
| 바이너리 프레임 | 16kHz · 모노 · 16bit PCM 오디오 청크 |
| 텍스트 프레임 | `{"action": "stop"}` — 종료 요청 |
| 텍스트 프레임 | `{"action": "frame", "image": "<base64>"}` — `capture` 요청에 대한 응답 |

#### 카메라 프레임 (`capture` ⇄ `frame`)

"메뉴판 번역해줘"처럼 **눈앞의 글자**를 번역하는 명령은 서버가 화면을 봐야 한다.
서버는 그 명령을 알아들은 **바로 그 순간** `capture` 이벤트를 보내 화면을 요청한다.
클라이언트는 **그때 찍어서** 답하면 된다. 미리 보내둘 필요는 없다.

```js
// 서버 → 클라이언트
{ "status": 200, "msg": "success",
  "data": { "type": "capture", "text": "", "feature": null, "translated": null } }
```

```js
// 클라이언트 → 서버 (곧바로 응답)
if (d.type === 'capture') {
  ws.send(JSON.stringify({ action: 'frame', image: webcam.capture() }))  // data URL 그대로 OK
}
```

- 프레임이 도착하면 서버가 **즉시** 번역을 진행한다 (기다리는 시간 = 왕복 시간)
- **3초** 안에 응답이 없으면 직전에 받아둔 프레임을 쓰고, 그것도 없으면
  `400 카메라 화면을 받지 못했습니다`가 돌아온다
- 형식/크기 제한은 [이미지 번역 REST](#3-이미지-번역-rest)와 같다 (JPG·PNG 등, 1960×1960px 이내)

### 두 가지 모드

소켓 하나가 두 모드를 오간다. **모드가 바뀌면 서버가 `status` 이벤트로 알려준다.**

| 모드 | 하는 일 | 인식 언어 |
|---|---|---|
| `command` (기본) | 한국어 명령어 감지 → 기능 실행 | 쿼리 `language` (기본 `ko`) |
| `dialog` | 상대(외국인) 말을 인식해 한국어 번역을 함께 반환 | `en` 고정 → `ko` 번역 |

```
연결 → command
  "외국인이랑 대화 번역해줘"  → status:"dialog"  → dialog 모드
  "stop" 또는 "exit"          → status:"command" → command 모드
```

### 받는 것 (공통)

메시지는 6종이고 전부 `BaseResponse`로 감싸여 있다.
**`data.type`이 있으면 인식 이벤트, 없으면 기능 실행 결과다.**

| `data.type` | 언제 | 주요 필드 | 클라이언트가 할 일 |
|---|---|---|---|
| `partial` | 말하는 동안 계속 갱신 | `text`, (dialog) `translated` | 자막 갱신 |
| `final` | 침묵 감지로 문장 확정 | `text`, (dialog) `translated` | 자막 확정 |
| `wake` | 확정 문장에서 기능이 잡혔을 때 | `text`, `feature` | 해당 오버레이 켜기 |
| `status` | 모드가 바뀌었을 때 | `text` = `"dialog"` \| `"command"` | 번역 UI 토글 |
| `capture` | 이미지 번역에 화면이 필요할 때 | — | **즉시 `frame` 응답** |
| (없음) | 기능 실행 결과 | `feature`, `text`, `data` | 결과 렌더 |

이벤트 객체는 항상 `type` / `text` / `feature` / `translated` 4개 키를 가진다. 해당 없는 값은 `null`로 온다.

---

### 1-1. command 모드 (한국어 명령)

#### 길찾기 출발지 규칙

| 사용자가 말한 내용 | 출발지 |
|---|---|
| "**강남역에서** 경복궁까지 가는 길 알려줘" | 말한 지명(`강남역`)을 서버가 도로명 주소로 변환해 사용. `lat`/`lng`는 무시 |
| "경복궁까지 안내해줘" (목적지만) | `lat`/`lng`를 서버가 **도로명 주소로 역변환**해서 사용 |
| 목적지만 말했는데 `lat`/`lng`도 없음 | `400 출발지를 알 수 없습니다. 현재 위치 좌표를 함께 전달해주세요` |

좌표는 브라우저 `navigator.geolocation.getCurrentPosition()`으로 얻어서 연결 시 넘기면 된다.

#### 메시지 예시

```jsonc
// ① 중간 자막 — 말하는 동안 계속 갱신된다
{ "status": 200, "msg": "success",
  "data": { "type": "partial", "text": "경복궁까지", "feature": null, "translated": null } }

// ② 확정 문장 — 침묵이 감지되면 확정된다
{ "status": 200, "msg": "success",
  "data": { "type": "final", "text": "경복궁까지 가는 길 알려줘", "feature": null, "translated": null } }

// ③ 명령어 감지 — 확정 문장에서 기능이 잡혔을 때만 온다
{ "status": 200, "msg": "success",
  "data": { "type": "wake", "text": "경복궁까지 가는 길 알려줘", "feature": "navigate", "translated": null } }

// ④ 기능 실행 결과 — 서버가 지도 API까지 호출한 결과 (execute=true일 때)
{ "status": 200, "msg": "success",
  "data": { "feature": "navigate", "text": "경복궁까지 가는 길 알려줘",
            "data": { "origin": "...", "destination": "...", "summary": {...}, "path": [...] } } }

// ④-2 이미지 번역도 같은 형태로 온다 (capture로 받아온 화면을 사용)
{ "status": 200, "msg": "success",
  "data": { "feature": "image", "text": "메뉴판 번역해줘",
            "data": { "rendered_image": "iVBORw0...", "source_text": "ラーメン 800円",
                      "target_text": "라멘 800엔" } } }
```

`data.data`의 구조는 기능마다 다르다. `navigate`는 [지도 경로 응답](#post-mapdirections)과 같다.

#### 처리 순서 예시

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

#### 실패 메시지

```jsonc
// 서버에 CLOVA 키가 없음 -> 이 메시지를 보내고 소켓을 닫는다
{ "status": 500, "msg": "CLOVA Speech 환경변수가 설정되지 않았습니다", "data": null }

// 목적지를 알아듣지 못함 (인식 이벤트는 정상적으로 오고, 실행 결과만 실패)
{ "status": 400, "msg": "목적지를 알아듣지 못했습니다: 길 알려줘", "data": null }

// 목적지만 말했는데 현재 위치 좌표가 없음
{ "status": 400, "msg": "출발지를 알 수 없습니다. 현재 위치 좌표를 함께 전달해주세요", "data": null }

// 좌표에 해당하는 도로명 주소가 없음 (바다 위 등)
{ "status": 404, "msg": "좌표에 해당하는 주소가 없습니다: 33.0,126.0", "data": null }

// 키워드는 잡혔지만 핸들러가 없는 기능 (exchange / qa)
{ "status": 501, "msg": "아직 지원하지 않는 기능입니다: qa", "data": null }
```

---

### 1-2. dialog 모드 (외국인 대화 번역)

상대(외국인)가 말하는 영어를 인식해 **원문과 한국어 번역을 함께** 내려준다.
CLOVA Speech의 번역 옵션을 그대로 쓰므로 별도 API 호출이 없다.

#### 진입

command 모드의 **확정 문장(`final`)** 에 아래 단어가 하나라도 들어가면 자동 전환된다 (공백은 무시하고 비교).

```
번역 · 통역 · 외국인 · 외국어
```

예: "번역해줘", "통역 켜줘", "외국인이랑 대화 번역해줘" — 전부 dialog 진입.

> 이 판정이 명령어 감지보다 **먼저** 실행된다. 번역/통역은 `wake` 이벤트로 나가지 않으므로
> 클라이언트는 `feature: "translate"`를 받을 일이 없다. 실시간 번역 UI는 `status` 이벤트로만 켠다.

#### 종료

dialog 모드의 확정 문장에 `stop` 또는 `exit`가 포함되면 command 모드로 돌아온다(대소문자 무시).
소켓은 끊지 않는다.

#### 메시지 예시

```jsonc
// ① 모드 진입 알림
{ "status": 200, "msg": "success",
  "data": { "type": "status", "text": "dialog", "feature": null, "translated": null } }

// ② 상대가 말하는 동안 (원문 + 번역이 같이 갱신된다)
{ "status": 200, "msg": "success",
  "data": { "type": "partial", "text": "Where is the", "feature": null,
            "translated": "어디에 있나요" } }

// ③ 확정 문장
{ "status": 200, "msg": "success",
  "data": { "type": "final", "text": "Where is the subway station?", "feature": null,
            "translated": "지하철역이 어디에 있나요?" } }

// ④ 모드 복귀 알림 ("stop" 이라고 말했을 때)
{ "status": 200, "msg": "success",
  "data": { "type": "status", "text": "command", "feature": null, "translated": null } }
```

#### 주의

- dialog 모드에서는 **`wake` 이벤트도, 기능 실행 결과도 오지 않는다.** 자막(`partial`/`final`)만 온다.
- 인식 언어는 `en`, 번역 대상은 `ko`로 **서버에 고정**되어 있다. 쿼리 `language`는 command 모드에만 적용된다.
- 모드 전환 시 기존 STT 세션을 닫고 새로 여는 구조라, 전환 직후 잠깐은 인식 이벤트가 오지 않는다. 이때 들어온 오디오는 버려진다.
- `translated`는 dialog 모드에서만 채워진다. command 모드에서는 항상 `null`.

---

### 클라이언트 예제 (브라우저)

```js
// 현재 위치를 받아 좌표로 연결한다 (목적지만 말했을 때 출발지로 쓰인다)
const pos = await new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err));
const { latitude: lat, longitude: lng } = pos.coords;

const ws = new WebSocket(`ws://localhost:8000/stt/ws?language=ko&lat=${lat}&lng=${lng}`);
ws.binaryType = "arraybuffer";

let mode = "command";

ws.onmessage = (ev) => {
  const res = JSON.parse(ev.data);
  if (res.status !== 200) return showError(res.msg);

  const d = res.data;
  if (d.type === "capture") {                   // 지금 화면을 찍어 보내라는 요청
    ws.send(JSON.stringify({ action: "frame", image: webcam.capture() }));
  } else if (d.type === "status") {             // 모드 전환 (dialog | command)
    mode = d.text;
    toggleTranslateOverlay(mode === "dialog");
  } else if (d.type === "partial" || d.type === "final") {
    const fixed = d.type === "final";
    if (mode === "dialog") showDialogSubtitle(d.text, d.translated, fixed); // 원문 + 번역
    else                   showSubtitle(d.text, fixed);
  } else if (d.type === "wake") {
    showFeatureBadge(d.feature);                // 기능 호출 표시
  } else {
    renderResult(d.feature, d.data);            // 기능 실행 결과
  }
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

## 3. 이미지 번역 REST

### POST `/imgPapago/image`

이미지 속 글자를 인식해 **번역문을 얹어 다시 그린 이미지**를 돌려준다 (파파고 이미지 번역).
메뉴판·표지판을 카메라로 잡아 그대로 번역해 보여주는 용도다.

```jsonc
// 요청 — image는 base64. 브라우저 canvas.toDataURL()의 data URL을 그대로 넣어도 된다
{
  "image": "data:image/png;base64,iVBORw0KGgo...",
  "source": "auto",   // 생략 가능 (기본 auto — 파파고가 원본 언어를 판별)
  "target": "ko"      // 생략 가능 (기본 ko)
}
```

```jsonc
// 응답
{ "status": 200, "msg": "success",
  "data": {
    "rendered_image": "iVBORw0KGgo...",       // 번역문이 얹힌 결과 이미지 (base64, 접두사 없음)
    "source_text": "ラーメン 800円",             // 인식된 원문
    "target_text": "라멘 800엔"                 // 번역문
  } }
```

`rendered_image`에는 `data:` 접두사가 없다. 그대로 그리려면 클라이언트가 붙여야 한다.

```js
const res = await fetch(`${BASE}/imgPapago/image`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: canvas.toDataURL('image/png') }),
})
const body = await res.json()
if (body.status !== 200) return showError(body.msg)
img.src = `data:image/png;base64,${body.data.rendered_image}`
```

| status | 언제 |
|---|---|
| 400 | `image`가 비었거나 base64로 해석되지 않음 |
| 404 | 이미지에서 글자를 찾지 못함 |
| 500 | `IMG_TRANSLATE_URL` / `PAPAGO_CLIENT_ID` / `PAPAGO_SECRET_KEY` 미설정 |
| 502 | 파파고 호출 실패 또는 응답 형식이 예상과 다름 |

#### 파파고 쪽 제약 (그대로 전달되므로 클라이언트가 지켜야 한다)

- 형식: JPG · JPEG · PNG · TIFF
- 크기: 이미지당 **20MB 이내**, **1960×1960px 이내**
- `source`는 `auto` · `ko` · `en` · `ja` · `zh-CN` · `zh-TW` · `vi` · `th` · `id` · `fr` · `es` · `ru`,
  `target`은 여기에 `de` · `it`가 추가된다
- 이미지를 JSON 본문에 base64로 싣기 때문에 전송량은 원본보다 약 33% 커진다. 웹캠 프레임 정도는
  문제없지만, 고해상도 사진은 캡처 단계에서 줄여 보내는 편이 좋다

서버는 `IMG_TRANSLATE_URL`(기본값 `https://papago.apigw.ntruss.com/image-to-image/v1/translate`)로
multipart 요청을 보낸다. 이 엔드포인트는 번역문을 **원본 이미지에 합성해서** 돌려주는 쪽이다
(텍스트만 필요하면 파파고에 `image-to-text`가 따로 있다).

---

## 4. 기타

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
| `image` | 메뉴판, 간판, 표지판, 이미지 번역, 사진 번역, 화면 번역 | **동작** — 번역 이미지 반환 ([결과 형식](#post-imgpapagoimage)) |
| `navigate` | 안내, 경로, 까지, 가는 길, 어떻게 가, 길 알려 | **동작** — 지도 경로 반환 |
| `exchange` | 환율, 환전, 얼마, 가격, 원으로 | 미구현 (`501`) |
| `qa` | 알려줘, 뭐야, 궁금, 찾아, 설명, 질문 | 미구현 (`501`) |

사람과의 **대화 번역(통역)** 은 `feature`가 아니라 **모드 전환**이다. 키워드 목록에 없고 `wake`로도
오지 않으며, [dialog 모드](#1-2-dialog-모드-외국인-대화-번역)의 `status` 이벤트로 처리한다.

### "번역"이 들어간 말은 둘로 갈린다

| 말한 문장 | 가는 곳 | 이유 |
|---|---|---|
| "메뉴판 번역해줘", "간판 뭐라고 써있어" | `wake feature=image` → 이미지 번역 | 눈앞의 **글자**를 가리킴 |
| "번역해줘", "통역 켜줘", "외국인이랑 대화 번역" | `status: dialog` → 대화 번역 모드 | **사람**과의 대화 |

이미지 쪽 키워드(`메뉴판`·`간판`·`표지판` 등)가 먼저 판정되고, 걸리지 않을 때만 dialog 모드로 간다.

문장 판정(기능 키워드 + dialog 진입/종료어)은 전부 [`modules/stt/keyword_spotter.py`](modules/stt/keyword_spotter.py) 한 곳에 있고,
기능 실행은 [`service.py`](service.py)에서 관리한다.

### 아직 없는 것

- **환율(`exchange`) / 질문 응답(`qa`)** — 키워드만 등록되어 있고 핸들러가 없다.
