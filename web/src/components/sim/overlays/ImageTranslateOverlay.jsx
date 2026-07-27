import PendingNote from '../PendingNote.jsx'

// 이미지 번역 오버레이 (FR-IMG-*).
// 웹캠 프레임 freeze는 실제 동작(진입 시 캡처)하지만, 번역(Papago) 서버가
// 미구현이라 번역 결과 대신 '준비 중'을 표시한다.
export default function ImageTranslateOverlay({ frameDataUrl }) {
  return (
    <div className="absolute inset-0 z-20">
      {/* 진입 시 캡처한 프레임을 정지 화면으로 표시(움직여도 고정) */}
      {frameDataUrl && (
        <img src={frameDataUrl} alt="캡처 프레임" className="h-full w-full object-cover" />
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy-deep/35 px-6 text-center">
        <div className="hud-chip max-w-md">
          <span className="eyebrow text-sky/70">이미지 번역</span>
          <PendingNote className="mt-2" />
        </div>
      </div>
    </div>
  )
}
