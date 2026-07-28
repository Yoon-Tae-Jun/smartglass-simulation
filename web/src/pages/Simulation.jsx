import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import WebcamView from '../components/sim/WebcamView.jsx'
import TempleRail from '../components/sim/TempleRail.jsx'
import SettingsPanel from '../components/sim/SettingsPanel.jsx'
import TranslateOverlay from '../components/sim/overlays/TranslateOverlay.jsx'
import ImageTranslateOverlay from '../components/sim/overlays/ImageTranslateOverlay.jsx'
import MapOverlay from '../components/sim/overlays/MapOverlay.jsx'
import QaOverlay from '../components/sim/overlays/QaOverlay.jsx'
import { getCurrentLocation, startVoiceCommand, translateImage } from '../lib/simApi.js'

const FEATURE_LABEL = {
  translate: '실시간 음성 번역',
  image: '이미지 번역',
  map: '길찾기',
  qa: 'AI에게 질문하기',
}

// 서버가 감지한 기능 이름 → 프론트 오버레이 key
const FEATURE_KEY = { navigate: 'map', translate: 'translate', qa: 'qa', image: 'image' }

// 설정의 언어 이름 → 파파고 언어 코드 (이미지 번역 target)
const LANG_CODE = { 한국어: 'ko', 영어: 'en', 일본어: 'ja', 중국어: 'zh-CN' }

// 버튼을 누르면 호출어 없이 바로 명령 수신 상태로 들어가는 기능들 (이미지 번역은 음성 없음)
const VOICE_FEATURES = new Set(['translate', 'map', 'qa'])

// 안경 다리에 배치할 기능 — 좌: 번역·이미지 / 우: 길찾기·Q&A
const LEFT_FEATURES = [
  { key: 'translate', label: '실시간 음성 번역', icon: '💬' },
  { key: 'image', label: '이미지 번역', icon: '🖼️' },
]
const RIGHT_FEATURES = [
  { key: 'map', label: '길찾기', icon: '🧭' },
  { key: 'qa', label: 'AI에게 질문하기', icon: '🎙️' },
]

