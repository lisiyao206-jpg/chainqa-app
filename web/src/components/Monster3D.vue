<!-- Monster3D.vue：3D 漏洞怪兽 -->
<!--
  读取一个 .glb 模型（模型 + 贴图 + 动作都在这一个文件里），放在透明的小舞台上：
    待机时循环播放 Idle（呼吸、晃动）；鼠标按住左右拖动，可以转着看
    action 变成 hit 被打中 / attack 反击 / death 被消灭 时，播放对应的动作
  模型的动作名字每套不一样（Idle、Flying_Idle、HitReact、HitRecieve……），下面 CLIPS 里按关键字去找
  电脑不支持 3D、或者模型加载失败，就发出 error，由外面换回平面图标
-->
<template>
  <div ref="box" class="monster3d" @pointerdown="dragStart"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

interface MonsterAction {
  name: string
  id: number | string
}
const props = withDefaults(defineProps<{
  src?: string            // 模型地址，例如 /monsters/level-1.glb
  color?: string          // 怪兽的主题色：背后那圈轮廓光用它
  action?: MonsterAction | null  // { name: 'hit' | 'attack' | 'death', id }，id 每次不同，连续两次同样的动作也会重新播放
}>(), {
  color: '#00f0ff',
})
const emit = defineEmits(['error'])

// 每种动作可能叫的名字（不同模型包的命名不一样）
const CLIPS: Record<string, RegExp[]> = {
  idle: [/(^|\|)Idle$/i, /Flying_Idle/i, /Idle/i],
  hit: [/HitReact/i, /HitRecieve/i, /Hit/i],
  attack: [/Punch/i, /Headbutt/i, /Bite/i, /Weapon/i, /Attack/i],
  death: [/Death/i, /Die/i],
}

const box = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, model: THREE.Group, mixer: THREE.AnimationMixer, timer: THREE.Timer, raf: number
const actions: Record<string, THREE.AnimationAction> = {} // 找到的动作：{ idle, hit, attack, death }
let current: THREE.AnimationAction | null = null
let yaw = 0, dragging = false, lastX = 0
let ro: ResizeObserver // 盯着舞台大小：窗口变大变小时，画面跟着调整

function findClip(clips: THREE.AnimationClip[], patterns: RegExp[]) {
  for (const p of patterns) {
    const c = clips.find((clip) => p.test(clip.name))
    if (c) return c
  }
  return null
}

// 切换动作：淡入新的、淡出旧的；hit / attack 播一次就回到待机，death 播完停在最后一帧
function play(name: string) {
  const next = actions[name] || actions.idle
  if (!next) return
  const once = name !== 'idle'
  next.reset()
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
  next.clampWhenFinished = name === 'death'
  if (current && current !== next) current.crossFadeTo(next, 0.2, false)
  next.play()
  current = next
}

onMounted(() => {
  const el = box.value!
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) // alpha：背景透明，下面的面板颜色能透出来
  } catch {
    return emit('error')
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(el.clientWidth, el.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(32, el.clientWidth / el.clientHeight, 0.1, 100)
  camera.position.set(0, 0.9, 6)
  camera.lookAt(0, 0.9, 0)

  // 灯光：天光（上亮下暗）+ 正面主光 + 背后一圈怪兽色的轮廓光，赛博朋克的霓虹边
  scene.add(new THREE.HemisphereLight('#ffffff', '#30204a', 1.6))
  const key = new THREE.DirectionalLight('#ffffff', 1.8)
  key.position.set(2, 4, 5)
  scene.add(key)
  const rim = new THREE.DirectionalLight(props.color, 4)
  rim.position.set(-3, 2, -4)
  scene.add(rim)

  // 舞台大小会随窗口变化（怪兽占满左半边），尺寸一变就重新设置画布和镜头比例，怪兽才不会被拉扁
  ro = new ResizeObserver(() => {
    const w = el.clientWidth, h = el.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  })
  ro.observe(el)

  timer = new THREE.Timer() // 计时器：算出每一帧过了多久，动作才能按真实时间播放（新版 three.js 用 Timer 代替了 Clock）
  new GLTFLoader().load(
    props.src as string,
    (gltf) => {
      model = gltf.scene
      // 不同模型大小不一样：统一缩放到差不多高（约 2），并且脚踩在地面中间
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      model.scale.setScalar(2.4 / Math.max(size.x, size.y, size.z))
      const box3 = new THREE.Box3().setFromObject(model)
      const center = box3.getCenter(new THREE.Vector3())
      model.position.x -= center.x
      model.position.z -= center.z
      model.position.y -= box3.min.y
      scene.add(model)

      mixer = new THREE.AnimationMixer(model)
      for (const [name, patterns] of Object.entries(CLIPS)) {
        const clip = findClip(gltf.animations, patterns)
        if (clip) actions[name] = mixer.clipAction(clip)
      }
      // 一次性的动作播完后，回到待机
      mixer.addEventListener('finished', (e) => e.action !== actions.death && play('idle'))
      play('idle')
    },
    undefined,
    () => emit('error'), // 模型文件不存在或者坏了
  )

  const loop = () => {
    raf = requestAnimationFrame(loop)
    timer.update()
    const dt = timer.getDelta()
    mixer?.update(dt)
    if (model) {
      // 没人拖动时，自己慢慢左右张望；拖动后会慢慢回正
      if (!dragging) yaw *= 0.96
      model.rotation.y = yaw + Math.sin(timer.getElapsed() * 0.6) * 0.35
    }
    renderer.render(scene, camera)
  }
  loop()
})

// 外面让怪兽做动作
watch(() => props.action?.id, () => props.action && play(props.action.name))

// 按住左右拖动：转着看怪兽
function dragStart(e: PointerEvent) {
  dragging = true
  lastX = e.clientX
  const move = (ev: PointerEvent) => {
    yaw += (ev.clientX - lastX) * 0.01
    lastX = ev.clientX
  }
  const up = () => {
    dragging = false
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// 离开时停掉动画、释放显卡内存（不然多打几关，显存会越占越多）
onUnmounted(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  scene?.traverse((o) => {
    const mesh = o as THREE.Mesh
    mesh.geometry?.dispose()
    ;([] as THREE.Material[]).concat(mesh.material || []).forEach((m) => {
      Object.values(m).forEach((v: any) => v?.isTexture && v.dispose())
      m.dispose()
    })
  })
  renderer?.dispose()
  renderer?.forceContextLoss()
})
</script>

<style scoped>
.monster3d { width: 100%; height: 100%; cursor: grab; touch-action: none; }
.monster3d:active { cursor: grabbing; }
.monster3d :deep(canvas) { display: block; }
</style>
