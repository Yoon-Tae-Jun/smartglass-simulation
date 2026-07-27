import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import WebcamView from '../components/sim/WebcamView.jsx'
import TempleRail from '../components/sim/TempleRail.jsx'
import SettingsPanel from '../components/sim/SettingsPanel.jsx'
import TranslateOverlay from '../components/sim/overlays/TranslateOverlay.jsx'
import ImageTranslateOverlay from '../components/sim/overlays/ImageTranslateOverlay.jsx'
import MapOverlay from '../components/sim/overlays/MapOverlay.jsx'
import QaOverlay from '../components/sim/overlays/QaOverlay.jsx'

const FEATURE_LABEL = {
  translate: '실시간 대화 번역',
  image: '이미지 번역',
  map: '길찾기',
  qa: '질문 응답',
}

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

  // 설정 팝오버: ESC로 닫기
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e) => e.key === 'Escape' && setSettingsOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

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
      <main className="relative z-10 flex flex-1 items-center justify-center gap-4 px-6 py-6 sm:gap-6">
        <TempleRail side="left" features={LEFT_FEATURES} active={activeFeature} onToggle={handleToggle} />

        {/* 중앙 스마트글래스 뷰포트 */}
        <section className="flex h-full flex-1 items-center justify-center">
          <div className="relative aspect-video max-h-full w-full max-w-4xl overflow-hidden rounded-3xl border border-sky/25 bg-black shadow-[0_0_60px_rgba(45,169,239,0.18)]">
            {/* 웹캠 실시간 표시 (FR-SYS-1) */}
            <WebcamView ref={webcamRef} deviceId={selectedCamera} onDevices={setCameras} />

            {/* 상단 상태 칩 */}
            <span className="pointer-events-none absolute left-4 top-4 z-30 rounded-full bg-navy-deep/70 px-3 py-1 font-mono text-[11px] text-white/70 backdrop-blur">
              {activeFeature ? FEATURE_LABEL[activeFeature] : '대기 중'}
            </span>

            {/* 기능별 오버레이 (FR-SYS-2) — activeFeature 에 따라 하나만 렌더 */}
            {activeFeature === 'translate' && (
              <TranslateOverlay langs={{ source: settings.sourceLang, target: settings.targetLang }} />
            )}
            {activeFeature === 'image' && <ImageTranslateOverlay frameDataUrl={frameDataUrl} />}
            {activeFeature === 'map' && <MapOverlay />}
            {activeFeature === 'qa' && <QaOverlay />}
          </div>
        </section>

        <TempleRail side="right" features={RIGHT_FEATURES} active={activeFeature} onToggle={handleToggle} />
      </main>
    </div>
  )
}
