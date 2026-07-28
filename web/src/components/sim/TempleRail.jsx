// 스마트글래스 안경 다리(temple) 레일 (FR-SYS-4).
// 중앙 캠 뷰포트 좌/우에 세로로 서서, 실제 안경 다리에 박힌 물리 버튼을
// 누르듯 기능을 토글한다. 토글 규칙(한 번에 하나, 재클릭 시 off)은
// 부모(Simulation)가 activeFeature로 소유하며 여기서는 표시/전달만 한다.
// props:
//   side      'left' | 'right'  — 좌/우 대칭 스타일
//   features  [{ key, label, icon }]  — 이 다리에 올릴 기능들 (icon은 lucide-react 컴포넌트)
//   active    현재 활성 기능 key (없으면 null)
//   listening 음성인식 진행 중 여부 — 활성 버튼에 인식 표시를 띄운다
//   onToggle  (key) => void
export default function TempleRail({ side, features, active, listening, onToggle }) {
  const isLeft = side === 'left'
  return (
    <aside
      className={`temple-rail temple-rail--${side} relative flex w-24 shrink-0 flex-col items-center gap-5 rounded-3xl py-6 sm:w-28`}
    >
      {/* 힌지 장식 — 프레임과 맞물리는 안쪽 상단 */}
      <span
        className={`temple-hinge absolute top-4 h-3 w-3 rounded-full ${isLeft ? 'right-3' : 'left-3'}`}
        aria-hidden="true"
      />

      {features.map((f) => {
        const on = active === f.key
        const live = on && listening // 이 기능이 활성이고 음성인식 중
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onToggle(f.key)}
            aria-pressed={on}
            title={f.label}
            className={`temple-btn ${on ? 'temple-btn--on' : ''} ${live ? 'glow-pulse' : ''} relative flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-2xl`}
          >
            {/* 음성인식 표시 — 우상단에서 깜빡이는 점 */}
            {live && (
              <span className="absolute right-2 top-2 flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-bright/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-bright" />
              </span>
            )}
            <f.icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
            <span
              className={`text-[10px] font-medium leading-tight ${on ? 'text-sky-bright' : 'text-white/70'}`}
            >
              {f.label}
            </span>
          </button>
        )
      })}

      {/* 다리 끝(귀걸이) 쪽으로 가늘어지는 마감선 */}
      <span className="mt-auto h-px w-8 rounded-full bg-white/10" aria-hidden="true" />
    </aside>
  )
}
