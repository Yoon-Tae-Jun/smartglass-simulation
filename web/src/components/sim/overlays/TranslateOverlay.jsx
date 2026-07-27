import PendingNote from '../PendingNote.jsx'

// 실시간 대화 번역 오버레이 (FR-STT-*, 양방향).
// 서버(CLOVA gRPC 스트리밍) 미구현이라 지금은 '준비 중'만 표시한다.
export default function TranslateOverlay({ langs = { source: '상대', target: '나' } }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl text-center">
        <span className="flex items-center justify-center gap-2 eyebrow text-sky/70">
          실시간 번역 · {langs.source} <span className="text-sky">⇄</span> {langs.target}
        </span>
        <PendingNote className="mt-2" />
      </div>
    </div>
  )
}
