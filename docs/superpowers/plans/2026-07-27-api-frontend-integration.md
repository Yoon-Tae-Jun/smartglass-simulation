# API ↔ 프론트 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `web/`의 mock 백엔드 호출(`simApi.js`)을 실제 구현된 서버 API(map REST + STT WebSocket)에 연결하고, 미구현 기능은 mock임을 UI에 명시한다.

**Architecture:** 모든 백엔드 호출은 `web/src/lib/simApi.js` 한 파일에 격리돼 있다. 여기의 `getDirections`를 `POST /map/directions` 실호출로 바꾸고, 신규 `startVoiceCommand`로 `WS /stt/ws`(마이크→16kHz PCM 스트리밍)를 연결한다. `Simulation.jsx`에 전역 마이크 버튼을 추가해 음성 `wake`가 해당 오버레이를 자동 활성하고 navigate 결과를 `MapOverlay`에 주입한다. 서버 미구현 기능(번역/QA/이미지)은 mock을 유지하되 "MOCK" 배지로 표시한다.

**Tech Stack:** React 19, Vite 8, Tailwind 4, 브라우저 WebSocket / getUserMedia / AudioContext. 신규 의존성 없음.

## Global Constraints

- **서버(`server/`) 파일은 절대 수정하지 않는다.** 프론트(`web/`)만 변경.
- 공통 응답 포맷은 REST·WS 모두 `BaseResponse = { status, msg, data }`. **실패해도 HTTP는 200** → 성패는 본문 `status`로 판단.
- 커밋은 사용자의 명시적 지시가 있을 때만. 각 Task의 "Commit" 스텝은 **커밋 메시지 초안 제안**까지만 하고 실제 커밋은 사용자 승인 후 실행.
- 신규 npm 의존성 추가 금지.
- 커밋 메시지는 팀 컨벤션 `타입태그: 동사 subject` (예: `feat: 지도 API 실연동 추가`).
- **테스트 인프라 부재**: `web/`에 테스트 러너가 없다. 각 Task의 검증은 `npm run lint`(oxlint) + `npm run build`(vite) 통과 + 명시된 수동 브라우저 확인으로 갈음한다. 실제 음성/경로 동작은 사용자가 NAVER·CLOVA 키 설정 후 확인한다.
- 명령은 `web/` 디렉터리에서 실행: `cd web && npm run lint` 등.

---

### Task 1: Base URL 설정 + 지도 REST 실연동

**Files:**
- Modify: `web/src/lib/simApi.js` (상단 상수 추가, `getDirections` 교체)
- Create: `web/.env.example`

**Interfaces:**
- Produces: `getDirections({ origin, destination }) => Promise<{status, msg, data}>` — 서버 `POST /map/directions` 결과를 그대로 반환, 네트워크 실패 시 `{status:502, msg, data:null}`.
- Produces (모듈 상수): `HTTP_BASE`, `WS_BASE` — 이후 Task 2에서 사용.

- [ ] **Step 1: `.env.example` 작성**

Create `web/.env.example`:

```
# 백엔드 API 주소 (WebSocket 주소는 http→ws 자동 변환)
VITE_API_BASE=http://localhost:8000
```

- [ ] **Step 2: simApi.js 상단에 base URL 상수 추가**

`web/src/lib/simApi.js`의 기존 주석 블록 바로 아래(`const ok = ...` 위)에 추가:

```js
// 백엔드 주소 (env 없으면 로컬 기본값). WS는 http→ws 로 파생.
const HTTP_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const WS_BASE = HTTP_BASE.replace(/^http/, 'ws')
```

- [ ] **Step 3: `getDirections` mock을 실호출로 교체**

기존 `getDirections`(주석 `// TODO(윤태준)...` 포함 함수 전체)를 아래로 교체:

