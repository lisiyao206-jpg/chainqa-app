<script setup>
// 星空背景：深空 + 三层远近星光 + 中央「粒子星花」
//
// 星花：粒子从中心的发光花蕊里不断喷发出来，带着一点旋转向外飞，拉出细长的光丝，飞远后慢慢淡出
// 颜色：粉、紫、青、蓝、绿交织（由粒子飞出的方向决定），越靠近花蕊越亮、越艳
// 鼠标：扫过的地方星光变亮；整片星空随鼠标轻微偏移（视差）
// 登录成功：星花猛地绽放一次，再进入大厅
import { ref, onMounted, onBeforeUnmount } from 'vue'

const canvas = ref(null)
let ctx, w, h, dpr, rafId, lastTime
let bgStars = []   // 背景星：远、中、近三层
let petals = []    // 星花粒子
let center         // 花蕊：{ x, y, core, radius }
let spriteGlow     // 预先画好的白色光点小图，画大星星时直接贴图，比实时算模糊快得多
let coreSprites    // 花蕊用的彩色光团，每种颜色一张
const mouse = { x: null, y: null }
const parallax = { x: 0, y: 0 }
let bloomUntil = 0 // 登录成功时「绽放」动画的结束时间
let spin = 0       // 整朵星花的旋转角度，每帧慢慢增加

// ===== 小工具 =====
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (t) => Math.max(0, Math.min(1, t))
const rand = (a, b) => a + Math.random() * (b - a)
// 平滑过渡：开头和结尾都慢，中间快，比直线插值更自然
const smooth = (t) => t * t * (3 - 2 * t)
const hsla = (hh, s, l, a) => `hsla(${hh},${s}%,${l}%,${a})`

// ===== 颜色 =====
// 粉、紫、青、蓝、绿（HSL 色相，0 红、60 黄、120 绿、180 青、240 蓝、300 紫）
// 想换颜色，改这一行就行
const PALETTE = [320, 285, 190, 210, 155]

// 按「飞出的方向」取颜色：绕一圈依次经过 PALETTE 里的颜色，相邻颜色之间平滑过渡
function hueAt(angle) {
  const turn = (((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)
  const k = turn * PALETTE.length
  const i = Math.floor(k)
  return lerp(PALETTE[i], PALETTE[(i + 1) % PALETTE.length], k - i)
}

// ===== 生成 =====
// 画一张「中心亮、四周淡出」的圆形小图
function makeSprite(size, color, mid) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, color(1))
  if (mid) grad.addColorStop(0.15, color(0.6))
  grad.addColorStop(1, color(0))
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}
function makeSprites() {
  spriteGlow = makeSprite(64, (a) => `rgba(255,255,255,${a})`, true)
  coreSprites = PALETTE.map((hh) => makeSprite(256, (a) => hsla(hh, 85, 62, a)))
}

function newPetal(fresh) {
  const life = rand(3.5, 6.5) // 每个粒子从花蕊飞到远处、再消失，用 3.5~6.5 秒
  const angle = rand(0, Math.PI * 2)
  return {
    angle,                                // 飞出的方向
    hh: hueAt(angle) + rand(-12, 12),     // 颜色由方向决定，再随机偏一点，颜色更丰富
    reach: center.radius * rand(0.3, 1.1), // 最远能飞多远：有远有近，花朵才有层次；最远的会飞出屏幕
    swirl: rand(1.6, 2.6),                // 一生里绕中心转多少（弧度）：转得多，就形成旋涡状的螺旋臂
    age: fresh ? 0 : rand(0, life),       // 刚打开页面时，让粒子分布在各个阶段
    life,
    size: rand(0.6, 1.8),
    glow: 0,                              // 被鼠标「点亮」的程度
  }
}

