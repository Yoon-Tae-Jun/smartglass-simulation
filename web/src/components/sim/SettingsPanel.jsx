// 우측 설정 / 상태 패널.
// 현재 활성 기능 상태를 보여주고, 기능별 설정(번역 언어, TTS 등)을 조정한다.
// 설정값은 아직 mock 파이프라인에 직접 연결되지 않았으나, 백엔드 연동 시
// startTranslateStream / askQuestion 등에 전달할 자리다.
const FEATURE_META = {
  translate: '마이크 입력을 실시간 인식해 자막으로 번역합니다.',
  image: '웹캠 프레임을 캡처해 이미지 속 텍스트를 번역합니다.',
  map: '음성 목적지를 인식해 경로를 안내합니다.',
  qa: '음성 질문을 인식해 답변을 음성·화면으로 출력합니다.',
  null: '왼쪽에서 기능을 선택해 시작하세요.',
}

const LANGS = ['일본어', '영어', '중국어', '한국어']

export default function SettingsPanel({ active, settings, onChange }) {
  const set = (patch) => onChange({ ...settings, ...patch })

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-4">
      {/* 상태 */}
      <div className="rounded-xl border border-white/10 bg-navy-deep/60 p-4">
        <span className="eyebrow text-white/40">상태</span>
        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-white">
          <span
            className={`h-2 w-2 rounded-full ${active ? 'bg-sky shadow-[0_0_8px_rgba(45,169,239,0.9)]' : 'bg-white/25'}`}
          />
          {active ? '실행 중' : '대기 중'}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-white/50">{FEATURE_META[active ?? 'null']}</p>
      </div>

      {/* 설정 */}
      <div className="rounded-xl border border-white/10 bg-navy-deep/60 p-4">
        <span className="eyebrow text-white/40">설정</span>

        {/* 번역 언어 (실시간 번역 전용) */}
        <label className="mt-3 block">
          <span className="text-xs text-white/50">번역 언어 (원문 → 한국어)</span>
          <select
            value={settings.sourceLang}
            onChange={(e) => set({ sourceLang: e.target.value })}
            disabled={active !== 'translate'}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy-deep px-2 py-1.5 text-sm text-white disabled:opacity-40"
          >
            {LANGS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>

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
    </aside>
  )
}
