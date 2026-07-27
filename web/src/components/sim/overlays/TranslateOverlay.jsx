import { useEffect, useState } from 'react'
import { startTranslateStream } from '../../../lib/simApi.js'

// 실시간 대화 번역 자막 오버레이 (FR-STT-*, 양방향).
// 상대(그들 언어 → 내 언어)와 나(내 언어 → 상대 언어)의 발화를 번갈아 표시한다.
// TODO(지유찬): startTranslateStream 내부를 WS /stt/stream 구독으로 교체.
export default function TranslateOverlay({ langs = { source: '상대', target: '나' } }) {
  const [caption, setCaption] = useState(null)

  useEffect(() => {
    const stop = startTranslateStream(setCaption)
    return stop
  }, [])

  const them = caption?.speaker === 'them'
  // 발화자 기준 방향 라벨: 상대는 source→target, 나는 target→source
  const fromLang = them ? langs.source : langs.target
  const toLang = them ? langs.target : langs.source

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
      <div className="hud-chip max-w-2xl text-center">
        <span className="flex items-center justify-center gap-2 eyebrow text-sky/70">
          실시간 번역 · {langs.source} <span className="text-sky">⇄</span> {langs.target}
        </span>
        {caption ? (
          <>
            <p className="mt-2 flex items-center justify-center gap-2 text-xs text-white/45">
              <span
                className={`rounded-full px-2 py-0.5 font-mono ${
                  them ? 'bg-sky/20 text-sky-bright' : 'bg-white/10 text-white/70'
                }`}
              >
                {them ? '상대' : '나'}
              </span>
              {fromLang} <span className="text-sky">→</span> {toLang}
            </p>
            <p className="mt-1.5 text-sm text-white/45">{caption.spoken}</p>
            <p className="mt-1 text-xl font-medium text-white">{caption.translated}</p>
          </>
        ) : (
          <p className="mt-2 text-white/60">듣는 중…</p>
        )}
      </div>
    </div>
  )
}