function build() {
  // 花蕊放在屏幕正中，正好在左边介绍文字和右边登录框之间
  // radius 按屏幕宽度算，squash 把花朵按屏幕比例压扁，这样左右、上下都能铺到边
  center = { x: w * 0.5, y: h * 0.5, core: Math.min(w, h) * 0.05, radius: w * 0.62, squash: (h / w) * 1.15 }

  // 背景星：远景多而暗，中景适中，近景少而亮
  bgStars = []
  const area = (w * h) / 1e6
  const layers = [
    { n: 420 * area, z: 0.2, size: [0.3, 0.8], l: [55, 70], a: [0.25, 0.55] },
    { n: 140 * area, z: 0.5, size: [0.6, 1.2], l: [75, 85], a: [0.45, 0.75] },
    { n: 18 * area, z: 1.0, size: [1.2, 2.0], l: [92, 97], a: [0.8, 1.0], breathe: true },
  ]
  for (const L of layers) {
    for (let i = 0; i < L.n; i++) {
      bgStars.push({
        x: rand(0, w), y: rand(0, h), z: L.z,
        size: rand(...L.size),
        hh: rand(205, 220), s: rand(10, 20), l: rand(...L.l), a: rand(...L.a),
        breathe: L.breathe,                 // 只有前景亮星会呼吸
        period: rand(3, 4.5), phase: rand(0, Math.PI * 2),
        twinkle: rand(0.5, 1.5),
        glow: 0,
      })
    }
  }

  const count = Math.min(3000, Math.floor(1700 * area)) // 铺满全屏需要更多粒子
  petals = Array.from({ length: count }, () => newPetal(false))
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = window.innerWidth
  h = window.innerHeight
  canvas.value.width = w * dpr
  canvas.value.height = h * dpr
  canvas.value.style.width = w + 'px'
  canvas.value.style.height = h + 'px'
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  build()
}

// 鼠标附近的「点亮」目标值：离鼠标越近越接近 1，半径 150 像素外为 0
function mouseInfluence(x, y) {
  if (mouse.x === null) return 0
  const d = Math.hypot(x - mouse.x, y - mouse.y)
  return d > 150 ? 0 : smooth(1 - d / 150)
}

// 让 value 以「大约 0.4 秒」的速度平滑地追向 target
function approach(value, target, dt) {
  return value + (target - value) * (1 - Math.exp(-dt / 0.15))
}

// 粒子在一生的进度 life（0~1）时的位置
// 距离用 life 的 1.5 次方：开头慢、后来快，所以大量粒子挤在花蕊附近，中心又密又亮
function petalPos(p, life, cx, cy) {
  const r = center.core * 0.4 + p.reach * life ** 1.5
  const ang = p.angle + spin + p.swirl * life // 整体在转 + 每个粒子一边往外飞一边转，形成螺旋
  return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r * center.squash, r }
}

