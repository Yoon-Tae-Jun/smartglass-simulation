// 서버 미구현 기능(번역·질문응답·이미지)의 '준비 중' 안내.
export default function PendingNote({ className = '' }) {
  return (
    <p className={`text-sm text-white/55 ${className}`}>
      <span className="mr-2 rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 align-middle font-mono text-[10px] tracking-wide text-amber-200/90">
        준비 중
      </span>
      서버 미구현 기능입니다.
    </p>
  )
}
