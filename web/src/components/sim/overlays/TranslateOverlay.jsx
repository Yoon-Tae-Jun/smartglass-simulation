import PendingNote from '../PendingNote.jsx'

// 실시간 대화 번역 오버레이 (FR-STT-*, 양방향).
// 번역 API가 미구현이라 자막 대신 '준비 중'을 표시하고,
// 음성으로 호출됐다면 서버가 준 실패 사유(501)를 그대로 보여준다.
export default function TranslateOverlay({ langs = { source: '상대', target: '나' }, error = null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl text-center">
        <span className="flex items-center justify-center gap-2 eyebrow text-sky/70">
          실시간 번역 · {langs.source} <span className="text-sky">⇄</span> {langs.target}
        </span>
        {error ? (
          <p className="mt-2 text-sm text-white/70">{error}</p>
        ) : (
          <PendingNote className="mt-2" />
        )}
      </div>
    </div>
  )
}
