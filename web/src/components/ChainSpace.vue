<!-- ChainSpace.vue：梦幻的 3D 背景「链上星河」 -->
<!--
  用 three.js 搭的真 3D 场景：
  1. 星云：几十团粉、紫、青色的柔光云雾，层层叠叠铺在空间里，慢慢旋转
  2. 区块链：一串半透明的发光水晶方块，弯弯曲曲伸向远方，每块都在自转、轻轻上下浮动
  3. 星尘 + 萤火：几千颗小星星一闪一闪，还有几百颗大一点的光点像萤火虫一样慢慢飘
  4. 辉光（Bloom）：所有亮的东西都会向外「晕开」一圈光，这是梦幻感的关键
  5. 镜头缓缓向前飞，鼠标移动可以环顾四周
-->
<template>
  <div ref="host" class="chain-space"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

const host = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer, composer: EffectComposer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, animId: number
let blocks: THREE.Group[] = [], nebulas: THREE.Sprite[] = []
let stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>, fireflies: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>, fireflyBase: ArrayLike<number>
const mouse = { x: 0, y: 0 }  // 鼠标位置：-1 ~ 1
const look = { x: 0, y: 0 }   // 镜头实际的偏转，慢慢追上鼠标
const LENGTH = 420            // 整条链有多长，镜头飞完一遍就从头开始
const BG = '#06021a'          // 背景和雾的颜色：近黑的深紫

// 梦幻配色：粉、薰衣草紫、淡青、淡金（HSL 的色相，0~1）
const HUES = [0.88, 0.5, 0.8, 0.52, 0.15] // 赛博朋克霓虹：品红、青、电紫、青、霓虹黄
const pickHue = () => HUES[Math.floor(Math.random() * HUES.length)]

// 链的中心线：一条在空间里蜿蜒的曲线。z 是往远处的方向
function chainPath(z: number) {
  return new THREE.Vector3(Math.sin(z * 0.02) * 14, Math.cos(z * 0.015) * 6 - 2, -z)
}

// 画一张「中心亮、四周淡出」的圆形贴图，星星、星云、萤火都用它
function softTexture(inner = 0.2) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(inner, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

function build() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(BG)
  // 雾：越远越暗，融进背景色里，制造纵深
  scene.fog = new THREE.FogExp2(BG, 0.014)
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500)

  const dotTex = softTexture(0.25)
  const cloudTex = softTexture(0.05)

  // ===== 1. 星云：大团的柔光，叠加在一起就是云雾 =====
  for (let i = 0; i < 18; i++) { // 星云只留少量，太多会叠成白雾
    const z = Math.random() * LENGTH
    const p = chainPath(z)
    const color = new THREE.Color().setHSL(pickHue(), 0.8, 0.6)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color, transparent: true, opacity: 0.008 + Math.random() * 0.018, // 星云很淡：太浓会和辉光叠成一片白雾
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    sprite.position.set(p.x + (Math.random() - 0.5) * 70, p.y + (Math.random() - 0.5) * 40, p.z - 20)
    const s = 40 + Math.random() * 70
    sprite.scale.set(s, s * 0.7, 1)
    sprite.userData.spin = (Math.random() - 0.5) * 0.05
    scene.add(sprite)
    nebulas.push(sprite)
  }

  // ===== 2. 区块链：半透明的发光水晶方块 =====
  const boxGeo = new THREE.BoxGeometry(3, 3, 3)
  const edges = new THREE.EdgesGeometry(boxGeo)
  const linkPoints: THREE.Vector3[] = []
  for (let i = 0; i < 60; i++) {
    const p = chainPath(i * (LENGTH / 60))
    const color = new THREE.Color().setHSL(HUES[i % HUES.length], 0.75, 0.7)
    const group = new THREE.Group()
    // 线框：方块的边，亮
    group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color })))
    // 面：几乎透明的一层，像水晶
    group.add(new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.025, blending: THREE.AdditiveBlending, depthWrite: false,
    })))
    // 核心：中间一团光
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex, color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    core.scale.set(1.2, 1.2, 1)
    group.add(core)
    group.position.copy(p)
    group.rotation.set(Math.random() * 3, Math.random() * 3, 0)
    group.userData = { base: p.clone(), spin: (Math.random() - 0.5) * 0.6, phase: Math.random() * 6 }
    scene.add(group)
    blocks.push(group)
    linkPoints.push(p)
  }
  // 把区块连起来：用一条平滑的曲线，而不是折线
  const curve = new THREE.CatmullRomCurve3(linkPoints)
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(curve.getPoints(600)),
    new THREE.LineBasicMaterial({ color: '#e0d4ff', transparent: true, opacity: 0.45 })
  ))

  // ===== 3. 星尘：几千颗小星星 =====
  stars = makePoints(7000, 90, 60, 0.3, dotTex, 0.7)
  scene.add(stars)
  // 萤火：几百颗大一点的光点，会慢慢飘动
  fireflies = makePoints(250, 40, 25, 0.5, dotTex, 0.55) // 萤火调小调淡：太大的光点在镜头前会糊成一团团白光
  fireflyBase = fireflies.geometry.attributes.position.array.slice()
  scene.add(fireflies)
}

