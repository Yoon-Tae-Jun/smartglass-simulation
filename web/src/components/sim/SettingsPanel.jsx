import { X } from 'lucide-react'

// 설정 패널 (상단 톱바 설정 버튼이 여는 팝오버 콘텐츠).
// 기능별 설정(여행 지역, 카메라, 번역 언어, TTS 등)을 조정한다.
// 설정값은 아직 mock 파이프라인에 직접 연결되지 않았으나, 백엔드 연동 시
// startTranslateStream / askQuestion 등에 전달할 자리다.
// 현재는 영어↔한국어만 지원. 나머지 언어는 개발 중(선택 불가).
const LANGS = [
  { name: '영어', ready: true },
  { name: '한국어', ready: true },
  { name: '일본어', ready: false },
  { name: '중국어', ready: false },
]

// 현재는 서울만 지원. 나머지 도시는 확장 예정(선택 불가).
const REGIONS = [
  { name: '서울', ready: true },
  { name: '부산', ready: false },
  { name: '제주', ready: false },
  { name: '경주', ready: false },
]

export default function SettingsPanel({
  active,
  settings,
  onChange,
  cameras = [],
  selectedCamera = '',
  onSelectCamera,
  onClose,
}) {
  const set = (patch) => onChange({ ...settings, ...patch })

  return (
    <div className="flex w-64 flex-col gap-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="eyebrow text-white/50">설정</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="설정 닫기"
            className="rounded-lg px-2 py-0.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* 컨트롤 */}
      <div className="rounded-xl border border-white/10 bg-navy-deep/60 p-4">
        {/* 여행 지역 (현재 서울만 지원, 나머지는 확장 예정) */}
        <label className="block">
          <span className="text-xs text-white/50">여행 지역</span>
          <select
            value={settings.region}
            onChange={(e) => set({ region: e.target.value })}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy-deep px-2 py-1.5 text-sm text-white"
          >
            {REGIONS.map((r) => (
              <option key={r.name} value={r.name} disabled={!r.ready}>
                {r.name}
                {r.ready ? '' : ' (확장 예정)'}
              </option>
            ))}
          </select>
        </label>

        {/* 카메라 선택 */}
        <label className="mt-3 block">
          <span className="text-xs text-white/50">카메라</span>
          <select
            value={selectedCamera}
            onChange={(e) => onSelectCamera?.(e.target.value)}
            disabled={cameras.length === 0}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy-deep px-2 py-1.5 text-sm text-white disabled:opacity-40"
          >
            <option value="">기본 카메라</option>
            {cameras.map((cam, i) => (
              <option key={cam.deviceId} value={cam.deviceId}>
                {cam.label || `카메라 ${i + 1}`}
              </option>
            ))}
          </select>
        </label>

        {/* 번역 언어 — 실시간 번역은 양방향, 이미지 번역은 원본을 자동 판별하므로 '내 언어'만 쓴다 */}
        <div className="mt-3">
          <span className="text-xs text-white/50">
            번역 언어{active === 'image' && <span className="text-white/30"> (원본 자동 판별)</span>}
          </span>
          <div className="mt-1 flex items-center gap-1.5">
            <select
              value={settings.sourceLang}
              onChange={(e) => set({ sourceLang: e.target.value })}
              disabled={active !== 'translate'}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-navy-deep px-2 py-1.5 text-sm text-white disabled:opacity-40"
              aria-label="상대 언어"
            >
              {LANGS.map((l) => (
                <option key={l.name} value={l.name} disabled={!l.ready}>
                  {l.name}
                  {l.ready ? '' : ' (개발 중)'}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => set({ sourceLang: settings.targetLang, targetLang: settings.sourceLang })}
              disabled={active !== 'translate'}
              title="언어 방향 교체"
              className="shrink-0 rounded-lg border border-white/15 px-2 py-1.5 text-sky transition-colors hover:bg-white/5 disabled:opacity-40"
            >
              ⇄
            </button>
            <select
              value={settings.targetLang}
              onChange={(e) => set({ targetLang: e.target.value })}
              disabled={active !== 'translate' && active !== 'image'}
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-navy-deep px-2 py-1.5 text-sm text-white disabled:opacity-40"
              aria-label="내 언어"
            >
              {LANGS.map((l) => (
                <option key={l.name} value={l.name} disabled={!l.ready}>
                  {l.name}
                  {l.ready ? '' : ' (개발 중)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TTS 토글 */}
        <button
          type="button"
          onClick={() => set({ tts: !settings.tts })}
          className="mt-4 flex w-full items-center justify-between text-sm text-white/80"
        >
          <span>음성 안내 (TTS)</span>
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${settings.tts ? 'bg-sky' : 'bg-white/20'}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${settings.tts ? 'left-4' : 'left-0.5'}`}
            />
          </span>
        </button>
      </div>
    </div>
  )
}
