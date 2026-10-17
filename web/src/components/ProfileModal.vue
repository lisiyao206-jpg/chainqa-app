<script setup>
// 个人资料弹窗：看自己的信息和学习统计，改昵称、改密码
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user.js'
import { useThemeStore, BACKGROUNDS } from '../stores/theme.js'
import MedalWall from './MedalWall.vue'

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
        <!-- 基本信息 -->
        <dl class="info">
          <dt>账号</dt><dd>{{ profile.account }}</dd>
          <dt>身份</dt><dd>{{ profile.role === 'admin' ? '管理员' : '审计员' }}</dd>
          <dt>入职时间</dt><dd>{{ profile.registerTime.slice(0, 10) }}</dd>
        </dl>

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
.info { display: grid; grid-template-columns: 80px 1fr; gap: 8px; margin: 16px 0; font-size: 14px; }
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
