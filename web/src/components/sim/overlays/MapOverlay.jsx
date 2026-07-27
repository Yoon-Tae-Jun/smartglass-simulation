import { useEffect, useState } from 'react'
import { getDirections } from '../../../lib/simApi.js'

// 길찾기 경로/시간/거리 오버레이 (FR-MAP-5).
// 실제 흐름은 STT→LLM(목적지 추출)→map 이지만, 프론트에서는 목적지가 확정된
// 뒤 map 결과(DirectionsData)를 소비해 오버레이만 렌더한다.
// TODO(윤태준): getDirections 내부를 POST /map/directions 로 교체.
// TODO(지유찬·박찬영): 음성→목적지 추출 결과를 origin/destination으로 주입.

const fmtDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`)
const fmtDuration = (ms) => {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}분`
  return `${Math.floor(min / 60)}시간 ${min % 60}분`
}

export default function MapOverlay({
  origin = '서울특별시 중구 세종대로 110',
  destination = '경복궁',
  directions = null,
}) {
  const [data, setData] = useState(directions)
  const [err, setErr] = useState(null)

  useEffect(() => {
    // 음성 명령으로 이미 받은 경로가 있으면 그대로 사용 (재요청 안 함)
    if (directions) {
      setData(directions)
      setErr(null)
      return
    }
    let alive = true
    setData(null)
    setErr(null)
    getDirections({ origin, destination }).then((res) => {
      if (!alive) return
      if (res.status === 200 && res.data) setData(res.data)
      else setErr(res.msg) // FR-MAP-6: 실패 시 msg 표시
    })
    return () => {
      alive = false
    }
  }, [origin, destination, directions])

  return (
    <div className="pointer-events-none absolute right-4 top-14 z-20 w-[280px]">
      <div className="hud-chip">
        <span className="eyebrow text-sky/70">길찾기</span>
        <p className="mt-1 truncate text-sm text-white/60">
          {origin} <span className="text-sky">→</span> {destination}
        </p>

        {err && <p className="mt-3 text-sm text-white/70">경로를 찾을 수 없습니다: {err}</p>}

        {!err && !data && <p className="mt-3 text-white/60 glow-pulse">경로 계산 중…</p>}

        {data && (
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