// ===== 每一帧 =====
function draw(now) {
  const dt = Math.min(0.05, (now - (lastTime || now)) / 1000) // 两帧之间过了多少秒
  lastTime = now
  const bloom = now < bloomUntil
  const t = now / 1000
  spin += dt * (bloom ? 1.2 : 0.18) // 整朵星花慢慢旋转，登录成功时转得更快

  // 视差：慢慢追上鼠标的位置
  const tx = mouse.x === null ? 0 : (mouse.x - w / 2) / w
  const ty = mouse.y === null ? 0 : (mouse.y - h / 2) / h
  parallax.x = approach(parallax.x, tx, dt * 0.3)
  parallax.y = approach(parallax.y, ty, dt * 0.3)

  // 1. 背景：纯黑
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)

  // 之后的光都用「叠加」模式画：光与光重叠会更亮，像真实的发光
  ctx.globalCompositeOperation = 'lighter'

  // 2. 背景星
  for (const s of bgStars) {
    const x = s.x - parallax.x * 30 * s.z
    const y = s.y - parallax.y * 30 * s.z
    s.glow = approach(s.glow, mouseInfluence(x, y), dt)
    let a = s.a
    if (s.breathe) a *= 0.6 + 0.4 * Math.sin((t / s.period) * Math.PI * 2 + s.phase)
    else a *= 0.85 + 0.15 * Math.sin(t * s.twinkle + s.phase)
    a = Math.min(1, a + s.glow * 0.3)
    if (s.breathe) {
      const size = s.size * 7
      ctx.globalAlpha = a
      ctx.drawImage(spriteGlow, x - size / 2, y - size / 2, size, size)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = hsla(lerp(s.hh, 190, s.glow * 0.8), s.s + s.glow * 15, Math.min(98, s.l + s.glow * 15), a)
    ctx.beginPath()
    ctx.arc(x, y, s.size, 0, Math.PI * 2)
    ctx.fill()
  }

  const cx = center.x - parallax.x * 15
  const cy = center.y - parallax.y * 15

  // 3. 花蕊：几团不同颜色的光，围着中心慢慢转、轻轻呼吸，叠在一起像一朵发光的花芯
  const pulse = 1 + 0.08 * Math.sin(t * 1.3) + (bloom ? 0.6 : 0)
  coreSprites.forEach((sp, i) => {
    const ang = t * 0.25 + (i * Math.PI * 2) / coreSprites.length
    const off = center.core * 0.6
    const size = center.core * 5.5 * pulse
    ctx.globalAlpha = 0.42
    ctx.drawImage(sp, cx + Math.cos(ang) * off - size / 2, cy + Math.sin(ang) * off - size / 2, size, size)
  })
  ctx.globalAlpha = 0.18 // 中心一点点白，太白会盖住花蕊的颜色
  const white = center.core * 2 * pulse
  ctx.drawImage(spriteGlow, cx - white / 2, cy - white / 2, white, white)
  ctx.globalAlpha = 1

  // 4. 星花粒子：从花蕊喷出，拉出光丝
  for (let i = 0; i < petals.length; i++) {
    const p = petals[i]
    p.age += dt * (bloom ? 3 : 1)
    const life = clamp01(p.age / p.life)
    const pos = petalPos(p, life, cx, cy)

    const near = 1 - clamp01((pos.r - center.core) / center.radius) // 1 = 在花蕊旁，0 = 飞到最远
    p.glow = approach(p.glow, mouseInfluence(pos.x, pos.y), dt)
    const l = Math.min(88, lerp(55, 70, near) + p.glow * 15) // 越靠近花蕊越亮
    const s = lerp(70, 92, near)                              // 也越艳
    // 透明度：刚喷出时迅速亮起，后半程慢慢淡出
    const a = smooth(clamp01(life / 0.08)) * (1 - smooth(clamp01((life - 0.55) / 0.45))) * 0.9

    if (a > 0.01) {
      ctx.strokeStyle = hsla(p.hh, s, l, a * 0.7)
      ctx.lineWidth = p.size * lerp(0.6, 1.3, near)
      // 光丝：取「稍早一点」时的几个位置连成一条弧线，所以光丝是弯的，跟着螺旋走
      ctx.beginPath()
      for (let j = 4; j >= 0; j--) {
        const q = j === 0 ? pos : petalPos(p, Math.max(0, life - 0.02 * j), cx, cy)
        j === 4 ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y)
      }
      ctx.stroke()
      // 光丝的「头」：亮一点的小点
      ctx.fillStyle = hsla(p.hh, s, Math.min(95, l + 8), a)
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, p.size * 0.7, 0, Math.PI * 2)
      ctx.fill()
    }

    // 一生走完：回到花蕊重新喷出
    if (life >= 1) petals[i] = newPetal(true)
  }

  ctx.globalCompositeOperation = 'source-over'
  rafId = requestAnimationFrame(draw)
}

// 登录成功时调用：星花猛地绽放一次（0.9 秒），再跳转
function engulf() {
  bloomUntil = performance.now() + 900
  return new Promise((resolve) => setTimeout(resolve, 900))
}
defineExpose({ engulf })

function onMove(e) {
  mouse.x = e.clientX
  mouse.y = e.clientY
}
function onLeave() {
  mouse.x = mouse.y = null
}

onMounted(() => {
  ctx = canvas.value.getContext('2d')
  makeSprites()
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('mousemove', onMove)
  document.addEventListener('mouseleave', onLeave)
  rafId = requestAnimationFrame(draw)
})

// 离开登录页时停止动画、移除监听，不然会一直在后台占用电脑
onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('mousemove', onMove)
  document.removeEventListener('mouseleave', onLeave)
})
</script>

<template>
  <canvas ref="canvas" class="star-field"></canvas>
</template>

<style scoped>
/* 铺满整个屏幕，放在最底层；pointer-events: none 让鼠标能点到上面的登录框 */
.star-field { position: fixed; inset: 0; z-index: -1; pointer-events: none; }
</style>
