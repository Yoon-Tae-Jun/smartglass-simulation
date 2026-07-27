import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import WebcamView from '../components/sim/WebcamView.jsx'
import TempleRail from '../components/sim/TempleRail.jsx'
import SettingsPanel from '../components/sim/SettingsPanel.jsx'
import TranslateOverlay from '../components/sim/overlays/TranslateOverlay.jsx'
import ImageTranslateOverlay from '../components/sim/overlays/ImageTranslateOverlay.jsx'
import MapOverlay from '../components/sim/overlays/MapOverlay.jsx'
import QaOverlay from '../components/sim/overlays/QaOverlay.jsx'
import { getCurrentLocation, startVoiceCommand } from '../lib/simApi.js'

const FEATURE_LABEL = {
  translate: '실시간 대화 번역',
  image: '이미지 번역',
  map: '길찾기',
  qa: '질문 응답',
}

// 서버가 감지한 기능 이름 → 프론트 오버레이 key
const FEATURE_KEY = { navigate: 'map', translate: 'translate', qa: 'qa' }

// 안경 다리에 배치할 기능 — 좌: 번역·이미지 / 우: 길찾기·Q&A
const LEFT_FEATURES = [
  { key: 'translate', label: '실시간 번역', icon: '💬' },
  { key: 'image', label: '이미지 번역', icon: '🖼️' },
]
const RIGHT_FEATURES = [
  { key: 'map', label: '길찾기', icon: '🧭' },
  { key: 'qa', label: '질문 응답', icon: '🎙️' },
]

