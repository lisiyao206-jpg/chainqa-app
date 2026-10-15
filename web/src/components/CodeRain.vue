<script setup>
import { ref } from 'vue'

// 转场特效：满屏的代码字符像下雨一样往下落，0.8 秒后淡出
const canvas = ref(null)
const visible = ref(false)

const CHARS = '01ABCDEF0x{}();=>#$'.split('')
const WORDS = ['0x', 'msg', 'sender', 'require', 'mapping', 'uint256', 'call', 'emit']
const DURATION = 800 // 整个特效持续的毫秒数
let timer = null

// 外面调用 play() 就播放一次
function play() {
  const el = canvas.value
  if (!el) return
  visible.value = true
  const ctx = el.getContext('2d')
  const w = (el.width = window.innerWidth)
  const h = (el.height = window.innerHeight)
  const size = 16
  const cols = Math.ceil(w / size)
  // 每一列字符当前落到的高度（随机起点，看起来更自然）
  const drops = Array.from({ length: cols }, () => Math.random() * -h / size)
  const start = performance.now()

  cancelAnimationFrame(timer)
  function frame(now) {
    const t = (now - start) / DURATION // 0 → 1 的进度
    // 半透明黑色盖一层，留下「拖尾」效果
    ctx.fillStyle = 'rgba(5, 8, 15, 0.25)'
    ctx.fillRect(0, 0, w, h)
    ctx.font = `${size}px Consolas, monospace`
    for (let i = 0; i < cols; i++) {
      // 偶尔落一个 Solidity 单词，其余是单个字符
      const text = Math.random() < 0.03
        ? WORDS[Math.floor(Math.random() * WORDS.length)]
        : CHARS[Math.floor(Math.random() * CHARS.length)]
      // 大部分是青色，少数是红色，呼应红蓝霓虹的配色
      ctx.fillStyle = Math.random() < 0.1 ? '#ff4d5e' : '#3be3ff'
      ctx.fillText(text, i * size, drops[i] * size)
      drops[i] += 1.4
    }
    // 后半段整体淡出，露出新页面
    el.style.opacity = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) * 2)
    if (t < 1) timer = requestAnimationFrame(frame)
    else visible.value = false
  }
  timer = requestAnimationFrame(frame)
}

// 让父组件（App.vue）可以调用 play()
defineExpose({ play })
</script>

<template>
  <canvas v-show="visible" ref="canvas" class="rain"></canvas>
</template>

<style scoped>
.rain {
  position: fixed; inset: 0; z-index: 999;
  pointer-events: none;   /* 不挡住鼠标点击 */
  background: #05080f;
}
</style>
