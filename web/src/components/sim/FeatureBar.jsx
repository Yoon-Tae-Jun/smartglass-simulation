// 좌측 기능 컨트롤 패널 (FR-SYS-4).
// 한 번에 하나만 활성(FR-SYS-3): 부모가 activeFeature를 소유하고,
// 같은 기능을 다시 누르면 off, 다른 기능을 누르면 교체된다.
const FEATURES = [
  { key: 'translate', label: '실시간 번역', desc: '상대 발화 자막', icon: '💬' },
  { key: 'image', label: '이미지 번역', desc: '간판·메뉴판', icon: '🖼️' },
  { key: 'map', label: '길찾기', desc: '경로 안내', icon: '🧭' },
  { key: 'qa', label: '질문 응답', desc: '음성 Q&A', icon: '🎙️' },
]

export default function FeatureBar({ active, onToggle }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col gap-2">
      <span className="eyebrow px-1 text-white/40">기능</span>
      {FEATURES.map((f) => {
        const on = active === f.key
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onToggle(f.key)}
            aria-pressed={on}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
              on
                ? 'border-sky bg-sky/15 shadow-[0_0_24px_rgba(45,169,239,0.35)]'
                : 'border-white/10 bg-navy-deep/60 hover:border-white/25 hover:bg-white/5'
            }`}
          >
            <span className="text-lg leading-none">{f.icon}</span>
            <span className="flex flex-col">
              <span className={`text-sm font-medium ${on ? 'text-sky-bright' : 'text-white/85'}`}>
                {f.label}
              </span>
              <span className="font-mono text-[10px] text-white/40">{f.desc}</span>
            </span>
            <span
              className={`ml-auto h-2 w-2 rounded-full ${on ? 'bg-sky shadow-[0_0_8px_rgba(45,169,239,0.9)]' : 'bg-white/15'}`}
            />
          </button>
        )
      })}
    </aside>
  )
}
