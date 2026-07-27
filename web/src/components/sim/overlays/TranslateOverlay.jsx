import { useEffect, useState } from 'react'
import { startTranslateStream } from '../../../lib/simApi.js'

// 실시간 대화 번역 자막 오버레이 (FR-STT-*).
// mock 스트림(N초 갱신)을 구독해 하단 자막 바를 갱신한다.
// TODO(지유찬): startTranslateStream 내부를 WS /stt/stream 구독으로 교체.
export default function TranslateOverlay() {
  const [caption, setCaption] = useState(null)

  useEffect(() => {
    const stop = startTranslateStream(setCaption)
    return stop
  }, [])

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl text-center">
        <span className="eyebrow text-sky/70">실시간 번역 · LIVE</span>
        {caption ? (
          <>
            <p className="mt-2 text-sm text-white/45">{caption.src}</p>
            <p className="mt-1 text-xl font-medium text-white">{caption.dst}</p>
          </>
        ) : (
          <p className="mt-2 text-white/60">듣는 중…</p>
        )}
      </div>
    </div>
  )
}
