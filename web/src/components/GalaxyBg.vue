<!-- GalaxyBg.vue：3D 背景「螺旋星系」 -->
<!--
  参考 Three.js Journey（Bruno Simon）的经典星系生成算法：
  1. 十几万颗粒子沿着几条「旋臂」排开，离中心越远，旋臂弯得越厉害
  2. 每颗粒子都随机偏离旋臂一点点，而且越靠近旋臂越密（用乘方让随机值集中在 0 附近）
  3. 颜色从中心的品红色，渐变到外围的霓虹青
  在这个基础上加了：粒子旋转着不断被吸进中心（漩涡）、镜头慢慢环绕、鼠标视差、辉光，以及几颗被一起吸进去的「区块」
-->
<template>
  <div ref="host" class="galaxy-bg"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// ===== 星系参数：改这里就能生成不同的星系 =====
const P = {
  count: 150000,        // 粒子数量
  radius: 6,            // 星系半径
  branches: 3,          // 旋臂数量
  spin: 1,              // 旋臂弯曲程度：越大越「卷」
  randomness: 0.35,     // 粒子偏离旋臂的最大距离（相对半径的比例）
  randomnessPower: 3,   // 越大，粒子越集中在旋臂上
  insideColor: '#ff2bd6', // 中心颜色：霓虹品红
  outsideColor: '#00c8ff', // 外围颜色：霓虹青
}

const host = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer, composer: EffectComposer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, animId: number
let galaxy: THREE.Points, blocks: THREE.LineSegments[] = []
const mouse = { x: 0, y: 0 }
const look = { x: 0, y: 0 }

function softTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, '#fff')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.4)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(c)
}

