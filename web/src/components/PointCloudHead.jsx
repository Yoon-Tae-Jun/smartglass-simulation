import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import Glasses from './Glasses.jsx'

// ── 스캔 머리 정규화 (실측 미터 → 씬 스케일) ──
// Head.obj bbox: x[-0.118,0.117] y[0.057,0.397] z[-0.072,0.148]
const SCAN_CENTER = new THREE.Vector3(-0.001, 0.227, 0.038)
const SCALE = 4.9 // 머리 높이 0.34m → 약 1.68 유닛
const Y_OFFSET = 0.0 // 세로 위치 미세 조정
const ROT_Y = 0.0 // 얼굴 방향이 뒤를 보면 Math.PI 로

// 머리 점 개수(스캔 룩: 조밀하게) — 실제 표시는 HEAD_COUNT 로 drawRange 조절
const HEAD_POINTS = 90000 // 샘플링(빌드) 최대 개수
const HEAD_COUNT = 49000 // 표시 개수(강조도) — 튜너로 확정
const HEAD_SIZE = 0.009 // 점 크기 — 튜너로 확정
const HEAD_BRIGHT = 0.65 // 밝기 배수(0~1, 낮을수록 덜 강조) — 튜너로 확정

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

export default function PointCloudHead({ playing, tune }) {
  const group = useRef()
  const t0 = useRef(null)
  const { camera } = useThree()
  const controls = useThree((s) => s.controls)

  const obj = useLoader(OBJLoader, '/head/Head.obj')
  const dot = useMemo(() => makeDotTexture(), [])

  const { pointsGeo, depthGeo } = useMemo(() => {
    let mesh = null
    obj.traverse((o) => {
      if (!mesh && o.isMesh) mesh = o
    })
    return buildGeometry(mesh)
  }, [obj])

  // 강조도 파라미터: 튜너가 있으면 그 값, 없으면 상수
  const headCount = tune ? tune.headCount : HEAD_COUNT
  const headSize = tune ? tune.headSize : HEAD_SIZE
  const headBright = tune ? tune.headBright : HEAD_BRIGHT

  // 개수 조절: 리샘플링 없이 drawRange 로 표시 점 수만 자름
  useEffect(() => {
    pointsGeo.setDrawRange(0, Math.min(headCount, HEAD_POINTS))
  }, [pointsGeo, headCount])

  // 시선타깃은 머리 중심에 고정, 카메라 위치(camX/Y/Z)만 튜너로 이동 → 카메라가 머리를
  // 어느 방향에서 보는지(각도)를 조절. 값이 바뀔 때만 반영 → 슬라이더 사이엔 드래그 유지.
  const HEAD_LOOK_Y = 0.1 // 머리 중심 높이(시선타깃)
  const camX = tune ? tune.camX : -0.77
  const camY = tune ? tune.camY : 0.46
  const camZ = tune ? tune.camZ : 0.6
  useEffect(() => {
    if (playing || !controls) return
    camera.position.set(camX, camY, camZ)
    controls.target.set(0, HEAD_LOOK_Y, 0)
    controls.update()
  }, [camera, controls, playing, camX, camY, camZ])

  const START_ROT = -Math.PI / 2 // 시작은 왼쪽 옆모습(왼쪽 귀가 카메라 향함) → 클릭 시 정면

  // 시작 시선은 머리 중심. 클릭하면 좌상단 카메라 → 정면·안경 중심으로 이동.
  const startLookX = 0
  const startLookY = HEAD_LOOK_Y
  // 인트로 종료 시 안경을 화면 중앙에 크게: 안경 높이(≈GLASSES_POS.y)로 시선/카메라를 맞춤
  const GLASSES_Y = 0.31
  const endCamZ = tune ? tune.endZ : 0.85 // 안경 클로즈업 거리

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const el = state.clock.elapsedTime

    if (!playing) {
      t0.current = null
      g.rotation.y = START_ROT + Math.sin(el * 0.4) * 0.09
      g.rotation.x = Math.sin(el * 0.3) * 0.025
      return
    }

    // 재생 시작 시점의 회전·카메라 상태를 캡처해 그 지점에서 부드럽게 이어감
    if (t0.current === null) {
      t0.current = {
        t: el,
        ry: g.rotation.y,
        rx: g.rotation.x,
        cx: camera.position.x,
        cy: camera.position.y,
        cz: camera.position.z,
      }
    }
    const s = t0.current
    const p = easeInOut(Math.min(1, (el - s.t) / 1.9))
    // 옆모습 → 정면
    g.rotation.y = s.ry * (1 - p)
    g.rotation.x = s.rx * (1 - p)
    // 오른쪽 치우침 → 중앙, 그리고 안경 클로즈업으로 줌인
    camera.position.x = s.cx * (1 - p)
    camera.position.y = s.cy + (GLASSES_Y - s.cy) * p
    camera.position.z = s.cz + (endCamZ - s.cz) * p
    // 시선도 시작 오프셋 → 안경 중심으로 함께 이동(스냅 방지)
    camera.lookAt(
      startLookX * (1 - p),
      startLookY * (1 - p) + GLASSES_Y * p,
      0,
    )
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
        {/* 밝기는 material.color 그레이스케일 배수로(vertexColors × color) →
            opacity로 낮추면 alphaTest에 걸려 점이 사라지므로 색으로 감광 */}
        <pointsMaterial
          size={headSize}
          map={dot}
          sizeAttenuation
          vertexColors
          color={[headBright, headBright, headBright]}
          alphaTest={0.5}
          depthWrite
        />
      </points>
      {/* 스마트글래스: 머리 그룹 안이라 유휴 회전·인트로 줌에 함께 참여 */}
      <Suspense fallback={null}>
        <Glasses tune={tune} />
      </Suspense>
    </group>
  )
}
