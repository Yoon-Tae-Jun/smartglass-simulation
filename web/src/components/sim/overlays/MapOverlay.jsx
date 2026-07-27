import { useEffect, useState } from 'react'
import { getDirections } from '../../../lib/simApi.js'

// 길찾기 경로/시간/거리 오버레이 (FR-MAP-5).
// 화면에 뜨는 값은 전부 서버 응답(DirectionsData)에서 온다.
//  - request/error: WS 음성 명령의 인식 문장과 실행 실패 사유
//  - directions:    WS 기능 실행 결과 (이미 받은 경로라 다시 조회하지 않는다)
//  - origin/destination: 둘 다 주어지면 POST /map/directions로 직접 조회
// 서버 응답에는 지명이 없어서, 어디로 가는 경로인지는 인식된 문장으로 표시한다.

const fmtDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`)
const fmtDuration = (ms) => {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}분`
  return `${Math.floor(min / 60)}시간 ${min % 60}분`
}

export default function MapOverlay({
  directions = null,
  request = null,
  error = null,
  origin = null,
  destination = null,
}) {
  const [fetched, setFetched] = useState(null)
  const [fetchError, setFetchError] = useState(null)

  useEffect(() => {
    // 음성으로 받은 경로가 있거나 조회할 지명이 없으면 REST를 호출하지 않는다
    if (directions || !origin || !destination) return
    let alive = true
    setFetched(null)
    setFetchError(null)
    getDirections({ origin, destination }).then((res) => {
      if (!alive) return
      if (res.status === 200 && res.data) setFetched(res.data)
      else setFetchError(res.msg) // FR-MAP-6: 실패 시 서버 msg 표시
    })
    return () => {
      alive = false
    }
  }, [origin, destination, directions])

  const data = directions ?? fetched
  const err = error ?? fetchError
  // 명령은 들어왔는데 아직 결과가 없는 상태 = 서버가 경로를 조회하는 중
  const pending = Boolean(request || (origin && destination))

  return (
    <div className="pointer-events-none absolute right-4 top-14 z-20 w-[280px]">
      <div className="hud-chip">
        <span className="eyebrow text-sky/70">길찾기</span>

        {request && <p className="mt-1 text-sm text-white/60">“{request}”</p>}

        {err && <p className="mt-3 text-sm text-white/70">{err}</p>}

        {!err && !data && (
          <p className={`mt-3 text-white/60 ${pending ? 'glow-pulse' : ''}`}>
            {pending ? '경로 계산 중…' : '음성으로 목적지를 말해 주세요'}
          </p>
        )}

        {!err && data && (
          <>
            <div className="mt-3 flex items-end gap-4">
              <div>
                <p className="font-display text-3xl font-bold text-white">
                  {fmtDuration(data.summary.duration)}
                </p>
                <p className="text-xs text-white/50">{fmtDistance(data.summary.distance)}</p>
              </div>
              <div className="ml-auto text-right text-xs text-white/50">
                <p>택시 약 {data.summary.taxi_fare.toLocaleString()}원</p>
                {data.summary.toll_fare > 0 && <p>통행료 {data.summary.toll_fare.toLocaleString()}원</p>}
              </div>
            </div>

            <ol className="mt-4 space-y-2 border-t border-white/10 pt-3">
              {data.guide.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 text-sky">•</span>
                  <span className="text-white/80">
                    {g.instructions}
                    {g.distance > 0 && <span className="text-white/40"> · {fmtDistance(g.distance)}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}
