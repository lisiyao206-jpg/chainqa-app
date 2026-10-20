<script setup lang="ts">
// 个人资料弹窗：看自己的信息和学习统计，改昵称、改密码
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import MedalWall from './MedalWall.vue'
import FeedbackModal from './FeedbackModal.vue'
import UserAvatar from './UserAvatar.vue'
import { PRESET_AVATARS } from '../data/avatars'
import { uploadFile } from '../utils/files'
import { copyText } from '../utils/clipboard'
import { useSmsCode } from '../utils/smsCode'
import type { Role } from '../types'

interface Profile {
  account: string
  nickname: string
  role: Role
  avatar?: string | null
  phone: string | null    // 绑定的手机号（中间 4 位打了星号）
  registerTime: string
  loginCount: number
  noteCount: number
  mistakeCount: number
  clearedCount: number
}

const emit = defineEmits(['close'])
const userStore = useUserStore()

const profile = ref<Profile | null>(null)
const nickname = ref('')
const oldPwd = ref('')
const newPwd = ref('')
// 操作结果提示：{ ok: true/false, text }
const msg = ref<{ ok: boolean; text: string } | null>(null)
const showWall = ref(false) // 勋章墙开关
const showFeedback = ref(false) // 意见反馈开关
const unread = ref(0)           // 管理员回复了、我还没看的反馈数

onMounted(async () => {
  profile.value = await userStore.api<Profile>('/api/profile')
  userStore.api('/api/feedback/unread').then((d: { n: number }) => (unread.value = d.n)).catch(() => {})
  nickname.value = profile.value!.nickname
})

async function saveNickname() {
  try {
    await userStore.api('/api/profile', { nickname: nickname.value }, 'PUT')
    // 公告板里的昵称也要改，顶栏头像上的字才会跟着变
    userStore.user!.nickname = nickname.value.trim()
    msg.value = { ok: true, text: '昵称已保存' }
  } catch (err) {
    msg.value = { ok: false, text: (err as Error).message }
  }
}

// ===== 头像 =====
const showPicker = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

async function saveAvatar(avatar: string) {
  try {
    await userStore.api('/api/avatar', { avatar }, 'PUT')
    // 公告板和档案里的头像一起改，顶栏、聊天里的头像马上跟着变
    userStore.user!.avatar = profile.value!.avatar = avatar
    showPicker.value = false
    msg.value = { ok: true, text: '头像已更换' }
  } catch (err) {
    msg.value = { ok: false, text: (err as Error).message }
  }
}

// 把图片裁成正中间的正方形，再缩小到 256×256：
// 头像是圆的，正方形放进去刚好；缩小后文件只有几十 KB，加载快
function cropSquare(file: File) {
  return new Promise<File>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 256
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
      URL.revokeObjectURL(img.src)
      canvas.toBlob((blob) => resolve(new File([blob!], 'avatar.png', { type: 'image/png' })), 'image/png')
    }
    img.onerror = () => reject(new Error('这张图片打不开，换一张试试'))
    img.src = URL.createObjectURL(file)
  })
}

async function uploadAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files![0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return (msg.value = { ok: false, text: '请选择图片文件' })
  uploading.value = true
  try {
    const f = await uploadFile(await cropSquare(file))
    await saveAvatar('file:' + f.id)
  } catch (err) {
    msg.value = { ok: false, text: (err as Error).message }
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
    msg.value = { ok: false, text: (err as Error).message }
  }
}

// 复制账号（登录要用）
const accCopied = ref(false)
async function copyAccount() {
  await copyText(profile.value!.account)
  accCopied.value = true
  setTimeout(() => (accCopied.value = false), 1500)
}

