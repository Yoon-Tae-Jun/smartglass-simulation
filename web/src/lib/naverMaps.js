// ─────────────────────────────────────────────────────────────
// 네이버 지도 JS SDK 로더
// 길찾기 미니 지도(RouteMiniMap)가 쓴다. SDK <script>를 한 번만 주입하고
// window.naver 를 프로미스로 돌려준다. UI에서 외부 SDK 로딩을 분리하려고
// simApi.js 와 같은 lib/ 경계에 둔다.
// ─────────────────────────────────────────────────────────────

// 네이버 클라우드 Web Dynamic Map 클라이언트 ID (없으면 폴백)
const CLIENT_ID = import.meta.env.VITE_NAVER_MAP_CLIENT_ID

// 키 미설정을 컴포넌트가 구분할 수 있게 정해둔 에러 코드
export const NO_KEY = 'NO_KEY'

const SDK_LOAD_TIMEOUT = 10_000

// 로딩은 한 번만: 최초 호출이 만든 프로미스를 이후 호출이 재사용한다
let loadPromise = null

/**
 * 네이버 지도 SDK를 로드하고 window.naver 를 반환한다.
 * - 키가 없으면 { code: NO_KEY } 로 reject → 컴포넌트가 폴백 UI를 띄운다.
 * - 이미 로드됐으면 즉시 resolve, 로딩 중이면 진행 중 프로미스를 공유한다.
 * @returns {Promise<typeof window.naver>}
 */
export function loadNaverMaps() {
  if (!CLIENT_ID) return Promise.reject({ code: NO_KEY })
  if (window.naver?.maps) return Promise.resolve(window.naver)
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    // 2024+ 신규 파라미터는 ncpKeyId. 콘솔 등록이 구형이면 ncpClientId 로 교체한다.
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`
    script.async = true

    const timer = setTimeout(() => {
      cleanup()
      reject({ code: 'TIMEOUT' })
    }, SDK_LOAD_TIMEOUT)

    function cleanup() {
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
    }

    script.onload = () => {
      cleanup()
      if (window.naver?.maps) resolve(window.naver)
      else reject({ code: 'LOAD_FAILED' })
    }
    script.onerror = () => {
      cleanup()
      loadPromise = null // 실패한 로드는 재시도할 수 있게 캐시를 비운다
      reject({ code: 'LOAD_FAILED' })
    }

    document.head.appendChild(script)
  })

  return loadPromise
}
