<!-- ButterflySand.vue：粒子蝴蝶 -->
<!--
  1. 形状（赛博朋克）：翅膀全由直线和尖角构成；霓虹青轮廓 + 霓虹粉「电路线」从翅根连向每个尖角，翅根品红发光
  2. 动态：「聚拢 → 散开 → 再聚拢」循环（大约 12 秒一轮）
     聚拢时是一只清晰发光的蝴蝶；散开时所有粒子向外飘散，变成一团霓虹青色的数据碎片；之后又聚回来
  3. 鼠标：靠近蝴蝶，那一片的粒子会被推开
  4. 登录成功：整只蝴蝶散成星尘消失，再进入大厅
-->
<template>
  <canvas ref="canvasRef" class="butterfly"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const canvasRef = ref(null)
let ctx, w, h, dpr, animId, lastTime
let stars = []
let dust = []    // 漂浮的霓虹尘埃：填满蝴蝶周围的空间
let streams = [] // 数据流：从屏幕两边流向蝴蝶的细光线
let rings = []   // 环绕蝴蝶的几圈轨道
let grains = []
let scale, cx, cy
const mouse = { x: -9999, y: -9999 }
let dissolveAt = 0 // 登录成功的时刻；0 表示还没登录

const rand = (a, b) => a + Math.random() * (b - a)
const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// ===== 蝴蝶的形状：右半边的翅膀用多边形描出来，左半边镜像 =====
// 坐标单位大约 -4 ~ 4，x 向右，y 向下
// 赛博朋克风格：翅膀全部用直线和尖角构成，不用圆弧，像切割出来的几何体
const UPPER = [[0.05, -0.2], [1.3, -2.3], [3.9, -3.5], [3.4, -2.0], [3.8, -1.3], [2.6, -0.5], [2.9, -0.1], [0.05, 0.15]] // 上翅：尖角向外上方，外缘有锯齿缺口
const LOWER = [[0.05, 0.25], [2.5, 0.35], [3.1, 1.5], [2.3, 2.0], [2.8, 3.5], [1.3, 2.4], [0.9, 2.9], [0.1, 1.1]]         // 下翅：尖刺一样的「尾巴」
// 点在不在多边形里面（射线法：从点往右画一条线，穿过边的次数是奇数就在里面）
function inside(poly, x, y) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}
// 在多边形的边上随机取一个点（用来画亮晶晶的翅膀边缘）
function edgePoint(poly) {
  const i = Math.floor(Math.random() * (poly.length - 1))
  const [x1, y1] = poly[i], [x2, y2] = poly[i + 1]
  const k = Math.random()
  return [x1 + (x2 - x1) * k + rand(-0.06, 0.06), y1 + (y2 - y1) * k + rand(-0.06, 0.06)]
}
function randomWingPoint() {
  const side = Math.random() < 0.5 ? 1 : -1 // 一半放到左边：左右对称
  // 20% 的点放在翅膀边缘上，形成亮晶晶的轮廓
  if (Math.random() < 0.2) {
    const part = Math.random() < 0.6 ? 'upper' : 'lower'
    const [x, y] = edgePoint(part === 'upper' ? UPPER : LOWER)
    if (x > 0.15) return { bx: x * side, by: y, part, edge: true }
  }
  // 其余的点：先在方框里随便取，不在翅膀里就重来
  for (;;) {
    const x = rand(0, 4), y = rand(-3.4, 3.6)
    const part = inside(UPPER, x, y) ? 'upper' : inside(LOWER, x, y) ? 'lower' : null
    if (part) return { bx: x * side, by: y, part, edge: false }
  }
}

