<script setup>
// 代码边框：一串代码沿着边框一直绕圈流动
// 用法：父元素加 position: relative，里面放 <CodeFrame :text="..." />，它会自动铺满父元素
//   shape="rect"   方框（右上角切角，和卡片的造型一致）
//   shape="circle" 圆环（用在勋章外圈）
// 原理：SVG 的 <textPath> 能让文字沿着一条路径排列；不断改变文字的起点（startOffset），文字就沿着边框流动
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  text: { type: String, default: 'require(msg.sender == owner); ' },
  shape: { type: String, default: 'rect' },
  color: { type: String, default: 'var(--accent)' },
  duration: { type: Number, default: 24 }, // 绕一圈要几秒，越大越慢
  size: { type: Number, default: 9 },      // 字号
  inset: { type: Number, default: 7 },     // 文字离边缘多远
  chamfer: { type: Number, default: 18 },  // 右上角切角的大小，要和卡片的 clip-path 一样
})

const root = ref(null)
const w = ref(0)
const h = ref(0)
let ro
// 每个边框要有自己的路径 id，不然几个边框会抢同一条路径
const id = 'cf' + Math.random().toString(36).slice(2, 8)

onMounted(() => {
  // 卡片大小会随窗口变化，所以一直盯着它的尺寸
  ro = new ResizeObserver(([e]) => {
    w.value = e.contentRect.width
    h.value = e.contentRect.height
  })
  ro.observe(root.value)
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
      <defs><path :id="id" :d="path.d" /></defs>
      <text :fill="props.color" :font-size="props.size" :textLength="path.len * 2" lengthAdjust="spacing">
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
