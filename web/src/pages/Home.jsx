import { useState, useEffect, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import PointCloudHead from '../components/PointCloudHead.jsx'
import Starfield from '../components/Starfield.jsx'
import GlassesTuner from '../components/GlassesTuner.jsx'

export default function Home() {
  const [playing, setPlaying] = useState(false)
  // 안경/머리 튜너 패널 표시 토글(기본 숨김). 값은 아래 state 기본값으로 항상 적용됨.
  const [showTuner, setShowTuner] = useState(false)
  const [glassesTune, setGlassesTune] = useState({
    // 안경 변환(확정값)
    px: 0, py: 0.31, pz: 0.19, scale: 1.07, width: 0.93, armLen: 1.12, lensScale: 0.79, rx: -0.112, ry: 3.138, rz: -0.002,
    // 시작 카메라 구도(오프셋X/Y·거리Z) + 클릭 시 줌 거리
    camX: -0.77, camY: 0.46, camZ: 0.6, endZ: 0.85,
    // 강조도(확정값): glassGlow=HDR 밝기 배율, lineWidth=안경테 두께(월드 단위)
    headCount: 67000, headSize: 0.007, headBright: 0.60, glassGlow: 4.7, lineWidth: 0.004,
  })
  const navigate = useNavigate()

  // 인트로 시퀀스가 끝나면 시뮬레이션으로 이동
  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => navigate('/simulation'), 2150)
    return () => clearTimeout(t)
  }, [playing, navigate])

  return (
    <div
      className={`hero relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-deep text-white ${
        playing ? 'playing' : ''
      }`}
    >
      {/* 배경 글로우 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(760px 620px at 50% 44%, rgba(45,169,239,0.16), transparent 62%), #050d13',
        }}
      />

      {/* 3D 포인트 클라우드 */}
      <Canvas
        className="!absolute inset-0"
        camera={{ position: [-0.77, 0.46, 0.6], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <Starfield />
        <Suspense fallback={null}>
          <PointCloudHead playing={playing} tune={glassesTune} />
        </Suspense>
        {/* 드래그 회전 + 휠 줌. 인트로 재생 중엔 언마운트해 카메라 연출과 충돌 방지 */}
        {!playing && (
          <OrbitControls
            makeDefault
            target={[0, 0.1, 0]}
            enablePan={false}
            minDistance={2}
            maxDistance={12}
            rotateSpeed={0.6}
            zoomSpeed={0.8}
          />
        )}
      </Canvas>

      {/* 안경/머리 튜너: 토글 버튼으로 열고 닫기 (인트로 재생 전에만) */}
      {!playing && (
        <button
          type="button"
          onClick={() => setShowTuner((v) => !v)}
          className="hero-ui absolute right-4 top-4 z-40 rounded-lg border border-sky/30 bg-navy-deep/85 px-3 py-1.5 font-mono text-[11px] text-white/70 backdrop-blur transition-colors hover:border-sky hover:text-sky"
        >
          {showTuner ? '튜너 닫기 ✕' : '튜너 열기 ⚙'}
        </button>
      )}
      {showTuner && !playing && (
        <GlassesTuner tune={glassesTune} onChange={setGlassesTune} />
      )}

      {/* 상단 브랜드 */}
      <span className="hero-ui absolute left-6 top-6 z-10 font-display text-lg font-bold tracking-tight sm:left-8 sm:top-7 sm:text-xl">
        NAY-BEN<span className="text-sky">.</span>
      </span>

      {/* 하단: 짧은 문구 + 시작 버튼 */}
      <div className="hero-ui pointer-events-none absolute inset-x-0 bottom-[12vh] z-10 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setPlaying(true)}
          disabled={playing}
          className="group pointer-events-auto mt-5 inline-flex items-center gap-2 rounded-full border border-sky/50 bg-sky/10 px-9 py-3.5 font-semibold text-sky backdrop-blur-sm transition-all hover:border-sky hover:bg-sky hover:text-navy-deep hover:shadow-[0_0_40px_rgba(45,169,239,0.5)]"
        >
          여행 떠나기
          <span className="transition-transform group-hover:translate-x-1">→</span>
        </button>
      </div>

      {/* 전환 시 화면을 채우는 빛 번짐 */}
      <div
        className="bloom pointer-events-none absolute inset-0 z-20"
        style={{
          background:
            'radial-gradient(circle at 50% 44%, #eaf9ff 0%, #7fd4ff 35%, #2da9ef 100%)',
        }}
      />
    </div>
  )
}
