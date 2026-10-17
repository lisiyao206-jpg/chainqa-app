<script setup>
// 圆形头像：全站统一用它（顶栏、档案、聊天、好友圈、好友列表）
// user.avatar 有三种：
//   'preset:3'   系统头像：图片放在 web/public/avatars/avatar-3.png（美术同学设计的 6 张）
//   'file:xxxx'  自己上传的图片
//   空           显示昵称的第一个字
import { ref, watch, computed } from 'vue'
import { fileURL } from '../utils/files.js'
import { PRESET_AVATARS } from '../data/avatars.js'

const props = defineProps({
  user: Object,                       // { nickname, avatar }
  size: { type: Number, default: 32 }, // 直径（像素）
})

// 上传的头像要带登录凭证才能下载，下载一次后存起来，同一个头像不用反复下载
const cache = (window.__avatarCache ||= new Map())
const src = ref('')
const broken = ref(false)

const preset = computed(() => {
  const m = props.user?.avatar?.match(/^preset:(\d)$/)
  return m ? PRESET_AVATARS[Number(m[1]) - 1] : null
})

watch(
  () => props.user?.avatar,
  async (avatar) => {
    broken.value = false
    src.value = ''
    if (preset.value) return (src.value = preset.value.src)
    const id = avatar?.match(/^file:([0-9a-f]{32})$/)?.[1]
    if (!id) return
    try {
      if (!cache.has(id)) cache.set(id, fileURL(id))
      src.value = await cache.get(id)
    } catch {
      cache.delete(id)
      broken.value = true
    }
  },
  { immediate: true },
)
</script>

<template>
  <span class="avatar" :style="{ width: size + 'px', height: size + 'px', fontSize: size * 0.42 + 'px' }">
    <img v-if="src && !broken" :src="src" alt="" @error="broken = true" />
    <!-- 系统头像的图片还没放进来时：先用 emoji + 渐变色顶着 -->
    <span v-else-if="preset" class="fallback" :style="{ background: preset.color, fontSize: size * 0.55 + 'px' }">{{ preset.emoji }}</span>
    <span v-else class="letter">{{ props.user?.nickname?.slice(0, 1) || '我' }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-flex; flex-shrink: 0; border-radius: 50%; overflow: hidden;
  border: 1px solid var(--line-strong); background: rgba(0, 240, 255, 0.08); color: #fff;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.fallback, .letter { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
</style>