```js
// ── 길찾기 (F-MAP) ────────────────────────────────────────────
// POST /map/directions — req: { origin(도로명주소), destination(상호명/주소) }
// 서버가 BaseResponse를 주므로 그대로 반환한다. (실패도 HTTP 200)
export async function getDirections({ origin, destination }) {
  try {
    const res = await fetch(`${HTTP_BASE}/map/directions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination }),
    })
    return await res.json()
  } catch (e) {
    // 네트워크/파싱 실패는 공통 포맷으로 감싸 오버레이가 msg를 표시하게 한다
    return { status: 502, msg: `서버에 연결할 수 없습니다: ${e?.message ?? e}`, data: null }
  }
}
```

- [ ] **Step 4: lint + build 통과 확인**

Run: `cd web && npm run lint && npm run build`
Expected: 둘 다 에러 없이 통과. (오래된 mock 참조로 인한 unused 경고 없어야 함)

- [ ] **Step 5: 커밋 초안 제안 (사용자 승인 후 실행)**

제안 메시지:
```
feat: 지도 길찾기 API 실연동 (POST /map/directions)
```
`git add web/src/lib/simApi.js web/.env.example` 후 위 메시지로 커밋 제안. 사용자가 지시하면 실행.

---

### Task 2: 음성 명령 WebSocket 연동 (`startVoiceCommand`)

**Files:**
- Modify: `web/src/lib/simApi.js` (신규 export + PCM 헬퍼 추가)

**Interfaces:**
- Consumes: `WS_BASE` (Task 1).
- Produces: `startVoiceCommand({ origin, language='ko', execute=true, onEvent }) => { stop() }`.
  `onEvent(evt)`의 `evt`는 아래 5종:
  - `{ kind:'partial', text }`
  - `{ kind:'final', text }`
  - `{ kind:'wake', feature, text }` (feature: 서버 이름 navigate|translate|exchange|qa)
  - `{ kind:'result', feature, text, data }` (navigate만 실제 data)
  - `{ kind:'error', status, msg }`

- [ ] **Step 1: PCM 변환 헬퍼 추가**

`simApi.js` 맨 아래에 추가 (API.md 예제와 동일):

```js
// ── 마이크 오디오 → 16kHz 모노 16bit PCM 변환 헬퍼 ───────────────
function downsampleTo16k(buffer, inRate) {
  const outRate = 16000
  if (inRate === outRate) return buffer
  const ratio = inRate / outRate
  const newLen = Math.round(buffer.length / ratio)
  const result = new Float32Array(newLen)
  let oR = 0, oB = 0
  while (oR < newLen) {
    const next = Math.round((oR + 1) * ratio)
    let acc = 0, cnt = 0
    for (let i = oB; i < next && i < buffer.length; i++) { acc += buffer[i]; cnt++ }
    result[oR++] = acc / (cnt || 1)
    oB = next
  }
  return result
}

