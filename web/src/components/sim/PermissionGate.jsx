import { useEffect, useState } from 'react'
import { Camera, CheckCircle2, Lock, MapPin, Mic, XCircle } from 'lucide-react'
import {
  requestCameraPermission,
  requestMicPermission,
  requestLocationPermission,
  queryInitialPermissions,
} from '../../lib/simApi.js'

// 카메라·마이크·위치 모두 필수. 각 항목은 자기 요청 함수를 들고 있다.
const ITEMS = [
  { key: 'camera', icon: Camera, label: '카메라', desc: '화면에 실시간 웹캠을 표시합니다.', request: requestCameraPermission },
  { key: 'mic', icon: Mic, label: '마이크', desc: '음성 명령·실시간 번역에 사용합니다.', request: requestMicPermission },
  { key: 'location', icon: MapPin, label: '위치', desc: '길찾기 출발지를 자동으로 설정합니다.', request: requestLocationPermission },
]

const BADGE = {
  idle: { icon: null, text: '허용 전', cls: 'text-white/40' },
  granted: { icon: CheckCircle2, text: '허용됨', cls: 'text-sky' },
  denied: { icon: XCircle, text: '거부됨', cls: 'text-red-400' },
  blocked: { icon: Lock, text: '차단됨', cls: 'text-amber-400' },
}

export default function PermissionGate({ onReady }) {
  const [status, setStatus] = useState({ camera: 'idle', mic: 'idle', location: 'idle' })
  const [busy, setBusy] = useState(null) // 요청 진행 중인 항목 key

  // 이미 허용된 권한은 마운트 시 선표시
  useEffect(() => {
    let cancelled = false
    queryInitialPermissions().then((s) => {
      if (!cancelled) setStatus((prev) => ({ ...prev, ...s }))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const allGranted = ITEMS.every((it) => status[it.key] === 'granted')
  const anyBlocked = ITEMS.some((it) => status[it.key] === 'blocked')

  async function handleRequest(item) {
    setBusy(item.key)
    const result = await item.request()
    setStatus((prev) => ({ ...prev, [item.key]: result }))
    setBusy(null)
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-navy-deep/95 px-6 backdrop-blur">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-navy-deep/80 p-6 shadow-[0_0_60px_rgba(45,169,239,0.18)]">
        <span className="eyebrow text-sky/70">시작 전 권한 허용</span>
        <h2 className="mt-2 text-lg font-semibold text-white">시뮬레이션에 필요한 권한을 허용해 주세요</h2>
        <p className="mt-1 text-sm text-white/50">아래 세 가지 권한이 모두 필요합니다.</p>

        <ul className="mt-5 flex flex-col gap-2">
          {ITEMS.map((it) => {
            const st = status[it.key]
            const badge = BADGE[st]
            return (
              <li
                key={it.key}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-navy-deep/60 p-3"
              >
                <it.icon className="h-5 w-5 shrink-0 text-white/70" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{it.label}</p>
                  <p className="text-xs text-white/50">{it.desc}</p>
                </div>
                <span className={`flex shrink-0 items-center gap-1 text-xs ${badge.cls}`}>
                  {badge.icon && <badge.icon className="h-3.5 w-3.5" strokeWidth={2} />}
                  {badge.text}
                </span>
                {st !== 'granted' && (
                  <button
                    type="button"
                    onClick={() => handleRequest(it)}
                    disabled={busy === it.key}
                    className="shrink-0 rounded-lg border border-sky/40 px-3 py-1.5 text-xs text-sky transition-colors hover:bg-sky/10 disabled:opacity-40"
                  >
                    {st === 'idle' ? '허용' : '다시 시도'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>

        {anyBlocked && (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-200/90">
            일부 권한이 차단되어 있습니다. 주소창 왼쪽{' '}
            <Lock className="inline h-3 w-3 -translate-y-px" strokeWidth={2} /> 아이콘에서 권한을
            &quot;허용&quot;으로 바꾼 뒤 새로고침해 주세요.
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 block rounded-lg border border-amber-400/40 px-3 py-1.5 text-amber-200 transition-colors hover:bg-amber-400/10"
            >
              새로고침
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onReady}
          disabled={!allGranted}
          className="mt-5 w-full rounded-xl bg-sky py-2.5 text-sm font-semibold text-navy-deep transition-opacity disabled:opacity-30"
        >
          시뮬레이션 시작
        </button>
      </div>
    </div>
  )
}
