<script setup lang="ts">
// MentorBot.vue —— 右下角的 3D 小机器人「白帽导师」（代替原来的 AI 圆形按钮，点它打开 / 收起 AI 面板）
// 模型：public/models/mentor.glb（队友设计、腾讯混元 3D 生成，FBX 转 GLB 并压缩贴图）
// 模型本身没有骨骼（AI 生成的模型是一整块「雕塑」），所以我们在代码里给它装了一副简单的骨骼（见 rig 函数）：
// 按身体位置把每个顶点分给 头 / 身体 / 左右手臂 / 左右腿，再转动这些骨头做动作：
//   出场、打开面板、鼠标放上去：挥手打招呼
//   AI 正在回答：点头 + 两只手交替比划，像在说话
//   平时：轻轻漂浮，头左右张望，手臂微微摆动
// 模型加载失败（比如电脑不支持 WebGL）时，emit('error')，外面退回原来的「AI」文字按钮
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const props = defineProps<{ active?: boolean; thinking?: boolean; wave?: boolean }>()
const emit = defineEmits<{ error: [] }>()
const host = ref<HTMLDivElement | null>(null)

let renderer: THREE.WebGLRenderer | null = null
let raf = 0
let ro: ResizeObserver | null = null
let rigBones: Rig | null = null
let waveUntil = 0 // 挥手到什么时候为止（秒）
let scene: THREE.Scene | null = null

// ===== 代码骨骼 =====
// 关节的位置是按这个模型量出来的（单位：米，脚底为 0）：腿 0~0.5、手臂在 0.55~0.95 向两侧伸出、脖子约 1.07
const JOINTS = { hips: 0.5, shoulderY: 0.88, shoulderX: 0.33, neck: 1.07, legX: 0.17 }
const smooth = (a: number, b: number, x: number) => Math.min(1, Math.max(0, (x - a) / (b - a)))

interface Rig { head: THREE.Bone; armL: THREE.Bone; armR: THREE.Bone; legL: THREE.Bone; legR: THREE.Bone; chest: THREE.Bone }

// 把普通模型变成带骨骼的模型：每个顶点最多跟随两根骨头，关节附近两根骨头按距离混合，转动时过渡更自然
function rig(model: THREE.Object3D): { mesh: THREE.SkinnedMesh; bones: Rig } | null {
  model.updateMatrixWorld(true)
  let src: THREE.Mesh | null = null
  model.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh })
  if (!src) return null
  const mesh0 = src as THREE.Mesh
  const geo = mesh0.geometry.clone()
  geo.applyMatrix4(mesh0.matrixWorld) // 把模型自带的缩放「烘焙」进顶点，之后坐标就是真实的米
  geo.computeBoundingBox()
  const minY = geo.boundingBox!.min.y
  geo.translate(0, -minY, 0) // 脚底放到 0

  // 骨骼树：根 → 胯 → 左右腿、胸 → 头、左右手臂
  const B = (x: number, y: number, z = 0) => { const b = new THREE.Bone(); b.position.set(x, y, z); return b }
  const root = B(0, 0), hips = B(0, JOINTS.hips)
  const legL = B(JOINTS.legX, 0), legR = B(-JOINTS.legX, 0)
  const chest = B(0, JOINTS.shoulderY - JOINTS.hips)
  const head = B(0, JOINTS.neck - JOINTS.shoulderY)
  const armL = B(JOINTS.shoulderX, 0, 0.03), armR = B(-JOINTS.shoulderX, 0, 0.03)
  root.add(hips); hips.add(legL, legR, chest); chest.add(head, armL, armR)
  const bones = [root, hips, legL, legR, chest, head, armL, armR] // 顶点里存的是这个数组的下标

  const pos = geo.attributes.position
  const idx = new Uint16Array(pos.count * 4), wt = new Float32Array(pos.count * 4)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i)
    let a = 4, b = 4, w = 0 // 默认全部跟着胸
    if (y > 1.0) { a = 5; w = smooth(1.02, 1.12, y) }                          // 头
    else if (y < 0.56) { a = x > 0 ? 2 : 3; b = 1; w = 1 - smooth(0.44, 0.56, y) } // 腿（其余跟胯）
    else { a = x > 0 ? 6 : 7; w = smooth(0.29, 0.36, Math.abs(x)) }          // 手臂
    idx.set([a, b, 0, 0], i * 4)
    wt.set([w, 1 - w, 0, 0], i * 4)
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wt, 4))

  const mesh = new THREE.SkinnedMesh(geo, mesh0.material)
  mesh.add(root)
  mesh.updateMatrixWorld(true)
  mesh.bind(new THREE.Skeleton(bones))
  return { mesh, bones: { head, armL, armR, legL, legR, chest } }
}

