<script setup>
// 文件卡片：聊天和好友圈里显示一个文件
// 图片直接显示缩略图（点一下看大图）；其他文件显示文件名和大小，点一下下载
import { ref, onMounted, onUnmounted } from 'vue'
import { fileURL, downloadFile, prettySize } from '../utils/files.js'

const props = defineProps({ file: Object })
const src = ref('')
const err = ref('')

onMounted(async () => {
  if (!props.file.isImage) return
  try {
    src.value = await fileURL(props.file.id)
  } catch (e) {
    err.value = e.message
  }
})
// 离开时释放临时网址，不然图片一直占着内存
onUnmounted(() => src.value && URL.revokeObjectURL(src.value))

async function download() {
  try {
    await downloadFile(props.file)
  } catch (e) {
    alert(e.message)
  }
}

// 按扩展名给个小图标
const ext = props.file.name.split('.').pop().toLowerCase()
const icon = { pdf: '📕', doc: '📘', docx: '📘', ppt: '📙', pptx: '📙', xls: '📗', xlsx: '📗', zip: '🗜️', sol: '📜', md: '📝', txt: '📝' }[ext] || '📄'
</script>

<template>
  <img v-if="props.file.isImage && src" :src="src" :alt="props.file.name" class="pic" @click="download" title="点击下载原图" />
  <div v-else-if="props.file.isImage" class="chip">{{ err || '图片加载中…' }}</div>
  <button v-else class="chip" @click="download" title="点击下载">
    <span class="icon">{{ icon }}</span>
    <span class="name">{{ props.file.name }}</span>
    <span class="size">{{ prettySize(props.file.size) }}</span>
  </button>
</template>

<style scoped>
.pic { display: block; max-width: 240px; max-height: 200px; border: 1px solid var(--line); cursor: zoom-in; }
.chip {
  display: inline-flex; align-items: center; gap: 8px; max-width: 280px; padding: 8px 12px;
  border: 1px solid var(--line-strong); background: rgba(0, 240, 255, 0.06);
  color: var(--text); font-size: 13px; font-family: var(--font); cursor: pointer; text-align: left;
}
.chip:hover { border-color: var(--accent); }
.icon { font-size: 18px; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.size { color: var(--text-faint); font-size: 12px; flex-shrink: 0; }
</style>
