<!-- SandFlow.vue：流沙粒子背景 -->
<!--
  1. 流沙：几千颗细小的沙粒，跟着一张会慢慢变化的「风向图」（噪声流场）流动，汇成一条条丝带
  2. 沙字：一部分沙粒聚成「链上安全局」四个字；每隔几秒一阵风从左往右扫过，把字吹散成流沙，之后又慢慢聚回来
  3. 鼠标：靠近沙字，字就被吹散
  4. 拖尾：每帧不擦画布，只盖一层很淡的黑色，留下残影，所以沙粒会拉出丝缕
-->
<template>
  <canvas ref="canvasRef" class="sand"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  text: { type: String, default: '链上安全局' }, // 沙字内容，传空字符串就不聚字
  textY: { type: Number, default: 0.16 },        // 沙字在屏幕高度的什么位置（0 顶部 ~ 1 底部）
})

const canvasRef = ref(null)
let ctx, w, h, animId
let grains = []
let frame = 0
const mouse = { x: -9999, y: -9999 }

// 颜色：蓝色为基底——深海蓝为主，天蓝、冰蓝提亮，少量白色和霓虹品红点缀（赛博朋克）
const COLORS = [
  [40, 90, 200], [40, 90, 200], [60, 120, 230],  // 深海蓝
  [90, 170, 255], [120, 200, 255],              // 天蓝
  [170, 230, 255],                              // 冰蓝
  [235, 245, 255],                              // 白
  [255, 43, 214],                               // 霓虹品红（少量点缀）
]

// ===== 噪声：生成一张平滑变化的「风向图」=====
// Perlin 噪声：相邻位置的值很接近，整体又有起伏，所以沙粒的流向是连续、柔和的
const perm = new Uint8Array(512)
;(function initNoise() {
  const p = Array.from({ length: 256 }, (_, i) => i).sort(() => Math.random() - 0.5)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
})()
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
function grad(hash, x, y) {
  const g = hash & 3
  return (g & 1 ? -x : x) + (g & 2 ? -y : y)
}
function noise(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
  x -= Math.floor(x); y -= Math.floor(y)
  const u = fade(x), v = fade(y)
  const a = perm[X] + Y, b = perm[X + 1] + Y
  const l1 = grad(perm[a], x, y) + u * (grad(perm[b], x - 1, y) - grad(perm[a], x, y))
  const l2 = grad(perm[a + 1], x, y - 1) + u * (grad(perm[b + 1], x - 1, y - 1) - grad(perm[a + 1], x, y - 1))
  return l1 + v * (l2 - l1) // 大约 -1 ~ 1
}

// 某个位置此刻的风向（角度）。加上 frame 让风向图慢慢变化，流沙才不会一成不变
function flowAngle(x, y) {
  return noise(x * 0.0015, y * 0.0015 + frame * 0.0012) * Math.PI * 1.6
}

// ===== 沙绸：几条像丝绸一样飘动、扭转的沙带 =====
// 每条沙带的中心线是几条正弦波叠出来的曲线，会随时间起伏；
// 宽度也随位置时宽时窄，看起来像一条绸带在空中翻转
const RIBBONS = [
  { y: 0.42, amp: 0.10, f: 0.0035, s: 0.010, width: 0.16, ph: 0, colors: [[40, 90, 210], [70, 130, 240], [170, 225, 255]] },
  { y: 0.66, amp: 0.08, f: 0.0028, s: 0.008, width: 0.12, ph: 2, colors: [[90, 170, 255], [140, 210, 255], [235, 245, 255]] },
  { y: 0.86, amp: 0.05, f: 0.0045, s: 0.012, width: 0.07, ph: 4, colors: [[30, 70, 170], [60, 200, 230], [255, 43, 214]] },
]
function ribbonY(r, x, t) {
  return h * (r.y + r.amp * Math.sin(x * r.f + t * r.s + r.ph) + r.amp * 0.5 * Math.sin(x * r.f * 2.3 - t * r.s * 1.3 + r.ph * 2))
}
function ribbonWidth(r, x, t) {
  return h * r.width * (0.2 + 0.8 * Math.abs(Math.sin(x * r.f * 0.8 + t * 0.006 + r.ph))) // 时宽时窄：绸带在翻转
}
function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 // 近似正态分布：中间多、两边少
}

// ===== 生成沙粒 =====
function newGrain(x, y) {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)]
  return {
    rib: null,                     // 属于哪条沙绸；null 表示不在沙绸上
    off: gauss(),                  // 在沙绸宽度里的位置：-1 一边 ~ 1 另一边
    dust: 0,                       // 从沙绸边缘被吹走的「沙尘」，值是剩余寿命
    x: x ?? Math.random() * w,
    y: y ?? Math.random() * h,
    color: c,
    speed: 0.6 + Math.random() * 1.6,
    alpha: 0.25 + Math.random() * 0.35,
    sparkle: Math.random() < 0.04, // 4% 的沙粒会闪光，像金粉
    home: null,                    // 沙字里的「家」，null 表示自由流动的沙
    blown: 0,                      // 被风吹散的程度：1 完全散开，慢慢降回 0 就飞回家
  }
}

