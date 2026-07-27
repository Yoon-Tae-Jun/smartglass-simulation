import { useEffect, useState } from 'react'
import { translateImage } from '../../../lib/simApi.js'

// 이미지 번역 오버레이 (FR-IMG-*).
// 진입 시: (1) "움직이지 마세요" TTS 안내(FR-IMG-1), (2) 웹캠 프레임 freeze 후
// Papago 호출, (3) 결과가 오면 화면을 번역 결과로 대체(mock: freeze 이미지 + 번역 라벨).
// TODO(미정): translateImage 내부를 POST /papago/image 로 교체.
export default function ImageTranslateOverlay({ frameDataUrl }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // FR-IMG-1: 캡처 전 "움직이지 마세요" 음성 안내
    try {
      const u = new SpeechSynthesisUtterance('움직이지 마세요')
      u.lang = 'ko-KR'
      window.speechSynthesis?.speak(u)
    } catch {
      /* SpeechSynthesis 미지원 브라우저는 무시 */
    }

    let alive = true
    setLoading(true)
    translateImage(frameDataUrl).then((res) => {
      if (alive) {
        setResult(res.data)
        setLoading(false)
      }
    })
    return () => {
      alive = false
      window.speechSynthesis?.cancel()
    }
  }, [frameDataUrl])

  return (
    <div className="absolute inset-0 z-20">
      {/* 캡처한 프레임을 정지 화면으로 표시(움직여도 고정) */}
      {frameDataUrl && (
        <img src={frameDataUrl} alt="캡처 프레임" className="h-full w-full object-cover" />
      )}

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy-deep/35 px-6 text-center">
        {loading ? (
          <>
            <span className="eyebrow text-sky/80 glow-pulse">번역 중…</span>
            <p className="text-white/70">움직이지 마세요</p>
          </>
        ) : (
          <div className="hud-chip max-w-md text-left">
            <span className="eyebrow text-sky/70">{result?.label}</span>
            <ul className="mt-3 space-y-2">
              {result?.lines?.map((l) => (
                <li key={l.src} className="flex items-baseline justify-between gap-4">
                  <span className="text-white/50">{l.src}</span>
                  <span className="font-medium text-white">{l.dst}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
