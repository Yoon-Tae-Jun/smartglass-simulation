import { useEffect, useState } from 'react'
import { askQuestion } from '../../../lib/simApi.js'

// 질문 응답 오버레이 (FR-QA-*).
// 실제 흐름은 STT→LLM(+RAG)이며, 프론트는 질문 텍스트가 확정되면 답변을
// 받아 화면 오버레이 + TTS 음성으로 출력(FR-QA-4)한다.
// TODO(박찬영): askQuestion 내부를 POST /llm/ask 로 교체.
// TODO(지유찬): STT 결과를 question으로 주입.
export default function QaOverlay({ question = '경복궁은 어떻게 가나요?' }) {
  const [answer, setAnswer] = useState(null)

  useEffect(() => {
    let alive = true
    setAnswer(null)
    askQuestion(question).then((res) => {
      if (!alive) return
      setAnswer(res.data.answer)
      // FR-QA-4: TTS 음성 출력
      try {
        const u = new SpeechSynthesisUtterance(res.data.answer)
        u.lang = 'ko-KR'
        window.speechSynthesis?.speak(u)
      } catch {
        /* 미지원 무시 */
      }
    })
    return () => {
      alive = false
      window.speechSynthesis?.cancel()
    }
  }, [question])

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl">
        <span className="eyebrow text-sky/70">질문 응답</span>
        <p className="mt-2 text-sm text-white/50">Q. {question}</p>
        {answer ? (
          <p className="mt-1 text-lg leading-relaxed text-white">{answer}</p>
        ) : (
          <p className="mt-2 text-white/60 glow-pulse">답변 생성 중…</p>
        )}
      </div>
    </div>
  )
}