// ===== 漩涡：粒子不断被中心吸进去 =====
// 十几万颗粒子每一帧都要动，用 JavaScript 一颗颗算会卡，所以把计算写成「着色器」交给显卡并行算：
// 每颗粒子只记住「出生时的半径 r0、在哪条旋臂、随机偏移」，位置由时间算出来——
//   半径随时间不断变小（被吸向中心），到中心后回到最外圈重新开始；
//   越靠近中心转得越快、越亮，像被吸进黑洞
const vertexShader = `
  uniform float uTime;
  uniform float uSize;
  uniform float uRadius;
  uniform float uSpin;
  uniform vec3 uInside;
  uniform vec3 uOutside;
  attribute float aR0;       // 出生时的半径
  attribute float aBranch;   // 旋臂的角度
  attribute vec3 aOffset;    // 偏离旋臂的随机量（按半径缩放）
  attribute float aSpeed;    // 每颗粒子被吸进去的速度略有不同
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // 当前半径：随时间从外往里缩，mod 让它到中心后回到外圈
    float r = mod(aR0 - uTime * aSpeed, uRadius) + 0.05;
    float k = r / uRadius;                 // 0 = 中心，1 = 最外圈
    // 角度：旋臂本身的螺旋 + 整体慢慢自转 + 越靠近中心转得越快的额外旋转
    // 注意：额外旋转不能写成「时间 × 转速」，那样时间越久转得越快（越转越快的 bug）。
    // 要按「粒子走到这个半径时，一路累计转过的角度」来算：只跟半径有关，速度就一直稳定
    float angle = aBranch + r * uSpin + uTime * 0.15 + 0.3 * uRadius * pow(1.0 - k, 3.0) / aSpeed;
    vec3 p = vec3(cos(angle) * r, 0.0, sin(angle) * r) + aOffset * r;
    p.y *= 0.6;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 + (1.0 - k) * 0.3) * (300.0 / -mv.z); // 近大远小，越靠中心越大
    vColor = mix(uInside, uOutside, k);
    // 刚从外圈出现时淡入、快到中心时淡出，循环时才不会突然跳
    vAlpha = smoothstep(1.0, 0.9, k) * smoothstep(0.0, 0.15, k) * (0.45 + 0.55 * k); // 中心附近粒子太密，调淡一点免得糊成一片白
  }
`
const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    // 画成中心亮、四周淡出的小圆点
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`
let galaxyMat: THREE.ShaderMaterial

function buildGalaxy() {
  const r0 = new Float32Array(P.count)
  const branch = new Float32Array(P.count)
  const offset = new Float32Array(P.count * 3)
  const speed = new Float32Array(P.count)
  for (let i = 0; i < P.count; i++) {
    r0[i] = Math.random() * P.radius
    branch[i] = ((i % P.branches) / P.branches) * Math.PI * 2
    // 随机偏移：random 的 power 次方集中在 0 附近，所以大部分粒子贴着旋臂，少数散开
    for (let j = 0; j < 3; j++) offset[i * 3 + j] = Math.pow(Math.random(), P.randomnessPower) * (Math.random() < 0.5 ? 1 : -1) * P.randomness
    speed[i] = 0.25 + Math.random() * 0.2
  }
  const geo = new THREE.BufferGeometry()
  // three.js 要求一定要有 position，这里随便给一份，真正的位置在着色器里算
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.count * 3), 3))
  geo.setAttribute('aR0', new THREE.BufferAttribute(r0, 1))
  geo.setAttribute('aBranch', new THREE.BufferAttribute(branch, 1))
  geo.setAttribute('aOffset', new THREE.BufferAttribute(offset, 3))
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), P.radius * 2) // 告诉 three.js 粒子大概在哪，避免被误判为看不见
  galaxyMat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uSize: { value: 0.02 * Math.min(window.devicePixelRatio || 1, 2) },
      uRadius: { value: P.radius }, uSpin: { value: P.spin },
      uInside: { value: new THREE.Color(P.insideColor) }, uOutside: { value: new THREE.Color(P.outsideColor) },
    },
  })
  return new THREE.Points(geo, galaxyMat)
}

// 中心的「吸收核心」：一团最亮的光
function buildCore(dot: THREE.Texture) {
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ffd6f6', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  core.scale.set(0.7, 0.7, 1)
  return core
}

function build() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color('#030208')
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200)

  const dot = softTexture()

  // 远处的星空
  const sp = new Float32Array(3000 * 3)
  for (let i = 0; i < sp.length; i++) sp[i] = (Math.random() - 0.5) * 120
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.15, map: dot, color: '#c9c3ff', transparent: true, opacity: 0.7, depthWrite: false })))

  galaxy = buildGalaxy()
  galaxy.add(buildCore(dot))
  scene.add(galaxy)

  // 区块：几颗霓虹黄的线框方块，也跟着粒子一起被吸向中心（让星系和「链」联系起来）
  const geo = new THREE.BoxGeometry(0.18, 0.18, 0.18)
  const edges = new THREE.EdgesGeometry(geo)
  for (let i = 0; i < 9; i++) {
    const b = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#fcee0a' })) // 霓虹黄，和品红、青形成对比
    b.userData = { r: 1.5 + i * 0.45, branch: i % P.branches }
    galaxy.add(b) // 加在星系里面，跟着星系一起转
    blocks.push(b)
  }
}

function animate(now: number) {
  const t = now / 1000

  // 把时间交给着色器，粒子就会动起来（旋转 + 被吸进中心）
  galaxyMat.uniforms.uTime.value = t

  // 区块：和粒子用同样的规律，沿旋臂旋转着被吸向中心，到中心后回到外圈
  for (const b of blocks) {
    const r = ((b.userData.r - t * 0.3) % P.radius + P.radius) % P.radius + 0.3
    const k = r / P.radius
    const a = (b.userData.branch / P.branches) * Math.PI * 2 + r * P.spin + t * 0.15 + 0.3 * P.radius * (1 - k) ** 3 / 0.3 // 和粒子同样的算法，不会越转越快
    b.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r)
    b.scale.setScalar(Math.min(1, k * 4)) // 快到中心时变小消失
    b.rotation.x = t
    b.rotation.y = t * 1.3
  }

  // 镜头：斜上方俯视，慢慢环绕；鼠标让视角轻轻偏移
  look.x += (mouse.x - look.x) * 0.04
  look.y += (mouse.y - look.y) * 0.04
  const ang = t * 0.03 + look.x * 0.6
  const dist = 7.5
  camera.position.set(Math.sin(ang) * dist, 3.2 + look.y * 1.5, Math.cos(ang) * dist)
  camera.lookAt(0, 0, 0)

  composer.render()
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
  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.5, 0.2))
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
.galaxy-bg { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
</style>
