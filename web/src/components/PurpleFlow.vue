<!-- PurpleFlow.vue：流动色彩背景（紫色 / 彩虹两种模式，改 RAINBOW 切换） -->
<!--
  画面由几百条竖向的半透明「丝线」叠出来：每条丝线像水草一样左右摆动，叠在一起就成了流动的丝绸光带
  颜色：薰衣草紫、淡粉白为主，靛蓝打底，夹几缕铜红；上面再撒一层闪烁的金色、白色亮片，顺着丝线慢慢往下飘
-->
<template>
  <canvas ref="canvasRef" class="purple-flow"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref(null)
let ctx, w, h, dpr, animId
let strands = []
let glitters = []

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// 丝线的颜色（权重：同一种颜色写多次，出现得就多）
// 赛博朋克霓虹配色：品红、青、电紫为主，深蓝打底，偶尔一缕霓虹黄
const STRAND_COLORS = [
  [255, 43, 214], [255, 43, 214], [255, 90, 230],    // 霓虹品红
  [0, 240, 255], [0, 200, 255], [80, 220, 255],      // 霓虹青
  [140, 60, 255], [110, 40, 230],                    // 电紫
  [30, 40, 160],                                     // 深蓝
  [252, 238, 10],                                    // 霓虹黄（少量）
]
// 彩虹模式：true = 丝线按位置铺成彩虹色，颜色还会随时间缓慢流转；false = 上面的霓虹配色
const RAINBOW = false
// 亮度：1 是原来的亮度，数字越大越亮（建议 1 ~ 2.5）
const BRIGHTNESS = 1.9

const GLITTER_COLORS = [[255, 230, 180], [255, 255, 255], [230, 150, 120]] // 金、白、铜

// 某条丝线在高度 y、时间 t 时的横坐标：两条正弦波叠加，丝线就会柔软地摆动
function strandX(s, y, t) {
  return s.x + s.a1 * Math.sin(y * s.k1 + t * s.v1 + s.p1) + s.a2 * Math.sin(y * s.k2 - t * s.v2 + s.p2)
}

function build() {
  // 丝线集中在几簇里，画面才有明暗起伏；簇大致均匀地铺满整个宽度
  const n = 10
  const clusters = Array.from({ length: n }, (_, i) => ({ x: ((i + 0.5) / n + rand(-0.04, 0.04)) * w, spread: rand(w * 0.05, w * 0.09) }))
  strands = Array.from({ length: Math.floor(w / 4) }, () => {
    const c = pick(clusters)
    const k = Math.random()
    // 三种丝线：宽而淡的柔光（铺底色）、中等的亮带（丝绸高光）、细线（丝缕质感）
    const type = k < 0.35 ? 'glow' : k < 0.5 ? 'shine' : 'thread'
    const color = type === 'shine' ? pick([[255, 150, 240], [150, 245, 255]]) : pick(STRAND_COLORS)
    return {
      // 70% 的丝线聚在簇里（有明暗起伏），30% 均匀铺满整个宽度（填掉簇之间的缝隙）
      x: Math.random() < 0.3 ? rand(-20, w + 20) : c.x + (Math.random() + Math.random() - 1) * c.spread,
      a1: rand(20, 90), k1: rand(0.0015, 0.004), v1: rand(0.15, 0.4), p1: rand(0, 6.3),
      a2: rand(5, 25), k2: rand(0.006, 0.012), v2: rand(0.2, 0.6), p2: rand(0, 6.3),
      // 彩虹模式下的色相：从左到右铺满整个色环（0 红 → 60 黄 → 120 绿 → 180 青 → 240 蓝 → 300 紫），再随机偏一点
      hue: ((c.x / w) * 330 + rand(-15, 15) + 360) % 360,
      light: type === 'shine' ? rand(85, 93) : type === 'glow' ? rand(62, 74) : rand(68, 80),
      width: type === 'glow' ? rand(30, 90) : type === 'shine' ? rand(4, 14) : rand(0.6, 2),
      alpha: type === 'glow' ? rand(0.02, 0.05) : type === 'shine' ? rand(0.05, 0.11) : rand(0.06, 0.15),
      color,
    }
  })
  glitters = Array.from({ length: Math.floor((w * h) / 1500) }, () => ({
    s: pick(strands),          // 跟着哪条丝线
    y: rand(0, h),
    off: rand(-6, 6),
    speed: rand(10, 40),       // 每秒往下飘多少像素
    size: rand(0.6, 1.8),
    color: pick(GLITTER_COLORS),
    phase: rand(0, 6.3),
  }))
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = window.innerWidth
  h = window.innerHeight
  canvasRef.value.width = w * dpr
  canvasRef.value.height = h * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  build()
}

let last = 0
function animate(now) {
  const t = now / 1000
  const dt = Math.min(0.05, (now - (last || now)) / 1000)
  last = now

  // 底色：深靛蓝到黑的渐变
  ctx.globalCompositeOperation = 'source-over'
  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#120c30')
  bg.addColorStop(1, '#070616')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // 丝线：用「叠加」模式画，重叠的地方自然变亮，就是丝绸的高光
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  const step = 24 // 每隔 24 像素取一个点连成曲线
  for (const s of strands) {
    if (RAINBOW) {
      // 色相随时间慢慢往前走（每秒 6 度，一分钟转完一圈），彩虹会缓缓流动
      ctx.strokeStyle = `hsla(${(s.hue + t * 6) % 360}, 80%, ${s.light}%, ${s.alpha * BRIGHTNESS})`
    } else {
      const [r, g, b] = s.color
      ctx.strokeStyle = `rgba(${r},${g},${b},${s.alpha * BRIGHTNESS})`
    }
    ctx.lineWidth = s.width
    ctx.beginPath()
    for (let y = -step; y <= h + step; y += step) {
      const x = strandX(s, y, t)
      y === -step ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // 亮片：顺着丝线往下飘，一闪一闪
  for (const g of glitters) {
    g.y += g.speed * dt
    if (g.y > h + 5) g.y = -5
    const x = strandX(g.s, g.y, t) + g.off
    const a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 2.5 + g.phase)) ** 3 // 大部分时间暗，偶尔亮一下
    const [r, gg, b] = g.color
    ctx.fillStyle = `rgba(${r},${gg},${b},${a})`
    ctx.fillRect(x, g.y, g.size, g.size)
  }

  // 四周压暗一圈（暗角），让视线集中在中间
  ctx.globalCompositeOperation = 'source-over'
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(0,0,0,0.3)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)

  animId = requestAnimationFrame(animate)
}

onMounted(() => {
  ctx = canvasRef.value.getContext('2d')
  resize()
  animId = requestAnimationFrame(animate)
  window.addEventListener('resize', resize)
})

// 离开页面时停止动画、移除监听
onUnmounted(() => {
  cancelAnimationFrame(animId)
  window.removeEventListener('resize', resize)
})
</script>

<style scoped>
/* 铺满屏幕、放在最底层；pointer-events: none 让鼠标能点到上面的内容 */
.purple-flow { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: -1; pointer-events: none; }
</style>