// 绑定手机号
const binding = ref(false)
const newPhone = ref('')
const bindCode = ref('')
const bindMsg = ref<{ ok: boolean; text: string } | null>(null)
const bindSms = useSmsCode('bind')
async function sendBindCode() {
  bindMsg.value = null
  try {
    await bindSms.send(newPhone.value)
  } catch (err) {
    bindMsg.value = { ok: false, text: (err as Error).message }
  }
}
async function bindPhone() {
  bindMsg.value = null
  try {
    const r = await userStore.api<{ phone: string }>('/api/phone', { phone: newPhone.value, code: bindCode.value }, 'PUT')
    profile.value!.phone = r.phone
    binding.value = false
    newPhone.value = bindCode.value = ''
  } catch (err) {
    bindMsg.value = { ok: false, text: (err as Error).message }
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
            <dt>昵称</dt><dd>{{ profile.nickname }}</dd>
            <!-- 账号放在昵称下面，随时能看到、一键复制，防止忘记 -->
            <dt>账号</dt>
            <dd class="acc">
              <b>{{ profile.account }}</b>
              <button class="copy" type="button" @click="copyAccount">{{ accCopied ? '已复制' : '复制' }}</button>
            </dd>
            <!-- 手机号：绑定后可以用「手机号 + 密码」或「手机号 + 验证码」登录 -->
            <dt>手机号</dt>
            <dd class="acc">
              <span :class="{ dim: !profile.phone }">{{ profile.phone || '未绑定' }}</span>
              <button class="copy" type="button" @click="binding = !binding">{{ profile.phone ? '更换' : '绑定' }}</button>
            </dd>
            <dt>身份</dt><dd>{{ profile.role === 'admin' ? '管理员' : '审计员' }}</dd>
            <dt>入职时间</dt><dd>{{ profile.registerTime.slice(0, 10) }}</dd>
          </dl>
          <button class="my-avatar" title="更换头像" @click="showPicker = !showPicker">
            <UserAvatar :user="profile" :size="84" />
            <span class="change">更换</span>
          </button>
        </div>

        <!-- 绑定 / 更换手机号：先收验证码，证明手机号是你的 -->
        <form v-if="binding" class="bind" @submit.prevent="bindPhone">
          <input v-model="newPhone" placeholder="手机号" maxlength="11" inputmode="numeric" />
          <span class="bind-code">
            <input v-model="bindCode" placeholder="验证码" maxlength="6" inputmode="numeric" />
            <button type="button" :disabled="bindSms.countdown.value > 0 || bindSms.sending.value" @click="sendBindCode">
              {{ bindSms.countdown.value > 0 ? `${bindSms.countdown.value} 秒` : '获取验证码' }}
            </button>
          </span>
          <button class="primary-btn">确认绑定</button>
          <div v-if="bindSms.demoCode.value" class="demo">演示模式（不真发短信）：验证码是 {{ bindSms.demoCode.value }}</div>
          <div v-if="bindMsg" :class="bindMsg.ok ? 'ok' : 'error'">{{ bindMsg.text }}</div>
        </form>

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
          <button class="upload" :disabled="uploading" @click="avatarInput!.click()">
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
        <button class="fb-btn" @click="showFeedback = true; unread = 0">
          💬 意见反馈 <i v-if="unread" class="dot">{{ unread }} 条新回复</i>
        </button>
        <FeedbackModal v-if="showFeedback" @close="showFeedback = false" />

        <!-- 背景主题已经挪到大厅左下角 -->
        <!-- 改昵称 -->
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
.fb-btn { width: 100%; margin-top: 8px; padding: 8px; cursor: pointer; font-size: 13px; color: var(--accent); background: rgba(0, 240, 255, 0.06); border: 1px solid var(--line-strong); }
.fb-btn:hover { background: rgba(0, 240, 255, 0.14); }
.fb-btn .dot { font-style: normal; margin-left: 6px; padding: 0 8px; border-radius: 9px; color: #fff; background: var(--accent-strong); font-size: 11px; }
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
.acc { display: flex; align-items: center; gap: 8px; }
.acc b { font-family: var(--font-code); letter-spacing: 2px; color: var(--gold); }
.copy { padding: 1px 8px; font-size: 11px; cursor: pointer; color: var(--text-dim); background: none; border: 1px solid var(--line-strong); border-radius: 999px; }
.copy:hover { color: #fff; border-color: var(--accent); }
.acc .dim { color: var(--text-faint); }
.bind { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 14px; padding: 12px; border: 1px solid var(--line); background: rgba(0, 240, 255, 0.04); }
.bind input { flex: 1 1 130px; min-width: 0; padding: 7px 10px; font-size: 13px; color: var(--text); background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line-strong); outline: none; }
.bind-code { flex: 1 1 200px; display: flex; gap: 6px; }
.bind-code button, .primary-btn { flex-shrink: 0; white-space: nowrap; padding: 7px 12px; font-size: 13px; cursor: pointer; color: var(--text); background: none; border: 1px solid var(--line-strong); }
.bind-code button:disabled { opacity: 0.5; cursor: default; }
.primary-btn { color: #05020f; font-weight: 600; border: none; background: linear-gradient(90deg, var(--accent-strong), var(--accent)); }
.bind .demo { width: 100%; font-size: 12px; color: var(--gold); }
.bind .ok, .bind .error { width: 100%; }
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  .card { width: min(380px, 94vw); }
}
</style>
