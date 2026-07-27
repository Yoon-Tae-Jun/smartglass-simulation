import PendingNote from '../PendingNote.jsx'

// 질문 응답 오버레이 (FR-QA-*).
// 서버(LLM+RAG) 미구현이라 지금은 '준비 중'만 표시한다.
export default function QaOverlay({ question = '경복궁은 어떻게 가나요?' }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl">
        <span className="eyebrow text-sky/70">질문 응답</span>
        <p className="mt-2 text-sm text-white/50">Q. {question}</p>
        <PendingNote className="mt-1" />
      </div>
    </div>
  )
}
