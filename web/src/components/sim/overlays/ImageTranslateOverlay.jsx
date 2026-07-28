// 이미지 번역 오버레이 (FR-IMG-*).
// 캠은 뒤에서 계속 실시간으로 보이고, 번역 결과는 캠을 가리지 않는
// 코너 PiP + 하단 칩으로 보여준다.
// props:
//   frameDataUrl  캡처한 원본 프레임(dataURL) — 번역 응답 전 PiP 배경으로 표시
//   result        서버 응답 data { rendered_image(base64), source_text, target_text }
//   pending       번역 요청 진행 중
//   error         실패 사유(서버 msg) — 이때 PiP는 띄우지 않고 하단 칩에만 문구
//   onRetry       "다시 촬영" — 현재 라이브 화면을 새로 찍어 번역
//   onClose       PiP ✕ — 결과/프레임만 비우고 기능은 켜둔 채 라이브 캠만 남긴다
export default function ImageTranslateOverlay({
  frameDataUrl = null,
  result = null,
  pending = false,
  error = null,
  onRetry = null,
  onClose = null,
}) {
  // rendered_image에는 'data:' 접두사가 없어 클라이언트가 붙여야 한다
  const rendered = result?.rendered_image
    ? `data:image/png;base64,${result.rendered_image}`
    : null
  // 에러면 PiP 미표시. 그 외엔 번역 이미지 > 캡처 프레임 순으로 표시.
  const pipSrc = error ? null : rendered ?? frameDataUrl

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* 우상단 PiP — 캠을 가리지 않는 작은 카드 */}
      {pipSrc && (
        <div className="pointer-events-auto absolute right-4 top-4 w-64 max-w-[45%] overflow-hidden rounded-xl border border-sky/30 bg-navy-deep/70 shadow-[0_0_24px_rgba(45,169,239,0.25)] backdrop-blur sm:w-96">
          <div className="relative">
            <img
              src={pipSrc}
              alt={rendered ? '번역된 이미지' : '캡처 프레임'}
              className="block w-full object-cover"
            />
            {/* 아직 결과 이미지가 없고 진행 중이면 캡처 프레임 위에 표시 */}
            {pending && !rendered && (
              <div className="absolute inset-0 flex items-center justify-center bg-navy-deep/50">
                <span className="glow-pulse text-xs text-white/80">번역 중…</span>
              </div>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="번역 결과 닫기"
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-navy-deep/70 text-sm text-white/70 transition-colors hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* 하단 중앙 칩 — 상태 / 원문·번역문 + 다시 촬영 */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex justify-center px-6">
        <div className="hud-chip pointer-events-auto max-w-2xl">
          <div className="flex items-center gap-3">
            <span className="eyebrow text-sky/70">이미지 번역</span>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={pending}
                className="ml-auto rounded-lg border border-white/15 px-2 py-0.5 text-xs text-white/70 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
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
