import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// 안경 GLB (Glasses by jeremy, CC-BY 3.0 · poly.pizza)
const GLASSES_URL = '/glasses/glasses.glb'

// ── 정규화된 머리 위 눈 위치에 안경을 얹기 위한 튜닝 상수 ──
// 머리 bbox(정규화 후): y[-0.83, 0.83], 얼굴 앞면 z≈+0.5. 눈은 중앙보다 살짝 위.
// 지오메트리는 아래에서 bbox 중심을 로컬 원점으로 재정렬하므로,
// GLASSES_POS는 "안경 프레임 중심을 씬 어디에 둘지"를 의미한다. hot-reload로 미세조정.
const GLASSES_POS = [0.0, 0.31, 0.19] // 프레임 중심 위치(씬 좌표) — 튜너로 확정
const GLASSES_SCALE = 1.07 // 기준 스케일(모델 0.81유닛 폭 기준)
const GLASSES_WIDTH = 0.93 // 가로(X) 추가 배율 — 얼굴 폭에 맞춰 다리를 귀까지 벌림
const GLASSES_ROT = [-0.112, 3.138, -0.002] // 렌즈가 -Z라 ~180°(+살짝 숙임)로 얼굴 앞

const LINE_COLOR = '#7fd4ff' // 네온 시안
const EDGE_ANGLE = 24 // EdgesGeometry 임계각(도): 낮을수록 라인 많아짐
const GLASS_GLOW = 3.0 // 글로 세기 배수(강조도) — 튜너로 확정

// 안경다리(temple arm) 길이 배율. 경첩(프레임 앞부분과 다리의 경계) 뒤쪽 정점만
// z로 늘려 렌즈·프레임은 그대로 두고 귀까지 가는 직선 막대만 길게 만든다.
const ARM_LEN = 1.12
// 경첩 위치: 모델 z범위에서 앞(렌즈)쪽부터의 비율. 앞프레임은 z범위의 앞 ~15%에 몰려 있음.
const ARM_HINGE_FRAC = 0.15
// 안경알(앞프레임·렌즈) 크기 배율. 경첩보다 앞쪽 정점만 중심으로 축소 → 다리는 그대로.
const LENS_SCALE = 0.79

useGLTF.preload(GLASSES_URL)

// GLB의 모든 메시를 월드행렬 반영해 하나로 병합 → 렌즈 앞면 기준으로 재정렬
function buildEdges(scene, armLen, lensScale) {
  scene.updateWorldMatrix(true, true)
  const geos = []
  scene.traverse((o) => {
    if (o.isMesh && o.geometry) {
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
      g.applyMatrix4(o.matrixWorld)
      // EdgesGeometry는 position만 필요 → 나머지 속성 제거해 병합 호환성 확보
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position') g.deleteAttribute(name)
      }
      geos.push(g)
    }
  })
  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)

  // bbox 중심(원래 형상 기준)을 로컬 원점으로 → 상수 튜닝을 직관적으로.
  // 중심은 다리를 늘리기 "전"에 계산해, 길이를 바꿔도 렌즈/프레임 위치는 고정.
  merged.computeBoundingBox()
  const bb = merged.boundingBox
  const cx = (bb.min.x + bb.max.x) / 2
  const cy = (bb.min.y + bb.max.y) / 2
  const cz = (bb.min.z + bb.max.z) / 2

  const zHinge = bb.min.z + ARM_HINGE_FRAC * (bb.max.z - bb.min.z)
  const p = merged.attributes.position
  if (armLen !== 1 || lensScale !== 1) {
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i)
      if (z > zHinge) {
        // 다리 늘리기: 경첩보다 뒤(z 큰 쪽) 정점만 z를 배율만큼 뒤로 밈.
        if (armLen !== 1) p.setZ(i, zHinge + (z - zHinge) * armLen)
      } else if (lensScale !== 1) {
        // 안경알 줄이기: 경첩보다 앞(z 작은 쪽) 정점만 프레임 중심(0, cy)으로 축소.
        p.setX(i, p.getX(i) * lensScale)
        p.setY(i, cy + (p.getY(i) - cy) * lensScale)
      }
    }
    p.needsUpdate = true
  }

  merged.translate(-cx, -cy, -cz)

  return new THREE.EdgesGeometry(merged, EDGE_ANGLE)
}

export default function Glasses({ tune }) {
  const { scene } = useGLTF(GLASSES_URL)
  const coreMat = useRef()
  const haloMat = useRef()

  const armLen = tune ? tune.armLen : ARM_LEN
  const lensScale = tune ? tune.lensScale : LENS_SCALE
  const edges = useMemo(
    () => buildEdges(scene, armLen, lensScale),
    [scene, armLen, lensScale],
  )

  // 개발 튜너가 값을 주면 그걸 쓰고, 없으면 상수 사용
  const pos = tune ? [tune.px, tune.py, tune.pz] : GLASSES_POS
  const rot = tune ? [tune.rx, tune.ry, tune.rz] : GLASSES_ROT
  // 기준 스케일 × 가로 배율 → [폭, 높이, 깊이]. 가로만 키워 렌즈가 세로로 커지지 않게.
  const base = tune ? tune.scale : GLASSES_SCALE
  const width = tune ? tune.width : GLASSES_WIDTH
  const scl = [base * width, base, base]

  const glow = tune ? tune.glassGlow : GLASS_GLOW

  // 은은한 글로 맥동: '작동 중인 AR 기기' 느낌
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2)
    if (coreMat.current) coreMat.current.opacity = Math.min(1, (0.55 + 0.35 * pulse) * glow)
    // 헤일로는 글로 세기에 덜 민감하게(sqrt) → 강조도 올려도 두 번째 윤곽처럼 안 보이게
    if (haloMat.current) haloMat.current.opacity = Math.min(0.5, (0.05 + 0.08 * pulse) * Math.sqrt(glow))
  })

  return (
    <group position={pos} rotation={rot} scale={scl}>
      {/* 헤일로: 코어에 바짝 붙인 저투명 라인으로 가짜 블룸(윤곽 겹침 방지) */}
      <lineSegments geometry={edges} scale={1.02}>
        <lineBasicMaterial
          ref={haloMat}
          color={LINE_COLOR}
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
      {/* 코어 네온 라인 */}
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          ref={coreMat}
          color={LINE_COLOR}
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  )
}
