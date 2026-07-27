import { useEffect, useState } from 'react'
import { getDirections } from '../../../lib/simApi.js'
import RouteMiniMap from './RouteMiniMap.jsx'

// 길찾기 경로/시간/거리 오버레이 (FR-MAP-5).
// 화면에 뜨는 값은 전부 서버 응답(DirectionsData)에서 온다.
//  - request/error: WS 음성 명령의 인식 문장과 실행 실패 사유
//  - directions:    WS 기능 실행 결과 (이미 받은 경로라 다시 조회하지 않는다)
//  - origin/destination: 둘 다 주어지면 POST /map/directions로 직접 조회
// 섹션 제목은 친근한 지명(인식 문장/props 파싱)을, 그 아래 부제는 서버가 확정한
// 도로명 주소(DirectionsData.origin/destination)를 함께 보여준다.

const fmtDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`)
const fmtDuration = (ms) => {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min}분`
  return `${Math.floor(min / 60)}시간 ${min % 60}분`
}

// 인식 문장에서 출발지/목적지를 뽑아 섹션 제목("출발 → 목적지")을 만든다.
// 서버(service.py extract_places)와 같은 규칙 — 서버 응답에 지명이 없어서 프론트에서 재파싱한다.
const ROUTE_PATTERNS = [
  /(?<origin>.+?)에서\s*(?<destination>.+?)(?:까지|으로|로)(?=\s|$|[.,?!])/,
  /(?<origin>.+?)에서\s*(?<destination>.+?)\s*(?:가는 길|어떻게 가|안내|경로)/,
  /(?<destination>.+?)(?:까지|으로|로)(?=\s|$|[.,?!])/,
  /(?<destination>.+?)\s*(?:가는 길|어떻게 가|안내|경로)/,
]
const FILLER_PREFIXES = ['지금', '나', '저', '우리', '야', '여기서', '현재 위치', '현재위치']

const cleanPlace = (place) => {
  if (!place) return null
  let p = place.trim()
  for (const filler of FILLER_PREFIXES) {
    if (p.startsWith(filler)) p = p.slice(filler.length).trim()
  }
  return p || null
}

// 문장에서 { origin, destination } 추출. 목적지를 못 찾으면 null.
const extractPlaces = (text) => {
  if (!text) return null
  for (const pattern of ROUTE_PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const destination = cleanPlace(match.groups.destination)
    if (destination) return { origin: cleanPlace(match.groups.origin), destination }
  }
  return null
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

  // 섹션 제목: 친근한 지명(props/문장 파싱) 우선, 없으면 서버가 확정한 도로명 주소로 대체
  const parsed = origin && destination ? { origin, destination } : extractPlaces(request)
  const titleDest = parsed?.destination ?? data?.destination ?? null
  // 출발지를 못 알아들은 경우(목적지만 말함)엔 현재 위치가 출발지
  const titleOrigin = parsed?.origin ?? '현재 위치'

  return (
    <div className="pointer-events-none absolute right-4 top-14 z-20 w-[300px]">
      <div className="hud-chip">
        <span className="eyebrow text-sky/70">길찾기</span>

        {titleDest ? (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
            <span className="text-white/70">{titleOrigin}</span>
            <span className="text-sky">→</span>
            <span className="text-white">{titleDest}</span>
          </p>
        ) : (
          request && <p className="mt-1 text-sm text-white/60">“{request}”</p>
        )}

        {/* 서버가 확정한 도로명 주소 (친근한 지명 아래 정확한 주소를 함께) */}
        {data?.origin && data?.destination && (
          <div className="mt-1.5 space-y-0.5 text-xs leading-snug text-white/40">
            <p><span className="mr-1 text-white/30">출발</span>{data.origin}</p>
            <p><span className="mr-1 text-white/30">도착</span>{data.destination}</p>
          </div>
        )}

        {err && <p className="mt-3 text-sm text-white/70">{err}</p>}

        {!err && !data && (
          <p className={`mt-3 text-white/60 ${pending ? 'glow-pulse' : ''}`}>
            {pending ? '경로 계산 중…' : '음성으로 목적지를 말해 주세요'}
          </p>
        )}

        {!err && data && (
          <>
            {data.path?.length >= 2 && (
              <div className="mt-3">
                <RouteMiniMap path={data.path} />
              </div>
            )}

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
              {data.guide.slice(0, 3).map((g, i) => (
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
