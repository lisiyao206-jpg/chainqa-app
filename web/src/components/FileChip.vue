<script setup lang="ts">
// 文件卡片：聊天和好友圈里显示一个文件
// 图片直接显示缩略图（点一下下载原图）；视频点「播放」后才下载（视频比较大，不自动下载）；
// 其他文件显示文件名和大小，点一下下载
import { ref, onMounted, onUnmounted } from 'vue'
import { fileURL, downloadFile, prettySize } from '../utils/files'
import type { FileInfo } from '../types'

const props = defineProps<{ file?: FileInfo }>()
const src = ref('')
const err = ref('')

onMounted(async () => {
  if (!props.file!.isImage) return
  try {
    src.value = await fileURL(props.file!.id)
  } catch (e) {
    err.value = (e as Error).message
  }
})
// 离开时释放临时网址，不然图片一直占着内存
onUnmounted(() => src.value && URL.revokeObjectURL(src.value))

// 视频：第一次点播放时才去下载，下载完直接在这里播放
const videoSrc = ref('')
const loadingVideo = ref(false)
async function playVideo() {
  loadingVideo.value = true
  try {
    videoSrc.value = await fileURL(props.file!.id)
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    loadingVideo.value = false
  }
}
onUnmounted(() => videoSrc.value && URL.revokeObjectURL(videoSrc.value))

async function download() {
  try {
    await downloadFile(props.file!)
  } catch (e) {
    alert((e as Error).message)
  }
}

// 按扩展名给个小图标
const ext = props.file!.name.split('.').pop()!.toLowerCase()
const icon = { pdf: '📕', doc: '📘', docx: '📘', ppt: '📙', pptx: '📙', xls: '📗', xlsx: '📗', zip: '🗜️', sol: '📜', md: '📝', txt: '📝' }[ext] || '📄'
</script>

<template>
  <img v-if="props.file!.isImage && src" :src="src" :alt="props.file!.name" class="pic" @click="download" title="点击下载原图" />
  <div v-else-if="props.file!.isImage" class="chip">{{ err || '图片加载中…' }}</div>
  <video v-else-if="props.file!.isVideo && videoSrc" :src="videoSrc" class="video" controls autoplay></video>
  <button v-else-if="props.file!.isVideo" class="video-cover" :disabled="loadingVideo" @click="playVideo">
    <span class="play">{{ loadingVideo ? '…' : '▶' }}</span>
    <span>{{ err || (loadingVideo ? '视频加载中…' : props.file!.name) }}</span>
    <span class="size">{{ prettySize(props.file!.size) }}</span>
  </button>
  <button v-else class="chip" @click="download" title="点击下载">
    <span class="icon">{{ icon }}</span>
    <span class="name">{{ props.file!.name }}</span>
    <span class="size">{{ prettySize(props.file!.size) }}</span>
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
.video { display: block; width: 100%; max-width: 560px; max-height: 360px; background: #000; border: 1px solid var(--line); }
/* 视频还没加载时的封面：一个大大的播放键 */
.video-cover {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  width: 100%; max-width: 560px; aspect-ratio: 16 / 9; cursor: pointer;
  color: var(--text); font-size: 13px; font-family: var(--font);
  background: radial-gradient(circle, rgba(255, 43, 214, 0.18), rgba(6, 4, 20, 0.9)); border: 1px solid var(--line-strong);
}
.video-cover:hover .play { box-shadow: 0 0 28px var(--accent); }
.play {
  width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 22px; color: #05020f; background: linear-gradient(135deg, var(--accent-strong), var(--accent)); transition: box-shadow 0.25s;
}
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.size { color: var(--text-faint); font-size: 12px; flex-shrink: 0; }
</style>
