<script setup lang="ts">
import { ref } from 'vue'

// 图片位：有图就显示图，图还没放进来就显示占位（emoji + 虚线框 + 文件名）
const props = defineProps<{
  src?: string       // 图片路径，例如 /lobby/hero-figure.png
  fallback?: string  // 图片缺失时显示的 emoji
  label?: string     // 占位框上的提示，例如 "hero-figure.png 800高"
  compact?: boolean  // 小图位（头像、图标）不显示文字提示，鼠标悬停才看得到
}>()

const broken = ref(false)
</script>

<template>
  <img v-if="!broken" :src="props.src" class="slot-img" @error="broken = true" />
  <div v-else class="slot-placeholder" :title="props.label">
    <span class="slot-emoji">{{ props.fallback }}</span>
    <span v-if="!props.compact" class="slot-label">{{ props.label }}</span>
  </div>
</template>

<style scoped>
.slot-img { width: 100%; height: 100%; object-fit: contain; display: block; }
.slot-placeholder {
  position: relative;
  width: 100%; height: 100%;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border: 1px dashed rgba(255, 255, 255, 0.35);
  border-radius: 6px;
}
.slot-emoji { font-size: 0.8em; line-height: 1; }
/* 文件名提示放在占位框左上角，几个框叠在一起时不会互相挡住 */
.slot-label {
  position: absolute; top: 6px; left: 8px;
  font-size: 11px; color: rgba(255, 255, 255, 0.5); white-space: nowrap;
}
</style>
