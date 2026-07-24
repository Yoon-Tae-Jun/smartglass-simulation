import { useMemo, useRef } from 'react'
import { useFrame, useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'

// ── 스캔 머리 정규화 (실측 미터 → 씬 스케일) ──
// Head.obj bbox: x[-0.118,0.117] y[0.057,0.397] z[-0.072,0.148]
const SCAN_CENTER = new THREE.Vector3(-0.001, 0.227, 0.038)
const SCALE = 4.9 // 머리 높이 0.34m → 약 1.68 유닛
const Y_OFFSET = 0.0 // 세로 위치 미세 조정
const ROT_Y = 0.0 // 얼굴 방향이 뒤를 보면 Math.PI 로

// 머리 점 개수(스캔 룩: 조밀하게)
const HEAD_POINTS = 90000

// 색 그라디언트용 깊이 기준
const C = 0.64

// 정규화 변환 행렬: (local - center) → scale → rotY → +yOffset
const NORMALIZE = new THREE.Matrix4()
  .makeTranslation(0, Y_OFFSET, 0)
  .multiply(new THREE.Matrix4().makeRotationY(ROT_Y))
  .multiply(new THREE.Matrix4().makeScale(SCALE, SCALE, SCALE))
  .multiply(new THREE.Matrix4().makeTranslation(-SCAN_CENTER.x, -SCAN_CENTER.y, -SCAN_CENTER.z))

// z(앞뒤)에 따른 시안 컬러: 앞면 밝은 시안 ↔ 뒷면 딥블루
const CYAN = new THREE.Color('#2da9ef')
const CYAN_DEEP = new THREE.Color('#12557d')
const colorFor = (z) => {
  const facing = THREE.MathUtils.clamp((z / C + 1) / 2, 0, 1)
  return CYAN_DEEP.clone().lerp(CYAN, facing * 0.85 + 0.15)
}

// 둥근 소프트 스플랫 텍스처 (사각 점 대신)
function makeDotTexture() {
  const s = 64
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(c)
  t.needsUpdate = true
  return t
}

// 스캔 메시 표면에서 점 샘플링 + 동일 변환을 적용한 occluder 메시 생성
function buildGeometry(headMesh) {
  const pos = []
  const col = []

  // 법선 기반 명암을 위해 법선 계산 후 샘플러가 보간하도록
  headMesh.geometry.computeVertexNormals()
  const sampler = new MeshSurfaceSampler(headMesh).build()
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < HEAD_POINTS; i++) {
    sampler.sample(p, n)
    p.applyMatrix4(NORMALIZE)
    pos.push(p.x, p.y, p.z)
    // 카메라(+z)를 향한 정도로 밝기 조절 → 오목한 곳(눈두덩/콧방울 옆)은 어둡게
    const facing = THREE.MathUtils.clamp(n.z, 0, 1)
    const shade = 0.45 + 0.75 * facing
    const color = colorFor(p.z).multiplyScalar(shade)
    col.push(color.r, color.g, color.b)
  }

  const pointsGeo = new THREE.BufferGeometry()
  pointsGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  pointsGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))

  // 깊이 전용 occluder: 같은 변환을 먹인 머리 표면 메시
  const depthGeo = headMesh.geometry.clone()
  depthGeo.applyMatrix4(NORMALIZE)
  depthGeo.deleteAttribute('uv')

  return { pointsGeo, depthGeo }
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

export default function PointCloudHead({ playing }) {
  const group = useRef()
  const t0 = useRef(null)
  const { camera } = useThree()

  const obj = useLoader(OBJLoader, '/head/Head.obj')
  const dot = useMemo(() => makeDotTexture(), [])

  const { pointsGeo, depthGeo } = useMemo(() => {
    let mesh = null
    obj.traverse((o) => {
      if (!mesh && o.isMesh) mesh = o
    })
    return buildGeometry(mesh)
  }, [obj])

  const START_ROT = 0.2 // 거의 정면에서 살짝 돌아봄

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const el = state.clock.elapsedTime

    if (!playing) {
      g.rotation.y = START_ROT + Math.sin(el * 0.4) * 0.09
      g.rotation.x = Math.sin(el * 0.3) * 0.025
      return
    }

    if (t0.current === null) t0.current = el
    const p = easeInOut(Math.min(1, (el - t0.current) / 1.9))
    g.rotation.y = START_ROT * (1 - p)
    g.rotation.x = 0
    camera.position.z = 5 - p * 4.05 // 5 → 0.95
    camera.position.y = p * 0.18
    camera.lookAt(0, 0.18, 0)
  })

  return (
    <group ref={group}>
      {/* 깊이만 기록(색 X)해서 앞면 뒤의 내부 구조·뒤통수 점을 가림 */}
      <mesh geometry={depthGeo}>
        <meshBasicMaterial
          colorWrite={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={2}
        />
      </mesh>
      <points geometry={pointsGeo}>
        <pointsMaterial
          size={0.014}
          map={dot}
          sizeAttenuation
          vertexColors
          alphaTest={0.5}
          depthWrite
        />
      </points>
    </group>
  )
}
