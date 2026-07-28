// ─────────────────────────────────────────────────────────────
// 시뮬레이션 API 경계
// 서버와 동일한 공통 응답 포맷 { status, msg, data }(BaseResponse)를 다룬다.
// 실연동: 길찾기(POST /map/directions), 이미지 번역(POST /imgPapago/image),
//        음성 명령(WS /stt/ws).
// 질문응답(qa)은 서버 미구현이라 여기서 제공하지 않는다(오버레이가 '준비 중' 표시).
// ─────────────────────────────────────────────────────────────

// 백엔드 주소 (env 없으면 로컬 기본값). WS는 http→ws 로 파생.
const HTTP_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const WS_BASE = HTTP_BASE
  ? HTTP_BASE.replace(/^http/, 'ws')
  : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`


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

// ── 이미지 번역 (F-IMG) ───────────────────────────────────────
// POST /imgPapago/image — req: { image, source, target }
//   image: base64. canvas.toDataURL()의 data URL을 그대로 넣어도 된다
//   source: 'auto'면 파파고가 원본 언어를 판별 / target: 번역할 언어
// 응답 data: { rendered_image(base64, 'data:' 접두사 없음), source_text, target_text }
// 파파고 제약: JPG·PNG 등 20MB·1960×1960px 이내 (웹캠 프레임은 여유 있음)
export async function translateImage({ image, source = 'auto', target = 'ko' }) {
  try {
    const res = await fetch(`${HTTP_BASE}/imgPapago/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, source, target }),
    })
    return await res.json()
  } catch (e) {
    return { status: 502, msg: `서버에 연결할 수 없습니다: ${e?.message ?? e}`, data: null }
  }
}

// ── 현재 위치 (F-MAP 출발지) ──────────────────────────────────
// 브라우저 Geolocation → { lat, lng }. 미지원·거부·타임아웃이면 null.
// 좌표를 못 넘기면 목적지만 말한 길찾기는 서버가 400으로 돌려준다.
export function getCurrentLocation({ timeout = 8000 } = {}) {
  if (!navigator.geolocation) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null), // 거부/실패도 좌표 없음으로 취급하고 인식은 계속한다
      { enableHighAccuracy: true, timeout, maximumAge: 60_000 },
    )
  })
}

// ── 음성 명령 (WS /stt/ws, 실연동) ─────────────────────────────
// 서버 BaseResponse → 프론트 이벤트로 정규화.
// data.type 있으면 인식 이벤트(partial|final|wake), 없으면 기능 실행 결과.
function normalizeStt(res) {
  if (!res || res.status !== 200) {
    return { kind: 'error', status: res?.status ?? 0, msg: res?.msg ?? '알 수 없는 오류' }
  }
  const d = res.data ?? {}
  // type 있으면 인식 이벤트(partial|final|wake|status|capture). mode에 현재 세션 상태
  // (idle=호출어 대기 / listening=명령 수신 / dialog=대화 번역)가 실려 온다.
  // dialog 모드의 partial|final은 translated(번역문)를 함께 싣는다.
  // capture는 "지금 화면을 찍어 보내라"는 요청 — 3초 안에 sendFrame()으로 답해야 한다.
  if (d.type) {
    return {
      kind: d.type,
      feature: d.feature ?? null,
      text: d.text,
      translated: d.translated ?? null,
      mode: d.mode ?? null,
    }
  }
  return { kind: 'result', feature: d.feature, text: d.text, data: d.data }
}

// 마이크 오디오를 16kHz PCM으로 서버에 스트리밍하고, 서버가 보내는
// 인식 자막 / 명령어 감지(wake) / 기능 실행 결과를 onEvent로 흘려보낸다.
// 화면에 들어온 순간 한 번 열어 두고 계속 유지하는 세션이다. 서버는 호출어("헤이 글래스")를
// 들을 때까지 idle 상태로 아무것도 내보내지 않고, 호출어를 들으면 listening으로 바뀐다.
// location: 현재 위치 좌표 { lat, lng } — 목적지만 말했을 때 navigate 출발지로
//   쓰인다(서버가 도로명 주소로 역변환).
// 반환값 .wake()/.sleep() 으로 호출어 없이 상태를 바꾸고, .stop() 으로 종료.
export function startVoiceCommand({ location, language = 'ko', execute = true, onEvent }) {
  const params = new URLSearchParams({ language, execute: String(execute) })
  // 서버는 lat/lng가 둘 다 있어야 현재 위치로 인정한다
  if (location?.lat != null && location?.lng != null) {
    params.set('lat', String(location.lat))
    params.set('lng', String(location.lng))
  }

  const ws = new WebSocket(`${WS_BASE}/stt/ws?${params.toString()}`)
  ws.binaryType = 'arraybuffer'

  let ctx = null, stream = null, proc = null, mute = null, closed = false
  const queued = [] // 아직 연결 중일 때 호출된 제어 메시지 (열린 직후에 보낸다)

  function cleanup() {
    if (closed) return // stop()과 ws.onclose가 둘 다 부를 수 있어 한 번만 실행
    closed = true
    try { if (proc) { proc.onaudioprocess = null; proc.disconnect() } } catch { /* noop */ }
    try { if (mute) mute.disconnect() } catch { /* noop */ }
    // close()는 Promise라 이미 닫힌 컨텍스트면 reject → 상태 확인 + catch로 삼킨다
    try { if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {}) } catch { /* noop */ }
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
    // 마이크 권한을 기다리기 전에 먼저 흘려보낸다 (상태 전환은 오디오가 필요 없다)
    queued.splice(0).forEach((payload) => send(payload))

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

  function send(payload) {
    if (closed) return false
    // 아직 연결 중(0)이면 버린 것처럼 보이지 않게 모아두고 onopen에서 보낸다
    if (ws.readyState === 0) {
      queued.push(payload)
      return true
    }
    if (ws.readyState !== 1) return false
    try {
      ws.send(JSON.stringify(payload))
      return true
    } catch {
      return false
    }
  }

  return {
    // capture 이벤트에 대한 응답 — 방금 찍은 화면을 서버로 보낸다(data URL 그대로 OK).
    // 서버는 3초만 기다리므로 capture를 받은 즉시 호출해야 한다.
    sendFrame(image) {
      return send({ action: 'frame', image })
    },
    // 기능 버튼을 눌렀을 때 — 호출어를 건너뛰고 바로 명령 수신 상태로 넘긴다.
    // mode='dialog'면 대화 번역 모드(영어→한국어)로 곧장 들어간다.
    wake(mode) {
      return send(mode ? { action: 'wake', mode } : { action: 'wake' })
    },
    // 기능을 껐을 때 — 타임아웃을 기다리지 않고 호출어 대기 상태로 되돌린다.
    sleep() {
      return send({ action: 'sleep' })
    },
    stop() {
      if (ws.readyState === 1) {
        send({ action: 'stop' })
        ws.close()
      }
      cleanup()
    },
  }
}

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