function floatTo16BitPCM(input) {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}
```

- [ ] **Step 2: 서버 메시지 정규화 함수 추가**

PCM 헬퍼 위에 추가:

```js
// 서버 BaseResponse → 프론트 이벤트로 정규화.
// data.type 있으면 인식 이벤트(partial|final|wake), 없으면 기능 실행 결과.
function normalizeStt(res) {
  if (!res || res.status !== 200) {
    return { kind: 'error', status: res?.status ?? 0, msg: res?.msg ?? '알 수 없는 오류' }
  }
  const d = res.data ?? {}
  if (d.type) return { kind: d.type, feature: d.feature ?? null, text: d.text }
  return { kind: 'result', feature: d.feature, text: d.text, data: d.data }
}
```

- [ ] **Step 3: `startVoiceCommand` 구현**

기존 `startTranslateStream` 위(또는 아래 아무 곳, mock 섹션과 구분되게)에 추가:

```js
// ── 음성 명령 (WS /stt/ws, 실연동) ─────────────────────────────
// 마이크 오디오를 16kHz PCM으로 서버에 스트리밍하고, 서버가 보내는
// 인식 자막 / 명령어 감지(wake) / 기능 실행 결과를 onEvent로 흘려보낸다.
// origin: 현재 위치(도로명 주소) — navigate 출발지. 반환값 .stop() 으로 종료.
export function startVoiceCommand({ origin, language = 'ko', execute = true, onEvent }) {
  const params = new URLSearchParams({ language, execute: String(execute) })
  if (origin) params.set('origin', origin)

  const ws = new WebSocket(`${WS_BASE}/stt/ws?${params.toString()}`)
  ws.binaryType = 'arraybuffer'

  let ctx = null, stream = null, proc = null, mute = null, closed = false

  function cleanup() {
    closed = true
    try { if (proc) { proc.onaudioprocess = null; proc.disconnect() } } catch { /* noop */ }
    try { if (mute) mute.disconnect() } catch { /* noop */ }
    try { if (ctx) ctx.close() } catch { /* noop */ }
    try { if (stream) stream.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
  }

  ws.onmessage = (ev) => {
    let res
    try { res = JSON.parse(ev.data) } catch { return }
    onEvent(normalizeStt(res))
  }
  ws.onerror = () => onEvent({ kind: 'error', status: 0, msg: '음성 서버에 연결할 수 없습니다' })
  ws.onclose = () => cleanup()

  ws.onopen = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      onEvent({ kind: 'error', status: 403, msg: `마이크를 사용할 수 없습니다: ${e?.name ?? e}` })
      try { ws.close() } catch { /* noop */ }
      return
    }
    if (closed) { stream.getTracks().forEach((t) => t.stop()); return }

    ctx = new AudioContext()
    const src = ctx.createMediaStreamSource(stream)
    proc = ctx.createScriptProcessor(4096, 1, 1)
    mute = ctx.createGain()
    mute.gain.value = 0 // 스피커 피드백 방지
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination)

    proc.onaudioprocess = (e) => {
      if (ws.readyState !== 1) return
      const pcm = floatTo16BitPCM(downsampleTo16k(e.inputBuffer.getChannelData(0), ctx.sampleRate))
      ws.send(pcm)
    }
  }

  return {
    stop() {
      if (ws.readyState === 1) {
        try { ws.send(JSON.stringify({ action: 'stop' })) } catch { /* noop */ }
        ws.close()
      }
      cleanup()
    },
  }
}
```

- [ ] **Step 4: lint + build 통과 확인**

Run: `cd web && npm run lint && npm run build`
Expected: 통과. (oxlint의 빈 catch 규칙에 걸리면 `/* noop */` 주석으로 회피 — 위 코드에 이미 반영)

- [ ] **Step 5: 커밋 초안 제안**

```
feat: 음성 명령 WebSocket 연동 (WS /stt/ws, 마이크 PCM 스트리밍)
```
`git add web/src/lib/simApi.js` 후 제안. 승인 시 실행.

---

### Task 3: 미구현 기능 mock 명시 ("MOCK" 배지)

**Files:**
- Create: `web/src/components/sim/MockBadge.jsx`
- Modify: `web/src/lib/simApi.js` (`askQuestion`, `translateImage`, `startTranslateStream` 응답에 `mock:true`)
- Modify: `web/src/components/sim/overlays/TranslateOverlay.jsx`
- Modify: `web/src/components/sim/overlays/QaOverlay.jsx`
- Modify: `web/src/components/sim/overlays/ImageTranslateOverlay.jsx`

**Interfaces:**
- Produces: `<MockBadge />` — 서버 미구현 기능임을 알리는 배지.

- [ ] **Step 1: MockBadge 컴포넌트 작성**

Create `web/src/components/sim/MockBadge.jsx`:

```jsx
// 서버 미구현 기능(번역·QA·이미지)에 붙여 실데이터가 아님을 알리는 배지.
export default function MockBadge() {
  return (
    <span className="ml-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 align-middle font-mono text-[10px] tracking-wide text-amber-200/90">
      MOCK
    </span>
  )
}
```

- [ ] **Step 2: simApi mock 응답에 `mock:true` 표시**

`askQuestion`의 `ok({...})`에 `mock: true` 추가:
```js
  return ok({
    question,
    mock: true,
    answer:
      '경복궁은 조선 왕조의 정궁으로, 지하철 3호선 경복궁역 5번 출구에서 도보 5분 거리입니다. 관람 시간은 오전 9시부터이며 화요일은 휴관입니다.',
  })
