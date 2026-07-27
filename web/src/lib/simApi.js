// ─────────────────────────────────────────────────────────────
// 시뮬레이션 API 경계
// 서버와 동일한 공통 응답 포맷 { status, msg, data }(BaseResponse)를 다룬다.
// 실연동: 길찾기(POST /map/directions), 음성 명령(WS /stt/ws).
// 번역·질문응답·이미지 번역은 서버 미구현이라 여기서 제공하지 않는다(오버레이가 '준비 중' 표시).
// ─────────────────────────────────────────────────────────────

// 백엔드 주소 (env 없으면 로컬 기본값). WS는 http→ws 로 파생.
const HTTP_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'
const WS_BASE = HTTP_BASE.replace(/^http/, 'ws')

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

// ── 음성 명령 (WS /stt/ws, 실연동) ─────────────────────────────
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
