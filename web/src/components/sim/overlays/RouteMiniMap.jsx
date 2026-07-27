import { useEffect, useRef, useState } from 'react'
import { loadNaverMaps, NO_KEY } from '../../../lib/naverMaps.js'

// 길찾기 경로를 그리는 미니 지도.
// DirectionsData.path(좌표 배열)만 받아 경로선 + 출발("현재 위치")/도착("목적지")
// 마커를 표시한다. 지명은 서버 응답에 없어서 라벨은 고정 문구를 쓴다.
// display 전용(드래그/줌 비활성) — 오버레이의 pointer-events-none 를 유지한다.

// 마커 라벨 pill HTML (색으로 출발/도착 구분)
const markerLabel = (text, color) =>
  `<div style="transform:translate(-50%,-100%);white-space:nowrap;
    background:${color};color:#06121a;font-weight:700;font-size:11px;
    padding:2px 8px;border-radius:9999px;
    box-shadow:0 2px 8px rgba(0,0,0,0.4)">${text}</div>`

export default function RouteMiniMap({ path }) {
  const containerRef = useRef(null)
  const [failure, setFailure] = useState(null) // { code } | null

  useEffect(() => {
    if (!containerRef.current || !path || path.length < 2) return
    let map = null
    let cancelled = false
    setFailure(null)

    loadNaverMaps()
      .then((naver) => {
        if (cancelled || !containerRef.current) return
        const coords = path.map((p) => new naver.maps.LatLng(p.lat, p.lng))

        map = new naver.maps.Map(containerRef.current, {
          zoom: 14,
          // display 전용: 조작을 모두 끈다
          draggable: false,
          scrollWheel: false,
          pinchZoom: false,
          keyboardShortcuts: false,
          disableDoubleTapZoom: true,
          disableDoubleClickZoom: true,
          disableTwoFingerTapZoom: true,
          scaleControl: false,
          logoControl: true,
          mapDataControl: false,
          zoomControl: false,
        })

        new naver.maps.Polyline({
          map,
          path: coords,
          strokeColor: '#2da9ef',
          strokeOpacity: 0.9,
          strokeWeight: 4,
        })

        new naver.maps.Marker({
          map,
          position: coords[0],
          icon: { content: markerLabel('현재 위치', '#7fd4ff'), anchor: new naver.maps.Point(0, 0) },
        })
        new naver.maps.Marker({
          map,
          position: coords[coords.length - 1],
          icon: { content: markerLabel('목적지', '#ffd27f'), anchor: new naver.maps.Point(0, 0) },
        })

        const bounds = new naver.maps.LatLngBounds(coords[0], coords[0])
        coords.forEach((c) => bounds.extend(c))
        map.fitBounds(bounds, { top: 28, right: 24, bottom: 16, left: 24 })
      })
      .catch((e) => {
        if (!cancelled) setFailure({ code: e?.code ?? 'LOAD_FAILED' })
      })

    return () => {
      cancelled = true
      if (map) map.destroy()
    }
  }, [path])

  if (failure) {
    const msg =
      failure.code === NO_KEY
        ? '지도 키 미설정 (VITE_NAVER_MAP_CLIENT_ID)'
        : '지도를 불러올 수 없습니다'
    return (
      <div className="flex h-[150px] items-center justify-center rounded-lg border border-white/10 bg-white/5 px-3 text-center text-xs text-white/40">
        {msg}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-[150px] w-full overflow-hidden rounded-lg border border-white/10 bg-navy-deep"
    />
  )
}
