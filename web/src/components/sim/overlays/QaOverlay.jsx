import PendingNote from '../PendingNote.jsx'

// 질문 응답 오버레이 (FR-QA-*).
// question: 서버가 인식한 문장, error: 실행 실패 사유(현재 qa는 501 미구현).
// 답변 API가 없어 화면에 지어낸 문답을 띄우지 않는다.
export default function QaOverlay({ question = null, error = null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl">
        <span className="eyebrow text-sky/70">질문 응답</span>
        <p className="mt-2 text-sm text-white/60">
          {question ? `Q. ${question}` : '음성으로 질문해 주세요'}
        </p>
        {error ? (
          <p className="mt-1 text-sm text-white/70">{error}</p>
        ) : (
          <PendingNote className="mt-1" />
        )}
      </div>
    </div>
  )
}
