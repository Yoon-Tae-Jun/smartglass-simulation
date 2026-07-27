// ─────────────────────────────────────────────────────────────
// 시뮬레이션 mock/stub API 경계
// 백엔드(STT/map/LLM/Papago)는 아직 미완이므로, 여기서는 서버와
// 동일한 공통 응답 포맷 { status, msg, data }(BaseResponse)를 반환하는
// mock 함수만 제공한다. 백엔드가 준비되면 각 함수 내부를 실제
// fetch/WebSocket 호출로 교체하면 된다. (담당자 TODO 참고)
// ─────────────────────────────────────────────────────────────

// 서버 BaseResponse[T] 와 동일 형태
const ok = (data, msg = 'success') => ({ status: 200, msg, data })

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 길찾기 (F-MAP) ────────────────────────────────────────────
// TODO(윤태준): POST /map/directions 실제 연결
//   req: { origin, destination } → data: DirectionsData (schemas/map.py)
export async function getDirections({ origin, destination }) {
  await delay(700)
  return ok({
    summary: {
      distance: 1288, // m
      duration: 212374, // ms
      toll_fare: 0,
      taxi_fare: 4000,
      fuel_price: 172,
    },
    path: [
      { lat: 36.7683778, lng: 126.9289743 },
      { lat: 36.7684012, lng: 126.9290011 },
    ],
    section: [
      {
        point_index: 0,
        point_count: 48,
        distance: 1288,
        name: '순천향로',
        congestion: 1, // 0:없음 1:원활 2:서행 3:혼잡
        speed: 32,
      },
    ],
    guide: [
      { point_index: 0, type: 1, instructions: `${origin}에서 직진`, distance: 320, duration: 45000 },
      { point_index: 12, type: 3, instructions: '순천향로에서 우회전', distance: 620, duration: 88000 },
      { point_index: 34, type: 2, instructions: '중앙로에서 좌회전', distance: 348, duration: 52000 },
      { point_index: 47, type: 1, instructions: `목적지 "${destination}" 도착`, distance: 0, duration: 0 },
    ],
  })
}

// ── 질문 응답 (F-QA) ──────────────────────────────────────────
// TODO(박찬영): POST /llm/ask 실제 연결 (LLM + RAG)
export async function askQuestion(question) {
  await delay(900)
  return ok({
    question,
    answer:
      '경복궁은 조선 왕조의 정궁으로, 지하철 3호선 경복궁역 5번 출구에서 도보 5분 거리입니다. 관람 시간은 오전 9시부터이며 화요일은 휴관입니다.',
  })
}

// ── 이미지 번역 ───────────────────────────────────────────────
// TODO(미정): POST /papago/image 실제 연결 (웹캠 캡처 이미지 → 번역 이미지)
export async function translateImage(_dataUrl) {
  await delay(1100)
  return ok({
    // 실제로는 번역된 이미지(base64/URL)가 온다. mock은 라벨만.
    label: '메뉴판 번역 완료 (mock)',
    lines: [
      { src: '불고기', dst: 'Bulgogi (Grilled Beef)' },
      { src: '비빔밥', dst: 'Bibimbap (Mixed Rice)' },
      { src: '김치찌개', dst: 'Kimchi Stew' },
    ],
  })
}

// ── 실시간 대화 번역 (STT 스트리밍, 양방향) ───────────────────
// TODO(지유찬): WS /stt/stream 실제 연결 (CLOVA Speech gRPC)
// 지금은 N초마다 자막을 갱신하는 mock 스트림을 흉내낸다. 상대(그들 언어→내 언어)와
// 나(내 언어→상대 언어)의 발화가 번갈아 오는 양방향 대화를 모사한다.
// speaker: 'them'(상대) | 'me'(나), spoken: 발화 원문, translated: 번역문
// onCaption(caption) 을 주기적으로 호출하고, 정리 함수를 반환한다.
export function startTranslateStream(onCaption) {
  const convo = [
    { speaker: 'them', spoken: 'すみません、駅はどこですか？', translated: '실례합니다, 역이 어디에 있나요?' },
    { speaker: 'me', spoken: '이 길로 쭉 가시면 됩니다.', translated: 'この道をまっすぐ行ってください。' },
    { speaker: 'them', spoken: 'ありがとうございます！', translated: '감사합니다!' },
    { speaker: 'me', spoken: '즐거운 여행 되세요.', translated: '良い旅を。' },
  ]
  let i = 0
  onCaption(convo[0])
  const id = setInterval(() => {
    i = (i + 1) % convo.length
    onCaption(convo[i])
  }, 2600)
  return () => clearInterval(id)
}
