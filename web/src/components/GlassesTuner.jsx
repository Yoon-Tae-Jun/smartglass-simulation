// 개발용 안경/머리 정렬·강조 튜너. DEV_TUNE=false 로 끄거나 파일째 삭제하면 됨.
// 슬라이더로 맞춘 뒤 하단 코드 블록을 각 파일 상수에 붙여넣고 끈다.

const TRANSFORM = [
  { key: 'px', label: 'pos X', min: -0.6, max: 0.6, step: 0.005 },
  { key: 'py', label: 'pos Y', min: -0.6, max: 0.9, step: 0.005 },
  { key: 'pz', label: 'pos Z', min: -0.3, max: 1.0, step: 0.005 },
  { key: 'scale', label: 'scale', min: 0.05, max: 1.8, step: 0.01 },
  { key: 'width', label: '가로폭', min: 0.6, max: 2.0, step: 0.01 },
  { key: 'armLen', label: '다리길이', min: 1.0, max: 3.0, step: 0.02 },
  { key: 'lensScale', label: '안경알', min: 0.5, max: 1.3, step: 0.01 },
  { key: 'rx', label: 'rot X', min: -Math.PI, max: Math.PI, step: 0.01 },
  { key: 'ry', label: 'rot Y', min: -Math.PI, max: Math.PI, step: 0.01 },
  { key: 'rz', label: 'rot Z', min: -Math.PI, max: Math.PI, step: 0.01 },
]

const CAMERA = [
  { key: 'camX', label: '카메라X', min: -2.5, max: 2.5, step: 0.01 },
  { key: 'camY', label: '카메라Y', min: -1.5, max: 2.0, step: 0.01 },
  { key: 'camZ', label: '카메라Z', min: 0.5, max: 6.0, step: 0.05 },
  { key: 'endZ', label: '줌거리', min: 0.4, max: 2.0, step: 0.05 },
]

const EMPHASIS = [
  { key: 'headCount', label: '머리 개수', min: 5000, max: 90000, step: 1000 },
  { key: 'headSize', label: '머리 크기', min: 0.004, max: 0.03, step: 0.001 },
  { key: 'headBright', label: '머리 밝기', min: 0.15, max: 1.0, step: 0.05 },
  { key: 'glassGlow', label: '안경 글로', min: 0.5, max: 3.0, step: 0.1 },
]

const fmt = (v, step) =>
  step >= 1 ? String(Math.round(v)) : v.toFixed(step >= 0.01 ? 2 : 3)

function Slider({ row, tune, set }) {
  return (
    <label className="mb-1.5 flex items-center gap-2">
      <span className="w-14 shrink-0 text-white/60">{row.label}</span>
      <input
        type="range"
        min={row.min}
        max={row.max}
        step={row.step}
        value={tune[row.key]}
        onChange={(e) => set(row.key, parseFloat(e.target.value))}
        className="h-1 flex-1 accent-sky"
      />
      <span className="w-12 shrink-0 text-right tabular-nums">
        {fmt(tune[row.key], row.step)}
      </span>
    </label>
  )
}

export default function GlassesTuner({ tune, onChange }) {
  const set = (key, value) => onChange({ ...tune, [key]: value })

  const codeBlock =
    `// Glasses.jsx\n` +
    `const GLASSES_POS = [${tune.px.toFixed(3)}, ${tune.py.toFixed(3)}, ${tune.pz.toFixed(3)}]\n` +
    `const GLASSES_SCALE = ${tune.scale.toFixed(3)}\n` +
    `const GLASSES_WIDTH = ${tune.width.toFixed(3)}\n` +
    `const ARM_LEN = ${tune.armLen.toFixed(2)}\n` +
    `const LENS_SCALE = ${tune.lensScale.toFixed(2)}\n` +
    `const GLASSES_ROT = [${tune.rx.toFixed(3)}, ${tune.ry.toFixed(3)}, ${tune.rz.toFixed(3)}]\n` +
    `const GLASS_GLOW = ${tune.glassGlow.toFixed(1)}\n\n` +
    `// PointCloudHead.jsx\n` +
    `const HEAD_COUNT = ${Math.round(tune.headCount)}\n` +
    `const HEAD_SIZE = ${tune.headSize.toFixed(3)}\n` +
    `const HEAD_BRIGHT = ${tune.headBright.toFixed(2)}\n\n` +
    `// 시작 카메라: Home.jsx camera position + PointCloudHead camX/Y/Z 폴백\n` +
    `camera position = [${tune.camX.toFixed(2)}, ${tune.camY.toFixed(2)}, ${tune.camZ.toFixed(2)}]\n` +
    `// OrbitControls target 은 머리 중심 [0, 0.1, 0] 고정\n` +
    `endCamZ(줌거리) = ${tune.endZ.toFixed(2)}`

  return (
    <div
      className="hero-ui absolute right-4 top-16 z-30 w-64 rounded-xl border border-sky/30 bg-navy-deep/85 p-3 font-mono text-[11px] text-white/80 backdrop-blur"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="mb-2 flex items-center justify-between text-sky">
        <span className="font-bold">안경/머리 튜너 (dev)</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(codeBlock)}
          className="rounded border border-sky/40 px-2 py-0.5 hover:bg-sky/20"
        >
          복사
        </button>
      </div>

      <div className="mb-1 text-[10px] text-white/40">위치 / 스케일 / 회전</div>
      {TRANSFORM.map((r) => (
        <Slider key={r.key} row={r} tune={tune} set={set} />
      ))}

      <div className="mb-1 mt-2 text-[10px] text-white/40">시작 카메라 / 줌</div>
      {CAMERA.map((r) => (
        <Slider key={r.key} row={r} tune={tune} set={set} />
      ))}

      <div className="mb-1 mt-2 text-[10px] text-white/40">강조도</div>
      {EMPHASIS.map((r) => (
        <Slider key={r.key} row={r} tune={tune} set={set} />
      ))}

      <pre className="mt-2 whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] leading-relaxed text-sky/90">
        {codeBlock}
      </pre>
    </div>
  )
}