// ===== 颜色：赛博朋克霓虹 =====
// 轮廓：霓虹青；电路线（从翅根连到每个尖角的直线）：霓虹粉；内部：暗紫蓝，零星青色像屏幕像素；翅根：品红发光
function onCircuit(x, y, poly) {
  // 点离「翅根 → 某个尖角」这条直线足够近，就算在电路线上
  for (const [px, py] of poly) {
    const len = Math.hypot(px, py)
    if (len < 0.5) continue
    const k = (x * px + y * py) / (len * len) // 点投影到这条线上的位置（0 = 翅根，1 = 尖角）
    if (k < 0.08 || k > 1) continue
    if (Math.hypot(x - px * k, y - py * k) < 0.035) return true
  }
  return false
}
function wingColor(bx, by, part, edge) {
  const x = Math.abs(bx)
  if (edge) return [[0, 240, 255], true]                                   // 轮廓：霓虹青
  if (onCircuit(x, by, part === 'upper' ? UPPER : LOWER)) return [[255, 43, 214], true] // 电路线：霓虹粉
  const d = Math.min(1, Math.hypot(x, by) / 3.8)                          // 0 = 翅根，1 = 最外面
  if (d < 0.22) return [[255, 80, 220], true]                              // 翅根：品红发光
  if (Math.random() < 0.12) return [[0, 220, 255], false]                  // 零星的青色「像素」
  const c = d < 0.6 ? [120, 70, 230] : [60, 50, 170]                       // 内部：紫 → 暗蓝紫
  return [part === 'lower' ? c.map((v) => v * 0.8) : c, false]
}

function newGrain() {
  const p = randomWingPoint()
  const [color, glowing] = wingColor(p.bx, p.by, p.part, p.edge)
  const ang = rand(0, Math.PI * 2)
  return {
    ...p,
    color,
    glowing,                 // 紫色花纹的粒子：聚拢时更亮，散开时褪成铜色
    size: rand(0.9, 2),
    alpha: rand(0.6, 1),
    twinkle: rand(0, Math.PI * 2),
    // 散开时往哪飘：大方向是从中心往外，再加一点随机
    sx: Math.sign(p.bx || 1) * rand(0.3, 1.6) + Math.cos(ang) * 0.6,
    sy: p.by * rand(0.1, 0.4) + Math.sin(ang) * 0.8,
    push: 0,                 // 被鼠标推开的程度
  }
}

function build() {
  scale = Math.min(w, h) * 0.105 // 蝴蝶大小
  cx = w / 2
  cy = h * 0.48
  const count = Math.min(22000, Math.floor((w * h) / 70))
  grains = Array.from({ length: count }, newGrain)
  // 霓虹尘埃：几千颗小光点在整个屏幕里慢慢飘，近的大而快、远的小而慢，有纵深感
  const NEON = [[0, 240, 255], [255, 43, 214], [140, 60, 255], [252, 238, 10]]
  dust = Array.from({ length: Math.floor((w * h) / 900) }, () => {
    const z = Math.random() ** 2 // 0 远 ~ 1 近，平方让远处的小点更多
    return {
      x: rand(0, w), y: rand(0, h), z,
      vx: rand(-6, 6) * (0.3 + z), vy: rand(-12, -2) * (0.3 + z), // 整体慢慢往上飘
      size: 0.6 + z * 2.2,
      color: NEON[Math.random() < 0.55 ? 0 : Math.random() < 0.6 ? 1 : Math.random() < 0.7 ? 2 : 3],
      phase: rand(0, 6.3),
    }
  })
  // 数据流：几十条细光线，从屏幕左右两边弯弯地流向蝴蝶，到了就从头再来
  streams = Array.from({ length: 36 }, () => newStream(true))
  // 轨道：几个扁椭圆，绕着蝴蝶慢慢转，上面各有一个发光的小方块（区块）
  rings = Array.from({ length: 3 }, (_, i) => ({ rx: scale * (5.2 + i * 1.3), ry: scale * (1.3 + i * 0.35), tilt: -0.25 + i * 0.18, speed: 0.25 - i * 0.06, phase: i * 2 }))
  stars = Array.from({ length: Math.floor((w * h) / 3500) }, () => ({
    x: rand(0, w), y: rand(0, h), r: rand(0.3, 1.2), a: rand(0.2, 0.6), speed: rand(0.5, 2), phase: rand(0, 6.3),
  }))
}