// 把文字画在一张看不见的小画布上，读出文字占了哪些像素，作为沙粒的「家」
function textPoints() {
  if (!props.text) return []
  const off = document.createElement('canvas')
  off.width = w; off.height = h
  const g = off.getContext('2d')
  const size = Math.min(w * 0.09, 130)
  g.font = `bold ${size}px "Microsoft YaHei", "PingFang SC", sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#fff'
  g.fillText(props.text, w / 2, h * props.textY)
  const data = g.getImageData(0, 0, w, h).data
  const pts = []
  const step = 3 // 每隔 3 像素取一个点
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step)
      if (data[(y * w + x) * 4 + 3] > 128) pts.push({ x, y })
  return pts
}

function build() {
  grains = []
  // 沙绸上的沙：沿着沙绸从左往右流
  const count = Math.min(9000, Math.floor((w * h) / 170))
  for (let i = 0; i < count; i++) {
    const r = RIBBONS[i % RIBBONS.length]
    const g = newGrain(Math.random() * (w + 20) - 10, 0)
    g.rib = r
    g.color = r.colors[Math.floor(Math.random() * r.colors.length)]
    grains.push(g)
  }
  // 沙字
  for (const pt of textPoints()) {
    const g = newGrain(pt.x + (Math.random() - 0.5) * 4, pt.y + (Math.random() - 0.5) * 4)
    g.home = pt
    g.alpha = 0.5 + Math.random() * 0.4
    g.color = Math.random() < 0.6 ? [190, 230, 255] : [90, 160, 255] // 沙字用冰蓝和天蓝
    grains.push(g)
  }
}

function resize() {
  w = window.innerWidth
  h = window.innerHeight
  canvasRef.value.width = w
  canvasRef.value.height = h
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  build()
}

// ===== 每一帧 =====
function animate() {
  frame++
  // 盖一层很淡的黑色：上一帧的沙粒留下残影，形成丝缕
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = 'rgba(0,0,0,0.05)' // 越小拖尾越长
  ctx.fillRect(0, 0, w, h)
  // 叠加模式：沙粒重叠的地方更亮，像沙子在发光
  ctx.globalCompositeOperation = 'lighter'

  // 一阵风：每 9 秒左右从左往右扫过一次，扫到的沙字被吹散
  const gustX = ((frame % 540) / 540) * (w + 600) - 300

  for (let i = 0; i < grains.length; i++) {
    const g = grains[i]
    const ang = flowAngle(g.x, g.y)
    // 风向 + 一点点固定往右的风，整体像沙子被风吹着往一个方向流
    const fx = Math.cos(ang) * g.speed + 0.9
    const fy = Math.sin(ang) * g.speed

    if (g.home) {
      // 沙字：被鼠标碰到、或被那阵风扫到，就散开
      const dm = Math.hypot(g.x - mouse.x, g.y - mouse.y)
      if (dm < 110) g.blown = 1
      if (Math.abs(g.home.x - gustX) < 40 && Math.random() < 0.08) g.blown = 1
      g.blown = Math.max(0, g.blown - 0.006) // 大约 3 秒后开始飞回去
      const back = 1 - g.blown
      // 散开时跟着风流动；回家时被「弹簧」拉回原位
      g.x += fx * g.blown * 1.6 + (g.home.x - g.x) * 0.06 * back * back
      g.y += fy * g.blown * 1.6 + (g.home.y - g.y) * 0.06 * back * back
    } else if (g.dust > 0) {
      // 沙尘：离开沙绸，跟着风向图飘散，慢慢消失
      g.x += fx * 0.8
      g.y += fy * 0.8
      g.dust -= 0.006
      if (g.dust <= 0) g.x = w + 99 // 寿命到了，下一步回到沙绸起点
    } else {
      // 沙绸上的沙：往右流，高度贴着沙绸的曲线
      g.x += g.speed * 0.9
      const t = frame
      const target = ribbonY(g.rib, g.x, t) + g.off * ribbonWidth(g.rib, g.x, t)
      g.y += (target - g.y) * 0.25 // 平滑地贴上去，不会一下子跳过去
      // 沙绸边缘的沙，偶尔被风吹走变成沙尘
      if (Math.abs(g.off) > 0.8 && Math.random() < 0.002) g.dust = 1
    }
    if (!g.home && (g.x > w + 10 || g.y < -20 || g.y > h + 20)) {
      // 流出屏幕：回到左边重新流进来
      g.x = -10
      g.dust = 0
      g.y = ribbonY(g.rib, g.x, frame) + g.off * ribbonWidth(g.rib, g.x, frame)
    }

    // 闪光的沙粒：偶尔亮一下，像金粉反光
    let a = g.alpha
    let size = 1.3
    if (g.sparkle && Math.random() < 0.05) {
      a = 0.9
      size = 2
    }
    const [r, gg, b] = g.color
    ctx.fillStyle = `rgba(${r},${gg},${b},${a})`
    ctx.fillRect(g.x, g.y, size, size) // 用方块比画圆快很多，1 像素看不出区别
  }

  ctx.globalCompositeOperation = 'source-over'
  animId = requestAnimationFrame(animate)
}

function onMove(e) {
  mouse.x = e.clientX
  mouse.y = e.clientY
}

onMounted(() => {
  ctx = canvasRef.value.getContext('2d')
  resize()
  animate()
  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', onMove)
})

// 离开页面时停止动画、移除监听
onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('mousemove', onMove)
})
</script>

<style scoped>
/* 铺满屏幕、放在最底层；pointer-events: none 让鼠标能点到上面的登录框 */
.sand { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: -1; pointer-events: none; }
</style>
