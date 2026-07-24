import { useState, useEffect, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import PointCloudHead from '../components/PointCloudHead.jsx'
import Starfield from '../components/Starfield.jsx'

export default function Home() {
  const [playing, setPlaying] = useState(false)
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
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <Starfield />
        <Suspense fallback={null}>
          <PointCloudHead playing={playing} />
        </Suspense>
        {/* 드래그 회전 + 휠 줌. 인트로 재생 중엔 언마운트해 카메라 연출과 충돌 방지 */}
        {!playing && (
          <OrbitControls
            target={[0, 0, 0]}
            enablePan={false}
            minDistance={2}
            maxDistance={12}
            rotateSpeed={0.6}
            zoomSpeed={0.8}
          />
        )}
      </Canvas>

      {/* 상단 브랜드 */}
      <span className="hero-ui absolute left-6 top-6 z-10 font-display text-lg font-bold tracking-tight sm:left-8 sm:top-7">
        SmartGlass<span className="text-sky">.</span>
      </span>

      {/* 하단: 짧은 문구 + 시작 버튼 */}
      <div className="hero-ui pointer-events-none absolute inset-x-0 bottom-[12vh] z-10 flex flex-col items-center">
        <p className="eyebrow text-sky/70">여행을 눈앞에서</p>
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
