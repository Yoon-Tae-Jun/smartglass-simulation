import { useMemo } from 'react'
import * as THREE from 'three'

// 별 개수
const COUNT = 14000

// 은하수 띠: 화면을 가로지르는 밀집 띠의 중심 높이와 두께
// (cosθ 기준: 0 = 화면 정중앙, +1 = 맨 위. 중심을 살짝 위로 두고 위아래로 부드럽게 흩어짐)
const BAND_CENTER = 0.15
const BAND_SPREAD = 0.5
// 이 비율만큼은 전체 구에 골고루 뿌려 천장·바닥이 완전히 비지 않게
const UNIFORM_RATIO = 0.4

// 배치: 원점을 감싸는 구(sphere) 껍질 → 어느 각도로 회전해도 별이 채워짐
const R_MIN = 30
const R_MAX = 60

// 색 팔레트 (index.css의 sky 톤과 일치)
const WHITE = new THREE.Color('#eaf9ff')
const DIM = new THREE.Color('#7f8a93')
const SKY = new THREE.Color('#56c2ff')

// 동그란 soft 별 스프라이트 (네모 픽셀 대신 방사형 그라데이션)
function makeStarTexture() {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.85)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

export default function Starfield() {
  const { geometry, material } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3)
    const col = new Float32Array(COUNT * 3)

    for (let i = 0; i < COUNT; i++) {
      // y를 위쪽 축으로 하는 구면 분포 + 랜덤 반경.
      // 일부는 전체 구에 균등(천장·바닥까지 채움), 나머지는 띠 중심에 가우시안으로 몰아
      // 중앙 가로 띠가 가장 빼곡하되 어느 곳도 완전히 비지 않게(은하수 느낌).
      let cosT
      if (Math.random() < UNIFORM_RATIO) {
        cosT = Math.random() * 2 - 1 // 전체 구 균등
      } else {
        const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 // ≈[-1,1] 종형
        cosT = BAND_CENTER + g * BAND_SPREAD
      }
      cosT = Math.max(-0.999, Math.min(0.999, cosT))
      const sinT = Math.sqrt(1 - cosT * cosT)
      const phi = Math.random() * Math.PI * 2
      const radius = R_MIN + Math.random() * (R_MAX - R_MIN)
      pos[i * 3] = sinT * Math.cos(phi) * radius
      pos[i * 3 + 1] = cosT * radius
      pos[i * 3 + 2] = sinT * Math.sin(phi) * radius

      // 색: 대부분 흰색, 일부 어둡게, 소수 블루 톤 + 밝기 편차
      const r = Math.random()
      const base = r < 0.08 ? SKY : r < 0.32 ? DIM : WHITE
      const bright = 0.55 + Math.random() * 0.45
      col[i * 3] = base.r * bright
      col[i * 3 + 1] = base.g * bright
      col[i * 3 + 2] = base.b * bright
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))

    // PointsMaterial은 별당 크기를 못 주므로, 평균 크기 + 스프라이트로 처리.
    // 크기 편차는 z 분포와 sizeAttenuation으로 자연스럽게 표현됨.
    const mat = new THREE.PointsMaterial({
      size: 0.28,
      map: makeStarTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    })

    return { geometry: geo, material: mat }
  }, [])

  return <points geometry={geometry} material={material} />
}