// 生成一团光点：沿着链的周围随机散布
function makePoints(count: number, spreadX: number, spreadY: number, size: number, map: THREE.Texture, opacity: number) {
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    const center = chainPath(Math.random() * LENGTH)
    pos.set([center.x + (Math.random() - 0.5) * spreadX, center.y + (Math.random() - 0.5) * spreadY, center.z], i * 3)
    c.setHSL(pickHue(), 0.7, 0.8)
    col.set([c.r, c.g, c.b], i * 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size, map, vertexColors: true, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
}

function animate(now: number) {
  const t = now / 1000
  // 镜头沿着链往前飞：每秒 5 个单位
  const z = (t * 5) % (LENGTH - 60)
  const p = chainPath(z)
  const ahead = chainPath(z + 20)
  camera.position.set(p.x + 6, p.y + 3, p.z)
  // 鼠标控制视线：慢慢追上鼠标，转头更平滑
  look.x += (mouse.x - look.x) * 0.04
  look.y += (mouse.y - look.y) * 0.04
  camera.lookAt(ahead.x + look.x * 25, ahead.y - look.y * 15, ahead.z)

  // 区块：自转 + 轻轻上下浮动
  for (const b of blocks) {
    b.rotation.x += b.userData.spin * 0.008
    b.rotation.y += b.userData.spin * 0.012
    b.position.y = b.userData.base.y + Math.sin(t * 0.8 + b.userData.phase) * 0.5
  }
  // 星云：慢慢旋转
  for (const n of nebulas) n.material.rotation += n.userData.spin * 0.01
  // 星星：整体亮度轻轻呼吸
  stars.material.opacity = 0.75 + 0.15 * Math.sin(t * 1.5)
  // 萤火：每颗绕着自己原来的位置画小圈
  const arr = fireflies.geometry.attributes.position.array
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] = fireflyBase[i] + Math.sin(t * 0.5 + i) * 1.5
    arr[i + 1] = fireflyBase[i + 1] + Math.cos(t * 0.4 + i * 0.7) * 1.2
  }
  fireflies.geometry.attributes.position.needsUpdate = true

  composer.render() // 用「后期处理」渲染，才会有辉光
  animId = requestAnimationFrame(animate)
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  composer.setSize(window.innerWidth, window.innerHeight)
}

function onMove(e: MouseEvent) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1
}

onMounted(() => {
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  host.value!.appendChild(renderer.domElement)
  build()
  // 后期处理：先正常渲染一遍，再加「辉光」效果，最后输出到屏幕
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  // 参数：强度 0.45、扩散半径 0.4、亮度超过 0.55 的地方才发光（数字太大画面会一片白）
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.3, 0.7))
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
.chain-space { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
</style>
