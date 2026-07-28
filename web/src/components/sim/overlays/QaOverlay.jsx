// AI에게 질문하기 오버레이 (FR-QA-*).
// question: 서버가 인식한 문장(질문), error: 실행 실패 사유, result: RAG 서버 응답({ answer, sources }).
export default function QaOverlay({ question = null, error = null, result = null }) {
  const pending = Boolean(question) && !result && !error

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl">
        <span className="eyebrow text-sky/70">AI에게 질문하기</span>
        <p className="mt-2 text-sm text-white/60">
          {question ? `Q. ${question}` : '음성으로 질문해 주세요'}
        </p>

        {error && <p className="mt-1 text-sm text-white/70">{error}</p>}

        {!error && result && (
          <>
            <p className="mt-1 text-sm text-white">{result.answer}</p>
            {result.sources?.length > 0 && (
              <p className="mt-2 text-xs text-white/40">
                참고: {result.sources.map((s) => s.title).join(', ')}
              </p>
            )}
          </>
        )}

        {!error && !result && (
          <p className={`mt-1 text-sm text-white/50 ${pending ? 'glow-pulse' : ''}`}>
            {pending ? '답변을 찾는 중…' : '호출어 뒤에 궁금한 걸 물어보세요'}
          </p>
        )}
      </div>
    </div>
  )
}