onMounted(() => {
  const el = host.value!
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) // alpha：背景透明，机器人直接站在网页上
  } catch {
    return emit('error')
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)

  const sc = (scene = new THREE.Scene())
  sc.add(new THREE.HemisphereLight(0xffffff, 0x2a3a66, 2.2))
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.position.set(2, 3, 4)
  sc.add(key)
  const rim = new THREE.DirectionalLight(0x00f0ff, 1.6) // 背后一道青色轮廓光，和网站的霓虹风格呼应
  rim.position.set(-3, 2, -3)
  sc.add(rim)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  const pivot = new THREE.Group() // 所有动作都作用在这个空节点上，模型本身不动
  sc.add(pivot)

  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight
    renderer!.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(el)

  new GLTFLoader().load(
    '/models/mentor.glb',
    (gltf) => {
      // 先装骨骼；万一失败，就用原模型（只有整体漂浮、转身，没有手臂动作）
      const rigged = rig(gltf.scene)
      const model: THREE.Object3D = rigged ? rigged.mesh : gltf.scene
      if (rigged) { rigBones = rigged.bones; waveUntil = performance.now() / 1000 + 2.4 } // 出场先挥手打招呼
      // 按模型实际大小摆好位置：脚踩在原点、左右居中，再让相机刚好框住全身
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      model.position.set(-center.x, -box.min.y, -center.z)
      pivot.add(model)
      const dist = (size.y / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.25
      camera.position.set(0, size.y * 0.55, dist)
      camera.lookAt(0, size.y * 0.48, 0)
    },
    undefined,
    () => emit('error'),
  )

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const timer = new THREE.Timer()
  let yaw = 0
  // 骨头的目标角度：每一帧慢慢靠过去，动作切换时不会突然跳变
  const ease = (obj: THREE.Euler, key: 'x' | 'y' | 'z', target: number, k = 0.15) => { obj[key] += (target - obj[key]) * k }
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    if (document.hidden) return // 页面切到后台时不画，省电
    timer.update(now)
    const t = timer.getElapsed()
    if (!still) {
      const talk = props.thinking
      // 上下漂浮：说话时更快、幅度更大
      pivot.position.y = Math.sin(t * (talk ? 9 : 2)) * (talk ? 0.035 : 0.05)
      // 左右摇摆：说话时身体轻轻晃
      pivot.rotation.z = talk ? Math.sin(t * 6) * 0.06 : 0
      // 朝向：面板打开时转过来面对用户；平时左右慢慢张望
      const greeting = props.wave || performance.now() / 1000 < waveUntil
      const target = props.active || greeting ? 0 : Math.sin(t * 0.7) * 0.6 // 挥手时也转过来正对用户
      yaw += (target - yaw) * 0.06
      pivot.rotation.y = yaw

      // ===== 骨骼动作 =====
      const r = rigBones
      if (r) {
        const now = performance.now() / 1000
        const waving = props.wave || now < waveUntil
        // 右手（模型 +x 一侧）：挥手时举过头顶左右摆；说话时上下比划；平时微微摆动
        if (waving) {
          ease(r.armL.rotation, 'z', 1.3 + Math.sin(t * 11) * 0.3)
          ease(r.armL.rotation, 'x', -0.2) // 斜向上举在脑袋旁边摆，不会被大脑袋挡住
        } else if (talk) {
          ease(r.armL.rotation, 'z', 0.35 + Math.sin(t * 5) * 0.3)
          ease(r.armL.rotation, 'x', -0.35 + Math.sin(t * 4) * 0.15)
        } else {
          ease(r.armL.rotation, 'z', 0.06 + Math.sin(t * 1.6) * 0.05, 0.08)
          ease(r.armL.rotation, 'x', 0, 0.08)
        }
        // 左手：说话时和右手交替比划
        if (talk) {
          ease(r.armR.rotation, 'z', -(0.35 + Math.sin(t * 5 + 1.6) * 0.3))
          ease(r.armR.rotation, 'x', -0.35 + Math.sin(t * 4 + 1.2) * 0.15)
        } else {
          ease(r.armR.rotation, 'z', -(0.06 + Math.sin(t * 1.6 + 1) * 0.05), 0.08)
          ease(r.armR.rotation, 'x', 0, 0.08)
        }
        // 头：说话时点头，挥手时歪头，平时左右张望
        ease(r.head.rotation, 'x', talk ? Math.sin(t * 8) * 0.12 : 0)
        ease(r.head.rotation, 'z', waving ? -0.18 : talk ? Math.sin(t * 3) * 0.06 : 0)
        ease(r.head.rotation, 'y', talk || waving ? 0 : Math.sin(t * 0.9) * 0.35, 0.06)
        // 腿：说话时轻轻踏步
        ease(r.legL.rotation, 'x', talk ? Math.sin(t * 6) * 0.12 : 0)
        ease(r.legR.rotation, 'x', talk ? -Math.sin(t * 6) * 0.12 : 0)
      }
    }
    renderer!.render(sc, camera)
  }
  raf = requestAnimationFrame(tick)
})

// 面板一打开，挥手打个招呼
watch(() => props.active, (on) => { if (on) waveUntil = performance.now() / 1000 + 1.8 })

onUnmounted(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  // 释放显存：进出「白帽导师」页时这个组件会被销毁再创建，不释放的话贴图会越积越多
  scene?.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
    mats.forEach((mat: any) => {
      Object.values(mat).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose())
      mat.dispose()
    })
  })
  renderer?.dispose()
})
</script>

<template>
  <div ref="host" class="mentor-bot"></div>
</template>

<style scoped>
.mentor-bot { width: 100%; height: 100%; }
.mentor-bot :deep(canvas) { display: block; }
</style>