```
`translateImage`의 `ok({...})`에 `mock: true` 추가:
```js
  return ok({
    mock: true,
    label: '메뉴판 번역 완료 (mock)',
    lines: [
```
`startTranslateStream`의 각 `convo` 항목은 그대로 두고, `onCaption` 호출부는 유지. (배지는 오버레이가 항상 표시하므로 caption 수정 불필요.)

- [ ] **Step 3: TranslateOverlay에 배지 추가**

`TranslateOverlay.jsx` 상단 `import` 아래에 추가:
```js
import MockBadge from '../MockBadge.jsx'
```
`eyebrow` span 안, `langs.target` 뒤에 `<MockBadge />` 삽입:
```jsx
        <span className="flex items-center justify-center gap-2 eyebrow text-sky/70">
          실시간 번역 · {langs.source} <span className="text-sky">⇄</span> {langs.target}
          <MockBadge />
        </span>
```

- [ ] **Step 4: QaOverlay에 배지 추가**

`QaOverlay.jsx` import 아래:
```js
import MockBadge from '../MockBadge.jsx'
```
`eyebrow` span 수정:
```jsx
        <span className="eyebrow text-sky/70">질문 응답<MockBadge /></span>
```

- [ ] **Step 5: ImageTranslateOverlay에 배지 추가**

`ImageTranslateOverlay.jsx` import 아래:
```js
import MockBadge from '../MockBadge.jsx'
```
결과 표시부 `eyebrow` span 수정:
```jsx
            <span className="eyebrow text-sky/70">{result?.label}<MockBadge /></span>
```

- [ ] **Step 6: lint + build + 수동 확인**

Run: `cd web && npm run lint && npm run build`
Expected: 통과.
수동: `npm run dev` 후 번역/질문응답/이미지 기능 버튼을 눌러 각 오버레이에 "MOCK" 배지가 보이는지 확인.

- [ ] **Step 7: 커밋 초안 제안**

```
feat: 미구현 기능(번역·QA·이미지) mock 배지 표시
```

---

### Task 4: MapOverlay — 음성 결과 주입 + 서울 기본값

**Files:**
- Modify: `web/src/components/sim/overlays/MapOverlay.jsx`

**Interfaces:**
- Consumes: `getDirections` (Task 1), 음성 `result.data`(DirectionsData, Task 5에서 주입).
- Produces: `<MapOverlay origin? destination? directions? />` — `directions`가 있으면 그것을 렌더, 없으면 `getDirections` 호출.

- [ ] **Step 1: props 시그니처와 기본값 변경**

`MapOverlay` 함수 시그니처를 교체:
```jsx
export default function MapOverlay({
  origin = '서울특별시 중구 세종대로 110',
  destination = '경복궁',
  directions = null,
}) {
```

- [ ] **Step 2: useEffect에서 directions 우선 처리**

기존 `useEffect` 블록을 교체:
```jsx
  useEffect(() => {
    // 음성 명령으로 이미 받은 경로가 있으면 그대로 사용 (재요청 안 함)
    if (directions) {
      setData(directions)
      setErr(null)
      return
    }
    let alive = true
    setData(null)
    setErr(null)
    getDirections({ origin, destination }).then((res) => {
      if (!alive) return
      if (res.status === 200 && res.data) setData(res.data)
      else setErr(res.msg) // FR-MAP-6: 실패 시 msg 표시
    })
    return () => {
      alive = false
    }
  }, [origin, destination, directions])
```

- [ ] **Step 3: lint + build + 수동 확인**

Run: `cd web && npm run lint && npm run build`
Expected: 통과.
수동(서버·NAVER 키 있을 때): 길찾기 버튼 → 서울시청→경복궁 실경로가 뜨는지. 키 없을 때는 "경로를 찾을 수 없습니다: {msg}"가 뜨는지.

- [ ] **Step 4: 커밋 초안 제안**

```
feat: MapOverlay 음성 경로 주입 지원 및 데모 기본값 서울로 변경
```

---

### Task 5: Simulation.jsx — 전역 마이크 버튼 + 음성 배선

**Files:**
- Modify: `web/src/pages/Simulation.jsx`

**Interfaces:**
- Consumes: `startVoiceCommand` (Task 2), `<MapOverlay directions>` (Task 4).

- [ ] **Step 1: import 및 상수 추가**

`Simulation.jsx` 상단 import에 추가:
```js
import { startVoiceCommand } from '../lib/simApi.js'
```
`FEATURE_LABEL` 아래에 서버 feature→프론트 key 매핑과 데모 출발지 추가:
```js
// 서버가 감지한 기능 이름 → 프론트 오버레이 key
const FEATURE_KEY = { navigate: 'map', translate: 'translate', qa: 'qa' }
// 데모 현재 위치(길찾기 출발지). API.md 검증 주소.
const DEMO_ORIGIN = '서울특별시 중구 세종대로 110'
```

- [ ] **Step 2: 음성 상태 및 핸들러 추가**

`webcamRef` 선언 아래에 상태와 ref 추가:
```js
  const [listening, setListening] = useState(false)
  const [voiceCaption, setVoiceCaption] = useState(null) // { text, final } | { error }
  const [voiceDirections, setVoiceDirections] = useState(null) // 음성 navigate 결과
  const voiceCtrl = useRef(null)
```
`handleToggle` 아래에 음성 토글 핸들러 추가:
```js
  function handleVoiceEvent(evt) {
    if (evt.kind === 'partial' || evt.kind === 'final') {
      setVoiceCaption({ text: evt.text, final: evt.kind === 'final' })
    } else if (evt.kind === 'wake') {
      const key = FEATURE_KEY[evt.feature]
      if (key) setActiveFeature(key) // 음성으로 기능 호출
    } else if (evt.kind === 'result' && evt.feature === 'navigate' && evt.data) {
      setVoiceDirections(evt.data)
      setActiveFeature('map')
    } else if (evt.kind === 'error') {
      setVoiceCaption({ error: evt.msg })
    }
  }

  function toggleVoice() {
    if (listening) {
      voiceCtrl.current?.stop()
      voiceCtrl.current = null
      setListening(false)
      return
    }
    setVoiceCaption(null)
    setVoiceDirections(null)
    voiceCtrl.current = startVoiceCommand({
      origin: DEMO_ORIGIN,
      language: 'ko',
      onEvent: handleVoiceEvent,
    })
    setListening(true)
  }
```

- [ ] **Step 3: 언마운트 시 정리**

기존 설정 팝오버 `useEffect` 아래에 추가:
```js
  // 언마운트 시 음성 세션 정리
  useEffect(() => () => voiceCtrl.current?.stop(), [])
```

- [ ] **Step 4: 헤더에 마이크 버튼 추가**

헤더의 설정 톱니 버튼 `<div className="relative">` 바로 앞(같은 `flex items-center gap-4` 안, `SIMULATION` eyebrow 뒤)에 삽입:
```jsx
          {/* 음성 명령 마이크 */}
          <button
            type="button"
            onClick={toggleVoice}
            aria-label="음성 명령"
            aria-pressed={listening}
            className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg transition-all ${
              listening
                ? 'border-sky bg-sky/15 text-sky-bright shadow-[0_0_18px_rgba(45,169,239,0.4)] glow-pulse'
                : 'border-white/15 text-white/70 hover:border-white/30 hover:text-white'
            }`}
          >
            🎙️
          </button>
```

- [ ] **Step 5: 라이브 자막 오버레이 추가**

중앙 뷰포트 `<div className="relative aspect-video ...">` 안, 오버레이 렌더 블록 아래(닫는 `</div>` 전)에 삽입:
```jsx
            {/* 음성 인식 라이브 자막 */}
            {listening && (
              <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center px-6">
                <div className="hud-chip max-w-lg text-center">
                  <span className="eyebrow text-sky/70">음성 인식 중…</span>
                  {voiceCaption?.error ? (
                    <p className="mt-1 text-sm text-white/70">{voiceCaption.error}</p>
                  ) : (
                    <p className={`mt-1 text-sm ${voiceCaption?.final ? 'text-white' : 'text-white/60'}`}>
                      {voiceCaption?.text ?? '말씀해 주세요'}
                    </p>
                  )}
                </div>
              </div>
            )}
```

- [ ] **Step 6: MapOverlay에 음성 경로 주입**

`{activeFeature === 'map' && <MapOverlay />}` 를 교체:
```jsx
            {activeFeature === 'map' && <MapOverlay directions={voiceDirections} />}
```

- [ ] **Step 7: lint + build + 수동 확인**

Run: `cd web && npm run lint && npm run build`
Expected: 통과.
수동:
- `npm run dev` → 🎙️ 버튼 클릭 시 마이크 권한 요청이 뜨는지, 켜짐 상태(글로우)로 바뀌는지.
- 키 없는 환경: 서버 미실행이면 자막에 "음성 서버에 연결할 수 없습니다", 서버는 있고 CLOVA 키 없으면 서버가 보내는 500 msg가 자막에 뜨는지.
- 버튼 클릭 경로(번역/QA/이미지/길찾기)가 기존대로 동작하는지(회귀 없음).

- [ ] **Step 8: 커밋 초안 제안**

```
feat: 전역 마이크 버튼으로 음성 명령 연동 (자막·기능 자동 활성·경로 주입)
```

---

## Self-Review

**Spec coverage:**
- 설정/Base URL → Task 1 ✅
- getDirections 실연동 → Task 1 ✅
- startVoiceCommand(WS+마이크) → Task 2 ✅
- mock 명시(배지) → Task 3 ✅
- MapOverlay directions 주입 + 서울 기본값 → Task 4 ✅
- Simulation 마이크 버튼/자막/wake→오버레이/result→경로 → Task 5 ✅
- 정직성(navigate만 실동작, 나머지 mock) → Task 3 배지 + Task 5 wake 매핑(exchange는 오버레이 없어 무시) ✅
- 에러 처리(마이크 거부/서버 500/네트워크 502) → Task 1(502) + Task 2(error 이벤트) + Task 5(자막 표시) ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. TBD/TODO 없음. ✅

**Type consistency:**
- `startVoiceCommand({origin,language,execute,onEvent}) → {stop()}` — Task 2 정의, Task 5 소비 일치 ✅
- `onEvent` 이벤트 `kind`: partial/final/wake/result/error — Task 2 정의, Task 5 `handleVoiceEvent` 분기 일치 ✅
- `getDirections` 반환 `{status,msg,data}` — Task 1 정의, Task 4 소비 일치 ✅
- `FEATURE_KEY`(navigate/translate/qa) — Task 5 내부 일관 ✅
- `<MapOverlay directions={...}>` prop — Task 4 정의, Task 5 사용 일치 ✅

빠진 스펙 요구사항 없음. 계획 확정.
