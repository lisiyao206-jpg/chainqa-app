<script setup lang="ts">
// 代码边框：一串代码沿着边框一直绕圈流动
// 用法：父元素加 position: relative，里面放 <CodeFrame :text="..." />，它会自动铺满父元素
//   shape="rect"   方框（右上角切角，和卡片的造型一致）
//   shape="circle" 圆环（用在勋章外圈）
// 原理：SVG 的 <textPath> 能让文字沿着一条路径排列；不断改变文字的起点（startOffset），文字就沿着边框流动
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = withDefaults(defineProps<{
  text?: string
  shape?: string
  color?: string
  duration?: number // 绕一圈要几秒，越大越慢
  size?: number     // 字号
  inset?: number    // 文字离边缘多远
  chamfer?: number  // 右上角切角的大小，要和卡片的 clip-path 一样
  rainbow?: boolean // 彩色：品红 → 紫 → 青 → 黄的渐变，颜色沿着边框缓缓流动
}>(), {
  text: 'require(msg.sender == owner); ',
  shape: 'rect',
  color: 'var(--accent)',
  duration: 24,
  size: 9,
  inset: 7,
  chamfer: 18,
  rainbow: false,
})

const root = ref<SVGSVGElement | null>(null)
const w = ref(0)
const h = ref(0)
let ro: ResizeObserver | undefined
// 每个边框要有自己的路径 id，不然几个边框会抢同一条路径
const id = 'cf' + Math.random().toString(36).slice(2, 8)

onMounted(() => {
  // 卡片大小会随窗口变化，所以一直盯着它的尺寸
  ro = new ResizeObserver(([e]) => {
    w.value = e.contentRect.width
    h.value = e.contentRect.height
  })
  ro.observe(root.value!)
})
onUnmounted(() => ro?.disconnect())

// 文字走的路径，以及路径的总长度（周长）
const path = computed(() => {
  const m = props.inset, W = w.value, H = h.value
  if (props.shape === 'circle') {
    const r = Math.min(W, H) / 2 - m, cx = W / 2, cy = H / 2
    return {
      d: `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`,
      len: 2 * Math.PI * r,
    }
  }
  const c = props.chamfer - m * 0.4 // 切角处往里收一点，文字不会被裁掉
  const d = `M ${m} ${m} L ${W - m - c} ${m} L ${W - m} ${m + c} L ${W - m} ${H - m} L ${m} ${H - m} Z`
  const len = (W - 2 * m - c) + Math.SQRT2 * c + (H - 2 * m - c) + (W - 2 * m) + (H - 2 * m)
  return { d, len }
})

// 文字要正好是两圈长：起点从 -1 圈慢慢移到 0，任何时候边框上都排满了字，循环时也看不出接缝
const repeated = computed(() => {
  const perLap = Math.max(1, Math.round(path.value.len / (props.size * 0.62))) // 等宽字体每个字大约 0.62 个字号宽
  // 一圈放整数遍代码（不从中间截断），首尾才接得上；多出来或少一点的长度由 textLength 自动调整字距
  const unit = props.text + '  '
  const s = unit.length > perLap ? unit.slice(0, perLap) : unit.repeat(Math.max(1, Math.round(perLap / unit.length)))
  return s + s
})
</script>

<template>
  <svg ref="root" class="code-frame" aria-hidden="true">
    <template v-if="w && h">
      <defs>
        <path :id="id" :d="path.d" />
        <!-- 彩色渐变：每 260 像素换一轮颜色（来回反射），再让渐变本身平移一个周期，颜色就沿着边框不停流动 -->
        <linearGradient v-if="props.rainbow" :id="id + 'g'" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="260" y2="260" spreadMethod="reflect">
          <stop offset="0" stop-color="#ff2bd6" />
          <stop offset="0.33" stop-color="#8a5cff" />
          <stop offset="0.66" stop-color="#00f0ff" />
          <stop offset="1" stop-color="#fcee0a" />
          <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="520 520" dur="8s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <text :fill="props.rainbow ? `url(#${id}g)` : props.color" :font-size="props.size" :textLength="path.len * 2" lengthAdjust="spacing">
        <textPath :href="'#' + id">
          {{ repeated }}
          <animate attributeName="startOffset" :from="-path.len" to="0" :dur="props.duration + 's'" repeatCount="indefinite" />
        </textPath>
      </text>
    </template>
  </svg>
</template>

<style scoped>
.code-frame {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; overflow: visible;
  font-family: var(--font-code); opacity: 0.75;
}
</style>
