<script setup>
// 个人资料弹窗：看自己的信息和学习统计，改昵称、改密码
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user.js'
import { useThemeStore, BACKGROUNDS } from '../stores/theme.js'
import MedalWall from './MedalWall.vue'
import UserAvatar from './UserAvatar.vue'
import { PRESET_AVATARS } from '../data/avatars.js'
import { uploadFile } from '../utils/files.js'

const emit = defineEmits(['close'])
const userStore = useUserStore()
const theme = useThemeStore()

const profile = ref(null)
const nickname = ref('')
const oldPwd = ref('')
const newPwd = ref('')
// 操作结果提示：{ ok: true/false, text }
const msg = ref(null)
const showWall = ref(false) // 勋章墙开关

onMounted(async () => {
  profile.value = await userStore.api('/api/profile')
  nickname.value = profile.value.nickname
})

async function saveNickname() {
  try {
    await userStore.api('/api/profile', { nickname: nickname.value }, 'PUT')
    // 公告板里的昵称也要改，顶栏头像上的字才会跟着变
    userStore.user.nickname = nickname.value.trim()
    msg.value = { ok: true, text: '昵称已保存' }
  } catch (err) {
    msg.value = { ok: false, text: err.message }
  }
}

// ===== 头像 =====
const showPicker = ref(false)
const avatarInput = ref(null)
const uploading = ref(false)

async function saveAvatar(avatar) {
  try {
    await userStore.api('/api/avatar', { avatar }, 'PUT')
    // 公告板和档案里的头像一起改，顶栏、聊天里的头像马上跟着变
    userStore.user.avatar = profile.value.avatar = avatar
    showPicker.value = false
    msg.value = { ok: true, text: '头像已更换' }
  } catch (err) {
    msg.value = { ok: false, text: err.message }
  }
}

// 把图片裁成正中间的正方形，再缩小到 256×256：
// 头像是圆的，正方形放进去刚好；缩小后文件只有几十 KB，加载快
function cropSquare(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 256
      canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
      URL.revokeObjectURL(img.src)
      canvas.toBlob((blob) => resolve(new File([blob], 'avatar.png', { type: 'image/png' })), 'image/png')
    }
    img.onerror = () => reject(new Error('这张图片打不开，换一张试试'))
    img.src = URL.createObjectURL(file)
  })
}

async function uploadAvatar(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return (msg.value = { ok: false, text: '请选择图片文件' })
  uploading.value = true
  try {
    const f = await uploadFile(await cropSquare(file))
    await saveAvatar('file:' + f.id)
  } catch (err) {
    msg.value = { ok: false, text: err.message }
  } finally {
    uploading.value = false
  }
}

async function savePassword() {
  try {
    await userStore.api('/api/password', { oldPwd: oldPwd.value, newPwd: newPwd.value }, 'PUT')
    oldPwd.value = newPwd.value = ''
    msg.value = { ok: true, text: '密码已修改，下次登录请用新密码' }
  } catch (err) {
    msg.value = { ok: false, text: err.message }
  }
}
</script>

