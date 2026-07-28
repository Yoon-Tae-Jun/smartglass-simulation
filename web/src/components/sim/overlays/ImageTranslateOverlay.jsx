// 이미지 번역 오버레이 (FR-IMG-*).
// 캡처한 프레임을 서버(POST /imgPapago/image)가 번역해 돌려준 이미지로 교체해 보여준다.
// props:
//   frameDataUrl  캡처한 원본 프레임(dataURL) — 번역 결과가 오기 전까지 정지 화면으로 표시
//   result        서버 응답 data { rendered_image(base64), source_text, target_text }
//   pending       번역 요청 진행 중
//   error         실패 사유(서버 msg). 원본 프레임은 그대로 두고 문구만 바꾼다
//   onRetry       "다시 촬영" 버튼 — 현재 화면을 새로 찍어 번역
export default function ImageTranslateOverlay({
  frameDataUrl = null,
  result = null,
  pending = false,
  error = null,
  onRetry = null,
}) {
  // rendered_image에는 'data:' 접두사가 없어 클라이언트가 붙여야 한다
  const shown = result?.rendered_image
    ? `data:image/png;base64,${result.rendered_image}`
    : frameDataUrl

  return (
    <div className="absolute inset-0 z-20">
      {/* 번역 결과 이미지(없으면 캡처한 원본)를 정지 화면으로 표시 */}
      {shown && (
        <img
          src={shown}
          alt={result ? '번역된 이미지' : '캡처 프레임'}
          className="h-full w-full object-cover"
        />
      )}

      {/* 상태 칩 — 번역 중 / 실패 / 인식·번역된 문장 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-6">
        <div className="hud-chip max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="eyebrow text-sky/70">이미지 번역</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={pending}
                className="pointer-events-auto ml-auto rounded-lg border border-white/15 px-2 py-0.5 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
              >
                다시 촬영
              </button>
            )}
          </div>

          {error ? (
            <p className="mt-2 text-sm text-white/70">{error}</p>
          ) : pending ? (
            <p className="glow-pulse mt-2 text-sm text-white/60">번역 중…</p>
          ) : result ? (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-white">{result.target_text}</p>
              {result.source_text && (
                <p className="text-xs leading-snug text-white/40">{result.source_text}</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-white/60">
              번역할 글자가 보이게 카메라를 맞춰 주세요
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
