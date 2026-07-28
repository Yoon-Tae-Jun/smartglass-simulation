import PendingNote from '../PendingNote.jsx'

// 실시간 음성 번역 오버레이 (FR-STT-*, 양방향).
// 서버 dialog 모드(영어 인식→한국어 번역)에 연동된다.
//  - dialog:  dialog 모드 활성 여부 (진입 직후 상대 발화 대기 안내)
//  - line:    { text(원문), translated(번역), final } — 서버 partial|final
//  - error:   음성으로 호출됐다 실패한 사유(501 등)
// dialog 모드가 아닐 때(버튼으로만 연 경우)는 '준비 중'을 표시한다.
export default function TranslateOverlay({
  langs = { source: '상대', target: '나' },
  error = null,
  dialog = false,
  line = null,
}) {
  // dialog 모드는 서버가 영어→한국어로 고정 처리한다
  const activeLangs = dialog ? { source: 'English', target: '한국어' } : langs

  let body
  if (line) {
    body = (
      <div className="mt-2">
        <p className="text-sm text-white/60">{line.text || '…'}</p>
        <div className="mx-auto my-2 h-px w-24 bg-white/15" />
        <p className={`text-lg font-medium ${line.final ? 'text-white' : 'text-white/80'}`}>
          {line.translated || '…'}
        </p>
      </div>
    )
  } else if (error) {
    body = <p className="mt-2 text-sm text-white/70">{error}</p>
  } else if (dialog) {
    body = <p className="mt-2 text-sm text-white/60 glow-pulse">상대가 말하면 번역이 표시됩니다…</p>
  } else {
    body = <PendingNote className="mt-2" />
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl text-center">
        <span className="flex items-center justify-center gap-2 eyebrow text-sky/70">
          음성 번역 · {activeLangs.source} <span className="text-sky">⇄</span> {activeLangs.target}
        </span>
        {body}
      </div>
    </div>
  )
}