<template>
  <!-- @click.self：只有点到黑色背景本身才关闭，点卡片里面不会关 -->
  <div class="mask" @click.self="emit('close')">
    <div class="card">
      <header>
        <b>🪪 审计员档案</b>
        <button class="close" @click="emit('close')">✕</button>
      </header>

      <div v-if="!profile" class="hint">加载中…</div>
      <template v-else>
        <!-- 基本信息 + 右上角的圆形头像（点一下换头像） -->
        <div class="top">
          <dl class="info">
            <dt>账号</dt><dd>{{ profile.account }}</dd>
            <dt>身份</dt><dd>{{ profile.role === 'admin' ? '管理员' : '审计员' }}</dd>
            <dt>入职时间</dt><dd>{{ profile.registerTime.slice(0, 10) }}</dd>
          </dl>
          <button class="my-avatar" title="更换头像" @click="showPicker = !showPicker">
            <UserAvatar :user="profile" :size="84" />
            <span class="change">更换</span>
          </button>
        </div>

        <!-- 选头像：6 个系统头像，或者上传本地图片 -->
        <div v-if="showPicker" class="picker">
          <button
            v-for="(p, i) in PRESET_AVATARS"
            :key="i"
            :class="['preset', { on: profile.avatar === `preset:${i + 1}` }]"
            @click="saveAvatar(`preset:${i + 1}`)"
          >
            <UserAvatar :user="{ avatar: `preset:${i + 1}` }" :size="40" />
          </button>
          <button class="upload" :disabled="uploading" @click="avatarInput.click()">
            {{ uploading ? '上传中…' : '📷 上传本地图片' }}
          </button>
          <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden @change="uploadAvatar" />
        </div>

        <!-- 学习统计 -->
        <div class="stats">
          <div><b>{{ profile.loginCount }}</b>登录次数</div>
          <div><b>{{ profile.noteCount }}</b>笔记</div>
          <div><b>{{ profile.mistakeCount }}</b>错题</div>
          <div><b>{{ profile.clearedCount }}</b>通关</div>
        </div>
        <button class="wall-btn" @click="showWall = true">🏅 查看我的勋章墙</button>
        <MedalWall v-if="showWall" @close="showWall = false" />

        <!-- 改昵称 -->
        <!-- 背景主题：点一下就换，整个网站的背景马上跟着变 -->
        <h4>背景主题</h4>
        <div class="themes">
          <button
            v-for="b in BACKGROUNDS"
            :key="b.id"
            :class="['theme', { on: theme.bg === b.id }]"
            :title="b.desc"
            @click="theme.setBg(b.id)"
          >{{ b.name }}</button>
        </div>

        <h4>修改昵称</h4>
        <form class="row" @submit.prevent="saveNickname">
          <input v-model="nickname" maxlength="12" />
          <button>保存</button>
        </form>

        <!-- 改密码 -->
        <h4>修改密码</h4>
        <form class="col" @submit.prevent="savePassword">
          <input v-model="oldPwd" type="password" placeholder="旧密码" />
          <input v-model="newPwd" type="password" placeholder="新密码（至少 6 位）" />
          <button>修改密码</button>
        </form>

        <p v-if="msg" :class="msg.ok ? 'ok' : 'error'">{{ msg.text }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.6);
}
.card {
  width: 380px; max-height: 88vh; overflow-y: auto;
  padding: 20px 24px; border-radius: 14px;
  background: #11151f; color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
header { display: flex; justify-content: space-between; align-items: center; font-size: 17px; }
.close { border: none; background: none; color: #9ca3af; font-size: 18px; cursor: pointer; }
.hint { color: #9ca3af; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.info { flex: 1; display: grid; grid-template-columns: 80px 1fr; gap: 8px; margin: 16px 0; font-size: 14px; }
.my-avatar { position: relative; margin-top: 10px; padding: 0; border: none; background: none; cursor: pointer; border-radius: 50%; }
.my-avatar :deep(.avatar) { border: 2px solid var(--accent); box-shadow: 0 0 18px rgba(0, 240, 255, 0.45); }
/* 鼠标移上去，头像下半部分出现「更换」 */
.change {
  position: absolute; left: 0; right: 0; bottom: 0; height: 40%; border-radius: 0 0 42px 42px;
  display: flex; align-items: center; justify-content: center; font-size: 12px; color: #fff;
  background: rgba(0, 0, 0, 0.55); opacity: 0; transition: opacity 0.2s;
}
.my-avatar:hover .change { opacity: 1; }
.picker {
  display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; padding: 10px; margin-bottom: 12px;
  border: 1px dashed var(--line-strong); background: rgba(0, 240, 255, 0.04);
}
.preset { padding: 2px; border: 2px solid transparent; border-radius: 50%; background: none; cursor: pointer; display: flex; justify-content: center; }
.preset:hover { border-color: var(--line-strong); }
.preset.on { border-color: var(--accent); }
.upload {
  grid-column: 1 / -1; margin-top: 6px; padding: 8px; cursor: pointer; font-size: 13px;
  color: var(--text); background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line-strong);
}
.upload:hover { border-color: var(--accent); }
.info dt { color: #9ca3af; }
.info dd { margin: 0; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; font-size: 12px; color: #9ca3af; }
.stats div { padding: 10px 0; border-radius: 8px; background: rgba(255, 255, 255, 0.05); }
.wall-btn { width: 100%; margin-top: 10px; padding: 8px; cursor: pointer; font-size: 13px; color: var(--gold); background: rgba(252, 238, 10, 0.06); border: 1px solid rgba(252, 238, 10, 0.4); }
.wall-btn:hover { background: rgba(252, 238, 10, 0.14); }
.stats b { display: block; font-size: 20px; color: #fff; }
h4 { margin: 20px 0 8px; font-size: 14px; }
.row { display: flex; gap: 8px; }
.col { display: flex; flex-direction: column; gap: 8px; }
input {
  flex: 1; padding: 9px 12px; border-radius: 8px; font-size: 14px; outline: none;
  border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.3); color: #fff;
}
input:focus { border-color: #3be3ff; }
form button {
  padding: 9px 16px; border: none; border-radius: 8px; cursor: pointer;
  background: #ff3b4a; color: #fff; font-weight: bold;
}
.ok { color: #4ade80; font-size: 14px; }
.error { color: #ff8a93; font-size: 14px; }
.themes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.theme {
  padding: 8px 4px; border-radius: 8px; cursor: pointer; font-size: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.04); color: #e5e7eb;
  transition: all 0.2s;
}
.theme:hover { border-color: rgba(0, 240, 255, 0.7); }
.theme.on { border-color: #00f0ff; background: rgba(0, 240, 255, 0.15); color: #fff; }
</style>