export default function Simulation() {
  // 한 번에 주 기능 1개만 활성 (FR-SYS-3)
  const [activeFeature, setActiveFeature] = useState(null)
  const [frameDataUrl, setFrameDataUrl] = useState(null) // 이미지 번역용 freeze 프레임
  const [imageResult, setImageResult] = useState(null) // { rendered_image, source_text, target_text }
  const [imagePending, setImagePending] = useState(false) // 번역 요청 진행 중
  const [imageError, setImageError] = useState(null) // 이미지 번역 실패 msg
  const [settings, setSettings] = useState({
    region: '서울',
    sourceLang: '일본어', // 상대 언어
    targetLang: '한국어', // 내 언어
    tts: true,
  })
  const [cameras, setCameras] = useState([]) // 연결된 videoinput 장치 목록
  const [selectedCamera, setSelectedCamera] = useState('') // 선택된 deviceId ('' = 기본)
  const [settingsOpen, setSettingsOpen] = useState(false) // 상단 ⚙ 설정 팝오버
  const webcamRef = useRef(null)

  // 음성 명령 (WS /stt/ws) — 화면에 들어온 순간 세션을 열고 나갈 때까지 유지한다.
  // 상태는 서버가 status 이벤트로 알려주는 값만 믿는다 (프론트가 따로 추측하지 않는다).
  const [voiceMode, setVoiceMode] = useState('idle') // idle(호출어 대기) | listening | dialog
  const [voiceCaption, setVoiceCaption] = useState(null) // { text, final } | { error }
  const [command, setCommand] = useState(null) // 마지막 음성 명령 { text, feature }
  const [commandError, setCommandError] = useState(null) // 기능 실행 실패 msg (501 등)
  const [voiceDirections, setVoiceDirections] = useState(null) // 음성 navigate 결과
  const [dialogLine, setDialogLine] = useState(null) // { text, translated, final } | null
  const voiceCtrl = useRef(null)
  const commandRef = useRef(null) // 콜백 클로저에서 최신 명령을 참조
  const voiceModeRef = useRef('idle') // 콜백 클로저에서 최신 세션 상태를 참조
  const voiceFeatureRef = useRef(null) // 음성 세션이 묶인 기능(null=호출어 경로, 서버 자유 라우팅)
  const pendingWakeRef = useRef(null) // 소켓이 열리기 전에 누른 기능 버튼 { mode }
  const imageSession = useRef(0) // 번역 응답이 도착했을 때 아직 유효한 요청인지 판별
  const imagePendingRef = useRef(false) // 콜백 클로저에서 최신 진행 여부를 참조
  const settingsRef = useRef(settings) // 음성 콜백 클로저에서 최신 설정을 참조

  // idle은 "호출어를 기다리는 중"이라 사용자 입장에선 인식이 꺼진 것과 같다
  const listening = voiceMode !== 'idle'
  const dialogActive = voiceMode === 'dialog'

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  // 설정 팝오버: ESC로 닫기
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e) => e.key === 'Escape' && setSettingsOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  // 화면에 들어오는 즉시 음성 세션을 열고, 나갈 때까지 계속 듣는다.
  // 서버는 호출어("헤이 글래스")를 듣기 전까지 idle 상태로 아무것도 내려보내지 않으므로,
  // 상시 연결이어도 자막이나 기능이 멋대로 뜨지 않는다.
  // 위치는 목적지만 말한 길찾기의 출발지로 쓰이므로 접속 전에 한 번 받아둔다.
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const location = await getCurrentLocation()
      if (cancelled) return // 위치를 기다리는 사이 화면을 벗어난 경우
      // 좌표를 못 받아도 인식은 진행한다 ("○○에서 △△까지"처럼 출발지를 말하면 됨)
      voiceCtrl.current = startVoiceCommand({
        location,
        language: 'ko',
        onEvent: handleVoiceEvent,
      })
      // 위치를 기다리는 사이에 기능 버튼을 눌렀다면 이제 반영한다
      const pending = pendingWakeRef.current
      pendingWakeRef.current = null
      if (pending) voiceCtrl.current.wake(pending.mode)
    })()

    return () => {
      cancelled = true
      voiceCtrl.current?.stop()
      voiceCtrl.current = null
    }
    // handleVoiceEvent는 상태 setter와 ref만 건드리므로 처음 값으로 계속 써도 안전하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 버튼 토글 (FR-SYS-4): 같은 기능이면 off, 다르면 교체
  function handleToggle(key) {
    const next = activeFeature === key ? null : key
    setActiveFeature(next)

    // 이미지 번역 진입 시 현재 프레임을 캡처해 고정하고 곧바로 번역을 요청한다
    if (next === 'image') {
      captureAndTranslate()
    } else {
      imageSession.current += 1 // 진행 중이던 번역 응답 무시
      setFrameDataUrl(null)
      setImageResult(null)
      markImagePending(false)
      setImageError(null)
    }

    // 인식 기능이면 호출어를 건너뛰고 바로 명령 수신 상태로, 아니면(이미지/off) 호출어 대기로.
    // 세션은 화면 진입 때 열어둔 하나를 계속 쓰므로 재접속이 없다.
    if (next && VOICE_FEATURES.has(next)) {
      voiceFeatureRef.current = next // 그 기능에 고정 (다른 기능이 감지돼도 오버레이를 안 바꾼다)
      setVoiceDirections(null)
      setCommandError(null)
      setCommand(null)
      commandRef.current = null
      setVoiceCaption(null)
      // 번역 버튼은 명령을 기다리지 않고 곧장 대화 번역(영어→한국어)으로 들어간다
      requestWake(next === 'translate' ? 'dialog' : undefined)
    } else {
      voiceFeatureRef.current = null
      requestSleep()
    }
  }

  // 번역 진행 여부는 음성 콜백(클로저)에서도 읽어야 해서 ref와 상태를 함께 갱신한다
  function markImagePending(value) {
    imagePendingRef.current = value
    setImagePending(value)
  }

  // 지금 웹캠 화면을 찍어 REST(POST /imgPapago/image)로 번역한다 (버튼 진입·다시 촬영).
  // 음성 명령으로 들어온 이미지 번역은 서버가 대신 파파고를 호출하므로 이 경로를 타지 않는다.
  async function captureAndTranslate() {
    const frame = webcamRef.current?.capture() ?? null
    const session = (imageSession.current += 1)

    setFrameDataUrl(frame)
    setImageResult(null)
    setImageError(null)
    if (!frame) {
      markImagePending(false)
      setImageError('카메라 화면을 캡처하지 못했습니다. 카메라 권한을 확인해 주세요')
      return
    }
    markImagePending(true)

    const target = LANG_CODE[settingsRef.current.targetLang] ?? 'ko'
    const res = await translateImage({ image: frame, target })
    if (session !== imageSession.current) return // 그사이 기능을 끄거나 다시 찍음

    markImagePending(false)
    if (res.status === 200 && res.data) setImageResult(res.data)
    else setImageError(res.msg) // 400 글자 없음 / 500 키 미설정 / 502 파파고 실패
  }

  // 마지막 명령을 상태와 ref에 함께 기록 (ref는 error 이벤트 분기용)
  function rememberCommand(evt) {
    const next = { text: evt.text, feature: evt.feature }
    commandRef.current = next
    setCommand(next)
  }

  // 음성 이벤트 처리: 자막 갱신 / wake → 오버레이 활성 / 실행 결과·실패 주입
  function handleVoiceEvent(evt) {
    // 버튼으로 연 세션이면 그 기능에 고정 — 서버가 다른 기능을 감지해도 오버레이를 바꾸지 않는다.
    const lock = voiceFeatureRef.current
    if (evt.kind === 'partial' || evt.kind === 'final') {
      // dialog(실시간 음성 번역) 모드에선 원문+번역을 번역 오버레이로 보낸다
      if (voiceModeRef.current === 'dialog') {
        setDialogLine({ text: evt.text, translated: evt.translated, final: evt.kind === 'final' })
      } else {
        setVoiceCaption({ text: evt.text, final: evt.kind === 'final' })
      }
    } else if (evt.kind === 'status') {
      // 서버가 알려주는 세션 상태 전환 (idle=호출어 대기 / listening=명령 수신 / dialog=대화 번역).
      // evt.text에는 "네, 듣고 있어요" 같은 안내문이 들어온다.
      const next = evt.mode ?? 'idle'
      voiceModeRef.current = next
      setVoiceMode(next)
      setDialogLine(null)
      if (next === 'idle') {
        // 호출어 대기로 돌아가면 고정도 풀린다 (오버레이는 결과를 볼 수 있게 그대로 둔다)
        voiceFeatureRef.current = null
        setVoiceCaption(null)
      } else {
        setVoiceCaption({ text: evt.text })
        if (next === 'dialog') {
          // 말로 대화 번역에 들어온 경우에도 번역 오버레이를 띄운다
          voiceFeatureRef.current = 'translate'
          setCommandError(null)
          setActiveFeature('translate')
        }
      }
    } else if (evt.kind === 'capture') {
      // 서버가 "지금 이 순간의 화면"을 요청했다 (이미지 번역). 3초 안에 답해야 한다.
      const frame = webcamRef.current?.capture() ?? null
      // 다른 기능에 고정된 세션이면 화면만 답해주고 이미지 UI는 건드리지 않는다
      if (lock && lock !== 'image') {
        voiceCtrl.current?.sendFrame(frame ?? '')
        return
      }
      imageSession.current += 1 // REST 경로의 응답이 끼어들지 않게 무효화
      setFrameDataUrl(frame) // 서버로 보낸 그 화면을 정지 화면으로 고정
      setImageResult(null)
      if (frame && voiceCtrl.current?.sendFrame(frame)) {
        setImageError(null)
        markImagePending(true)
      } else {
        markImagePending(false)
        setImageError('카메라 화면을 캡처하지 못했습니다. 카메라 권한을 확인해 주세요')
      }
    } else if (evt.kind === 'wake') {
      // 고정 세션에서 다른 기능이 감지되면 무시한다
      if (lock && FEATURE_KEY[evt.feature] !== lock) return
      // 새 명령이 시작됐으니 이전 결과는 비운다
      rememberCommand(evt)
      setCommandError(null)
      setVoiceDirections(null)
      if (evt.feature === 'image') {
        setImageResult(null)
        setImageError(null)
        markImagePending(true) // capture 요청이 곧 뒤따른다
      }
      const key = FEATURE_KEY[evt.feature]
      if (key) setActiveFeature(key) // 음성으로 기능 호출
    } else if (evt.kind === 'result') {
      // 고정 세션에서 다른 기능의 결과는 무시한다
      if (lock && evt.feature && FEATURE_KEY[evt.feature] !== lock) return
      rememberCommand(evt)
      setCommandError(null)
      if (evt.feature === 'navigate' && evt.data) {
        setVoiceDirections(evt.data) // 서버가 조회한 경로 그대로 렌더
        setActiveFeature('map')
      } else if (evt.feature === 'image' && evt.data) {
        // 서버가 파파고까지 호출한 결과 — REST 응답과 같은 형식이라 그대로 렌더
        markImagePending(false)
        setImageError(null)
        setImageResult(evt.data)
        setActiveFeature('image')
      }
    } else if (evt.kind === 'error') {
      // 연결·마이크 문제(0/403)는 자막에, 그 외는 실행 중인 기능의 실패로 본다
      const connectionIssue = evt.status === 0 || evt.status === 403
      if (connectionIssue || !commandRef.current) setVoiceCaption({ error: evt.msg })
      else setCommandError(evt.msg)
      // 이미지 번역을 기다리던 중이면 그 실패로 본다 (서버는 실패 msg만 보낸다)
      if (imagePendingRef.current) {
        markImagePending(false)
        if (!connectionIssue) setImageError(evt.msg)
      }
    }
  }

  // 호출어를 건너뛰고 바로 명령 수신 상태로. 세션이 아직 열리는 중이면(위치 조회 대기)
  // 눌린 사실을 기억해 두고 열린 직후에 보낸다 — 그냥 흘리면 버튼이 먹은 것처럼 보인다.
  function requestWake(mode) {
    if (voiceCtrl.current) voiceCtrl.current.wake(mode)
    else pendingWakeRef.current = { mode }
  }

  // 호출어 대기 상태로 복귀. 세션이 열리는 중이면 어차피 idle로 시작하므로 예약만 취소한다.
  function requestSleep() {
    if (voiceCtrl.current) voiceCtrl.current.sleep()
    else pendingWakeRef.current = null
  }

  // 헤더 마이크 토글: 호출어를 부르는 대신 눌러서 바로 명령을 말한다.
  // 세션 자체는 계속 열려 있으므로 서버 상태(idle ↔ listening)만 오간다.
  function toggleVoice() {
    voiceFeatureRef.current = null // 어떤 기능이 올지 모르는 자유 라우팅
    if (listening) {
      requestSleep()
      return
    }
    setVoiceCaption(null)
    setCommandError(null)
    requestWake()
  }

  // 마지막 음성 명령이 지금 열려 있는 오버레이의 것일 때만 그 값을 넘긴다.
  // (버튼으로 연 오버레이에 다른 기능의 문장/에러가 새는 걸 막는다)
  const commandActive = command != null && FEATURE_KEY[command.feature] === activeFeature
  const commandText = commandActive ? command.text : null
  const activeError = commandActive ? commandError : null

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-navy-deep text-white">
      {/* 배경 글로우 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 700px at 50% 42%, rgba(45,169,239,0.12), transparent 60%), #06121a',
        }}
      />

      {/* 홈에서 넘어온 빛 번짐이 서서히 걷히는 연출 */}
      <div
        className="sim-flash pointer-events-none absolute inset-0 z-50"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, #eaf9ff 0%, #7fd4ff 40%, #2da9ef 100%)',
        }}
      />

      {/* 상단 바 */}
      <header className="relative z-30 flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link
          to="/"
          className="font-display text-lg font-bold tracking-tight text-white/90 hover:text-white sm:text-xl"
        >
          ← NAY-BEN<span className="text-sky">.</span>
        </Link>

        <div className="flex items-center gap-4">
          <span className="eyebrow text-white/50">SIMULATION</span>

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

          {/* 설정 톱니 + 팝오버 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-label="설정"
              aria-expanded={settingsOpen}
              className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg transition-all ${
                settingsOpen
                  ? 'border-sky bg-sky/15 text-sky-bright shadow-[0_0_18px_rgba(45,169,239,0.4)]'
                  : 'border-white/15 text-white/70 hover:border-white/30 hover:text-white'
              }`}
            >
              ⚙
            </button>

            {settingsOpen && (
              <>
                {/* 바깥 클릭 감지용 오버레이 */}
                <button
                  type="button"
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setSettingsOpen(false)}
                  className="fixed inset-0 z-30 cursor-default"
                />
                <div className="hud-chip absolute right-0 top-12 z-40 origin-top-right">
                  <SettingsPanel
                    active={activeFeature}
                    settings={settings}
                    onChange={setSettings}
                    cameras={cameras}
                    selectedCamera={selectedCamera}
                    onSelectCamera={setSelectedCamera}
                    onClose={() => setSettingsOpen(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* 본문: 안경 다리(좌) · 캠 뷰포트(중앙) · 안경 다리(우) 1인칭 시점 */}
      <main className="relative z-10 flex flex-1 items-center justify-center gap-3 px-3 py-3 sm:gap-5">
        <TempleRail side="left" features={LEFT_FEATURES} active={activeFeature} listening={listening} onToggle={handleToggle} />

        {/* 중앙 스마트글래스 뷰포트 */}
        <section className="flex h-full flex-1 items-center justify-center">
          <div className="relative aspect-video max-h-full w-full max-w-6xl overflow-hidden rounded-3xl border border-sky/25 bg-black shadow-[0_0_60px_rgba(45,169,239,0.18)]">
            {/* 웹캠 실시간 표시 (FR-SYS-1) */}
            <WebcamView ref={webcamRef} deviceId={selectedCamera} onDevices={setCameras} />

            {/* 상단 상태 칩 */}
            <span className="pointer-events-none absolute left-4 top-4 z-30 rounded-full bg-navy-deep/70 px-3 py-1 font-mono text-[11px] text-white/70 backdrop-blur">
              {activeFeature ? FEATURE_LABEL[activeFeature] : listening ? '명령 대기 중' : '호출어 대기 중'}
            </span>

            {/* 기능별 오버레이 (FR-SYS-2) — activeFeature 에 따라 하나만 렌더 */}
            {activeFeature === 'translate' && (
              <TranslateOverlay
                langs={{ source: settings.sourceLang, target: settings.targetLang }}
                error={activeError}
                dialog={dialogActive}
                line={dialogLine}
              />
            )}
            {activeFeature === 'image' && (
              <ImageTranslateOverlay
                frameDataUrl={frameDataUrl}
                result={imageResult}
                pending={imagePending}
                error={imageError ?? activeError}
                onRetry={captureAndTranslate}
              />
            )}
            {activeFeature === 'map' && (
              <MapOverlay directions={voiceDirections} request={commandText} error={activeError} />
            )}
            {activeFeature === 'qa' && <QaOverlay question={commandText} error={activeError} />}

            {/* 음성 인식 라이브 자막 (dialog 모드는 번역 오버레이가 대신 표시).
                호출어 대기(idle) 중에는 띄우지 않되, 연결·마이크 실패는 그때도 알려준다 */}
            {!dialogActive && (listening || voiceCaption?.error) && (
              <div className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center px-6">
                <div className="hud-chip max-w-lg text-center">
                  <span className="eyebrow text-sky/70">
                    {listening ? '음성 인식 중…' : '음성 인식'}
                  </span>
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
          </div>
        </section>

        <TempleRail side="right" features={RIGHT_FEATURES} active={activeFeature} listening={listening} onToggle={handleToggle} />
      </main>
    </div>
  )
}
