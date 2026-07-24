import { Link } from 'react-router-dom'

export default function Simulation() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-navy-deep text-white">
      {/* 홈에서 넘어온 빛 번짐이 서서히 걷히는 연출 */}
      <div
        className="sim-flash pointer-events-none absolute inset-0 z-50"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, #eaf9ff 0%, #7fd4ff 40%, #2da9ef 100%)',
        }}
      />

      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="font-mono text-sm font-bold tracking-tight">
            ← SMARTGLASS
          </Link>
          <span className="eyebrow text-white/50">SIMULATION</span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="text-center">
          <p className="eyebrow text-sky">준비 중</p>
          <h1 className="mt-6 font-display text-4xl font-bold sm:text-5xl">
            여기에 웹캠 화면이 들어옵니다
          </h1>
          <p className="mt-4 text-white/50">다음 단계 · 카메라 스트림 → 오버레이 렌더링</p>
        </div>
      </main>
    </div>
  )
}