export default function Simulation() {
  // 한 번에 주 기능 1개만 활성 (FR-SYS-3)
  const [activeFeature, setActiveFeature] = useState(null)
  const [frameDataUrl, setFrameDataUrl] = useState(null) // 이미지 번역용 freeze 프레임
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

  // 음성 명령 (WS /stt/ws)
  const [listening, setListening] = useState(false)
  const [voiceCaption, setVoiceCaption] = useState(null) // { text, final } | { error }
  const [command, setCommand] = useState(null) // 마지막 음성 명령 { text, feature }
  const [commandError, setCommandError] = useState(null) // 기능 실행 실패 msg (501 등)
  const [voiceDirections, setVoiceDirections] = useState(null) // 음성 navigate 결과
  const voiceCtrl = useRef(null)
  const commandRef = useRef(null) // 콜백 클로저에서 최신 명령을 참조
  const sessionId = useRef(0) // 위치 조회를 기다리는 사이 취소됐는지 판별

  // 설정 팝오버: ESC로 닫기
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e) => e.key === 'Escape' && setSettingsOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  // 언마운트 시 음성 세션 정리
  useEffect(
    () => () => {
      sessionId.current += 1
      voiceCtrl.current?.stop()
    },
    [],
  )

  // 버튼 토글 (FR-SYS-4): 같은 기능이면 off, 다르면 교체
  function handleToggle(key) {
    setActiveFeature((prev) => {
      const next = prev === key ? null : key
      // 이미지 번역 진입 시 현재 프레임을 캡처해 고정
      if (next === 'image') {
        setFrameDataUrl(webcamRef.current?.capture() ?? null)
      } else {
        setFrameDataUrl(null)
      }
      return next
    })
  }

  // 마지막 명령을 상태와 ref에 함께 기록 (ref는 error 이벤트 분기용)
  function rememberCommand(evt) {
    const next = { text: evt.text, feature: evt.feature }
    commandRef.current = next
    setCommand(next)
  }

  // 음성 이벤트 처리: 자막 갱신 / wake → 오버레이 활성 / 실행 결과·실패 주입
  function handleVoiceEvent(evt) {
    if (evt.kind === 'partial' || evt.kind === 'final') {
      setVoiceCaption({ text: evt.text, final: evt.kind === 'final' })
    } else if (evt.kind === 'wake') {
      // 새 명령이 시작됐으니 이전 결과는 비운다
      rememberCommand(evt)
      setCommandError(null)
      setVoiceDirections(null)
      const key = FEATURE_KEY[evt.feature]
      if (key) setActiveFeature(key) // 음성으로 기능 호출
    } else if (evt.kind === 'result') {
      rememberCommand(evt)
      setCommandError(null)
      if (evt.feature === 'navigate' && evt.data) {
        setVoiceDirections(evt.data) // 서버가 조회한 경로 그대로 렌더
        setActiveFeature('map')
      }
    } else if (evt.kind === 'error') {
      // 연결·마이크 문제(0/403)는 자막에, 그 외는 실행 중인 기능의 실패로 본다
      const connectionIssue = evt.status === 0 || evt.status === 403
      if (connectionIssue || !commandRef.current) setVoiceCaption({ error: evt.msg })
      else setCommandError(evt.msg)
    }
  }

  // 마이크 토글: 시작/정지
  // 시작 전에 GPS 좌표를 받아 WS에 넘긴다 — 목적지만 말했을 때 서버가 출발지로 쓴다.
  async function toggleVoice() {
    if (listening) {
      sessionId.current += 1 // 위치 대기 중인 시작 요청 무효화
      voiceCtrl.current?.stop()
      voiceCtrl.current = null
      setListening(false)
      return
    }

    const session = (sessionId.current += 1)
    setVoiceCaption({ text: '현재 위치 확인 중…' })
    setVoiceDirections(null)
    setCommandError(null)
    setCommand(null)
    commandRef.current = null
    setListening(true)

    const location = await getCurrentLocation()
    if (session !== sessionId.current) return // 대기 중 사용자가 껐거나 화면을 떠남

    // 좌표를 못 받아도 인식은 진행한다 ("○○에서 △△까지" 처럼 출발지를 말하면 됨)
    setVoiceCaption(
      location ? null : { error: '위치 권한이 없어 출발지를 함께 말해야 길찾기가 됩니다' },
    )
    voiceCtrl.current = startVoiceCommand({
      location,
      language: 'ko',
      onEvent: handleVoiceEvent,
    })
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
        <TempleRail side="left" features={LEFT_FEATURES} active={activeFeature} onToggle={handleToggle} />

        {/* 중앙 스마트글래스 뷰포트 */}
        <section className="flex h-full flex-1 items-center justify-center">
          <div className="relative aspect-video max-h-full w-full max-w-6xl overflow-hidden rounded-3xl border border-sky/25 bg-black shadow-[0_0_60px_rgba(45,169,239,0.18)]">
            {/* 웹캠 실시간 표시 (FR-SYS-1) */}
            <WebcamView ref={webcamRef} deviceId={selectedCamera} onDevices={setCameras} />

            {/* 상단 상태 칩 */}
            <span className="pointer-events-none absolute left-4 top-4 z-30 rounded-full bg-navy-deep/70 px-3 py-1 font-mono text-[11px] text-white/70 backdrop-blur">
              {activeFeature ? FEATURE_LABEL[activeFeature] : '대기 중'}
            </span>

            {/* 기능별 오버레이 (FR-SYS-2) — activeFeature 에 따라 하나만 렌더 */}
            {activeFeature === 'translate' && (
              <TranslateOverlay
                langs={{ source: settings.sourceLang, target: settings.targetLang }}
                error={activeError}
              />
            )}
            {activeFeature === 'image' && <ImageTranslateOverlay frameDataUrl={frameDataUrl} />}
            {activeFeature === 'map' && (
              <MapOverlay directions={voiceDirections} request={commandText} error={activeError} />
            )}
            {activeFeature === 'qa' && <QaOverlay question={commandText} error={activeError} />}

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
          </div>
        </section>

        <TempleRail side="right" features={RIGHT_FEATURES} active={activeFeature} onToggle={handleToggle} />
      </main>
    </div>
  )
}
