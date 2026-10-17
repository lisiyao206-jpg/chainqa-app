<!-- DataOcean.vue：3D 背景「数据海洋」 -->
<!--
  1. 海面：两万颗光点排成网格，像海浪一样不停起伏，越远颜色越偏粉
  2. 太阳：远处地平线上一轮粉金色的太阳，带一道道横条纹（赛博朋克经典的「落日」），会轻轻呼吸
  3. 区块链：一串青色的线框方块漂在海面上，跟着海浪上下起伏，还在慢慢自转
  4. 辉光（Bloom）让亮的东西都晕开一圈光；远处有雾，越远越暗
  5. 镜头缓缓左右漂移，鼠标移动可以转动视角
-->
<template>
  <div ref="host" class="data-ocean"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

const host = ref(null)
let renderer, composer, scene, camera, animId
let ocean, sun, blocks = []
const mouse = { x: 0, y: 0 }
const look = { x: 0, y: 0 }
const BG = '#0a0420'
const N = 150     // 海面网格：每边 150 个点
const GAP_X = 1.6 // 点与点的左右间距
const GAP_Z = 1.4 // 点与点的前后间距

// 海浪的高度：几条不同方向、不同快慢的波叠在一起，起伏才自然
function waveY(x, z, t) {
  return Math.sin(x * 0.12 + t * 0.8) * 1.4 + Math.cos(z * 0.1 + t * 0.6) * 1.4 + Math.sin((x + z) * 0.05 + t * 0.4) * 0.8
}

// 圆形柔光贴图：光点、太阳光晕都用它
function softTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, '#fff')
  grad.addColorStop(0.3, 'rgba(255,255,255,0.5)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

// 赛博朋克落日：上黄下粉的渐变圆，下半部分被一道道横条切开
function sunTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 256)
  grad.addColorStop(0, '#ffe29a')
  grad.addColorStop(0.55, '#ff8fb8')
  grad.addColorStop(1, '#b45cff')
  g.fillStyle = grad
  g.beginPath()
  g.arc(128, 128, 120, 0, Math.PI * 2)
  g.fill()
  // 用「擦除」模式切出横条纹，越往下条纹越粗
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 7; i++) {
    const y = 140 + i * 16
    g.fillRect(0, y, 256, 2 + i * 1.5)
  }
  return new THREE.CanvasTexture(c)
}

function build() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(BG)
  scene.fog = new THREE.Fog(BG, 30, 170)
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600)

  const dot = softTexture()

  // ===== 太阳：光晕 + 条纹太阳 =====
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ff6fae', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, fog: false }))
  glow.scale.set(110, 110, 1)
  glow.position.set(0, 12, -160)
  scene.add(glow)
  // color 调暗一点：太亮的话辉光会把条纹糊成一片白
  sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), color: '#c8b0c8', transparent: true, fog: false }))
  sun.scale.set(46, 46, 1)
  sun.position.set(0, 12, -158)
  scene.add(sun)

  // ===== 星空 =====
  const sp = [], sc = [], c = new THREE.Color()
  for (let i = 0; i < 1800; i++) {
    sp.push((Math.random() - 0.5) * 500, 10 + Math.random() * 150, -100 - Math.random() * 200)
    c.setHSL(0.65 + Math.random() * 0.3, 0.5, 0.85)
    sc.push(c.r, c.g, c.b)
  }
  scene.add(makePoints(sp, sc, 0.9, dot, 0.8))

  // ===== 海面：N × N 个光点 =====
  const p = [], col = []
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      p.push((i - N / 2) * GAP_X, 0, 40 - j * GAP_Z)
      // 近处紫色，越远越偏粉
      c.setHSL(0.75 + (j / N) * 0.17, 0.8, 0.68)
      col.push(c.r, c.g, c.b)
    }
  }
  ocean = makePoints(p, col, 0.45, dot, 1)
  scene.add(ocean)

  // ===== 区块链：一串青色线框方块，漂在海面上 =====
  const geo = new THREE.BoxGeometry(2, 2, 2)
  const edges = new THREE.EdgesGeometry(geo)
  const linkPts = []
  for (let i = 0; i < 14; i++) {
    const color = new THREE.Color().setHSL(0.5 + i * 0.012, 0.8, 0.7)
    const g = new THREE.Group()
    g.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color })))
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false })))
    const x = -20 + i * 3.4
    const z = 12 - i * 3.2
    g.position.set(x, 3, z)
    g.rotation.set(i, i * 0.5, 0)
    g.userData = { x, z }
    scene.add(g)
    blocks.push(g)
    linkPts.push(g.position.clone())
  }
}

function makePoints(pos, colors, size, map, opacity) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size, map, vertexColors: true, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
}

function animate(now) {
  const t = now / 1000

  // 海浪：每一帧重新算每个点的高度
  const arr = ocean.geometry.attributes.position.array
  for (let k = 0; k < arr.length; k += 3) arr[k + 1] = waveY(arr[k], arr[k + 2], t)
  ocean.geometry.attributes.position.needsUpdate = true

  // 区块：跟着海浪起伏 + 自转
  for (const b of blocks) {
    b.position.y = waveY(b.userData.x, b.userData.z, t) + 2.5
    b.rotation.x += 0.004
    b.rotation.y += 0.006
  }

  // 太阳：轻轻呼吸
  const s = 46 + Math.sin(t * 0.8) * 1.5
  sun.scale.set(s, s, 1)

  // 镜头：缓缓左右漂移 + 跟着鼠标转动视角
  look.x += (mouse.x - look.x) * 0.04
  look.y += (mouse.y - look.y) * 0.04
  // 视线看得高一点，海面和区块会落在画面下半部分，不挡中间的文字
  camera.position.set(Math.sin(t * 0.1) * 6, 9 - look.y * 2, 40)
  camera.lookAt(look.x * 30, 11 - look.y * 6, -50)

  composer.render()
  animId = requestAnimationFrame(animate)
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
}

function onMove(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1
}

onMounted(() => {
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  host.value.appendChild(renderer.domElement)
  build()
  // 后期处理：先正常渲染，再加辉光，最后输出到屏幕
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.6, 0.25))
  composer.addPass(new OutputPass())
  animId = requestAnimationFrame(animate)
  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', onMove)
})

// 离开页面时：停止动画、释放显卡资源
onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('mousemove', onMove)
  composer.dispose()
  renderer.dispose()
})
</script>

<style scoped>
/* 铺满屏幕、放在最底层；pointer-events: none 让鼠标能点到上面的内容 */
.data-ocean { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
</style>