function newStream(fresh) {
  const side = Math.random() < 0.5 ? -1 : 1
  return {
    side,
    y0: rand(0, h),                 // 从屏幕边缘哪个高度出发
    bend: rand(-0.4, 0.4) * h,      // 弯曲程度
    t: fresh ? Math.random() : 0,   // 走到了哪里：0 起点 ~ 1 到达蝴蝶
    speed: rand(0.12, 0.3),
    color: Math.random() < 0.6 ? [0, 240, 255] : [255, 43, 214],
  }
}
// 数据流在进度 k 时的位置：一条二次贝塞尔曲线，从屏幕边缘弯到蝴蝶中心
function streamPos(s, k) {
  const x0 = s.side < 0 ? -20 : w + 20
  const mx = (x0 + cx) / 2, my = (s.y0 + cy) / 2 + s.bend
  const a = (1 - k) * (1 - k), b = 2 * k * (1 - k), c = k * k
  return [a * x0 + b * mx + c * cx, a * s.y0 + b * my + c * cy]
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

// 「散开程度」随时间变化：0 = 完全聚拢，1 = 完全散开
// 一轮 12 秒：聚拢停留 5 秒 → 3.5 秒慢慢散开 → 3.5 秒慢慢聚回来
function scatterAt(t) {
  const p = (t % 12) / 12
  if (p < 0.42) return 0
  if (p < 0.71) return smooth((p - 0.42) / 0.29)
  return 1 - smooth((p - 0.71) / 0.29)
}

// ===== 每一帧 =====
function animate(now) {
  const dt = Math.min(0.05, (now - (lastTime || now)) / 1000)
  lastTime = now
  const t = now / 1000
  let s = scatterAt(t)
  let fade = 1
  if (dissolveAt) {
    // 登录成功：1.2 秒内散开并淡出
    const k = Math.min(1, (now - dissolveAt) / 1200)
    s = Math.max(s, k) * (1 + k)
    fade = 1 - k
  }

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter' // 叠加发光：粒子密的地方更亮

  // 霓虹尘埃
  for (const d of dust) {
    d.x += d.vx * dt
    d.y += d.vy * dt
    if (d.y < -5) { d.y = h + 5; d.x = rand(0, w) }
    if (d.x < -5) d.x = w + 5
    if (d.x > w + 5) d.x = -5
    const [r, g, b] = d.color
    ctx.fillStyle = `rgba(${r},${g},${b},${(0.25 + 0.5 * d.z) * (0.6 + 0.4 * Math.sin(t * 2 + d.phase)) * fade})`
    ctx.fillRect(d.x, d.y, d.size, d.size)
  }

  // 数据流：每条画成一小段发光的弧线，沿着曲线流向蝴蝶
  ctx.lineWidth = 1.2
  for (let i = 0; i < streams.length; i++) {
    const s = streams[i]
    s.t += dt * s.speed
    if (s.t > 1) { streams[i] = newStream(false); continue }
    const [r, g, b] = s.color
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.5 * Math.sin(s.t * Math.PI) * fade})` // 中途最亮，两头淡
    ctx.beginPath()
    for (let j = 0; j <= 6; j++) {
      const [x, y] = streamPos(s, Math.max(0, s.t - j * 0.02))
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // 轨道：扁椭圆 + 一个绕着走的发光小方块
  for (const ring of rings) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(ring.tilt)
    ctx.strokeStyle = `rgba(0,240,255,${0.12 * fade})`
    ctx.lineWidth = 1
    ctx.setLineDash([4, 10]) // 虚线，更像 HUD 界面
    ctx.beginPath()
    ctx.ellipse(0, 0, ring.rx, ring.ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    const a = t * ring.speed + ring.phase
    const bx = Math.cos(a) * ring.rx, by = Math.sin(a) * ring.ry
    ctx.strokeStyle = `rgba(252,238,10,${0.85 * fade})`
    ctx.lineWidth = 1.4
    ctx.strokeRect(bx - 5, by - 5, 10, 10)
    ctx.restore()
  }

  // 星空
  for (const st of stars) {
    ctx.fillStyle = `rgba(160,230,255,${st.a * (0.6 + 0.4 * Math.sin(t * st.speed + st.phase))})`
    ctx.fillRect(st.x, st.y, st.r, st.r)
  }

  // 聚拢时，蝴蝶身后有一团淡紫色的光
  const glowA = 0.25 * (1 - Math.min(1, s)) * fade
  if (glowA > 0.01) {
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 3.5)
    glow.addColorStop(0, `rgba(255,43,214,${glowA})`)
    glow.addColorStop(1, 'rgba(0,240,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(cx - scale * 4, cy - scale * 4, scale * 8, scale * 8)
  }

  // 整只蝴蝶轻轻上下浮动
  const bob = Math.sin(t * 0.8) * scale * 0.06
  // 散开时整体也会放大一些，像星尘向外膨胀
  const grow = 1 + 0.35 * s
  const sc = Math.min(1, s)

  for (const g of grains) {
    // 每颗粒子散开时还会自己轻轻打转，星尘才不会是死板地平移
    const wob = sc * scale * 0.25
    let x = cx + g.bx * scale * grow + g.sx * scale * s * 1.6 + Math.sin(t * 0.7 + g.twinkle) * wob
    let y = cy + g.by * scale * grow + g.sy * scale * s * 1.6 + bob + Math.cos(t * 0.6 + g.twinkle) * wob

    // 鼠标推开：离鼠标 100 像素以内的粒子被推开，鼠标走了慢慢回来
    const dm = Math.hypot(x - mouse.x, y - mouse.y)
    g.push = dm < 100 ? Math.min(1, g.push + dt * 4) : Math.max(0, g.push - dt * 0.8)
    if (g.push > 0 && dm > 0.1) {
      x += ((x - mouse.x) / dm) * g.push * 60
      y += ((y - mouse.y) / dm) * g.push * 60
    }

    // 颜色：散开时发亮的部分慢慢变成霓虹青色的数据碎片
    let [r, gg, b] = g.color
    if (g.glowing && sc > 0) {
      r = lerp(r, 80, sc); gg = lerp(gg, 200, sc); b = lerp(b, 255, sc)
    }
    // 亮度：花纹聚拢时最亮；散开时整体变暗变朦胧
    const tw = 0.7 + 0.3 * Math.sin(t * 3 + g.twinkle)
    const a = g.alpha * tw * (g.glowing ? 1 : 0.7) * (1 - sc * 0.45) * fade
    ctx.fillStyle = `rgba(${r | 0},${gg | 0},${b | 0},${a})`
    const size = g.size * (g.glowing ? 1.25 : 1) * (1 - sc * 0.3) // 花纹的粒子稍大，更亮
    ctx.fillRect(x, y, size, size)
  }

  ctx.globalCompositeOperation = 'source-over'
  animId = requestAnimationFrame(animate)
}

// 登录成功时调用：蝴蝶散成星尘消失（1.2 秒），再跳转
function engulf() {
  dissolveAt = performance.now()
  return new Promise((resolve) => setTimeout(resolve, 1200))
}
defineExpose({ engulf })

function onMove(e) {
  mouse.x = e.clientX
  mouse.y = e.clientY
}

onMounted(() => {
  ctx = canvasRef.value.getContext('2d')
  resize()
  animId = requestAnimationFrame(animate)
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
.butterfly { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: -1; pointer-events: none; }
</style>
