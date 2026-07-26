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
const GLASSES_POS = [0.0, 0.31, 0.255] // 프레임 중심 위치(씬 좌표) — 튜너로 확정
const GLASSES_SCALE = 0.77 // 안경 폭(모델 0.81유닛)
const GLASSES_ROT = [-0.052, 3.138, 0.008] // 렌즈가 -Z라 ~180°(+살짝 숙임)로 얼굴 앞

const LINE_COLOR = '#7fd4ff' // 네온 시안
const EDGE_ANGLE = 24 // EdgesGeometry 임계각(도): 낮을수록 라인 많아짐
const GLASS_GLOW = 3.0 // 글로 세기 배수(강조도) — 튜너로 확정

useGLTF.preload(GLASSES_URL)

// GLB의 모든 메시를 월드행렬 반영해 하나로 병합 → 렌즈 앞면 기준으로 재정렬
function buildEdges(scene) {
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

  // bbox 중심을 로컬 원점으로 → 모델 방향에 관계없이 상수 튜닝을 직관적으로
  merged.computeBoundingBox()
  const bb = merged.boundingBox
  const cx = (bb.min.x + bb.max.x) / 2
  const cy = (bb.min.y + bb.max.y) / 2
  const cz = (bb.min.z + bb.max.z) / 2
  merged.translate(-cx, -cy, -cz)

  return new THREE.EdgesGeometry(merged, EDGE_ANGLE)
}

export default function Glasses({ tune }) {
  const { scene } = useGLTF(GLASSES_URL)
  const coreMat = useRef()
  const haloMat = useRef()

  const edges = useMemo(() => buildEdges(scene), [scene])

  // 개발 튜너가 값을 주면 그걸 쓰고, 없으면 상수 사용
  const pos = tune ? [tune.px, tune.py, tune.pz] : GLASSES_POS
  const rot = tune ? [tune.rx, tune.ry, tune.rz] : GLASSES_ROT
  const scl = tune ? tune.scale : GLASSES_SCALE

  const glow = tune ? tune.glassGlow : GLASS_GLOW

  // 은은한 글로 맥동: '작동 중인 AR 기기' 느낌
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2)
    if (coreMat.current) coreMat.current.opacity = Math.min(1, (0.55 + 0.35 * pulse) * glow)
    if (haloMat.current) haloMat.current.opacity = Math.min(1, (0.1 + 0.18 * pulse) * glow)
  })

  return (
    <group position={pos} rotation={rot} scale={scl}>
      {/* 헤일로: 살짝 키운 저투명 라인으로 가짜 블룸 */}
      <lineSegments geometry={edges} scale={1.06}>
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
