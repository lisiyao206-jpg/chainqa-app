<script setup lang="ts">
// 登录 / 注册页：和大厅一样的极简排版，背景用 App.vue 里全站共用的紫色流动色彩
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useThemeStore, BACKGROUNDS } from '../stores/theme'

const userStore = useUserStore()
const router = useRouter()
// 背景主题：登录页也能直接换，和「我的档案」里是同一个设置
const theme = useThemeStore()

const mode = ref('login')   // 'login' 登录 / 'register' 注册
const account = ref('')
const pwd = ref('')
const nickname = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'login') await userStore.login(account.value, pwd.value)
    else await userStore.register(account.value, pwd.value, nickname.value)
    router.push('/') // 成功后进入大厅
  } catch (err) {
    error.value = (err as Error).message
  }
  loading.value = false
}

function switchMode(m: string) {
  mode.value = m
  error.value = ''
}
</script>

<template>
  <div class="login-page">
    <!-- 左上角：品牌 -->
    <div class="brand">链上安全局</div>

    <!-- 左下角：背景主题，点一下马上换 -->
    <div class="themes">
      <span class="eyebrow">背景</span>
      <button
        v-for="b in BACKGROUNDS"
        :key="b.id"
        :class="['theme', { on: theme.bg === b.id }]"
        :title="b.desc"
        type="button"
        @click="theme.setBg(b.id)"
      >{{ b.name }}</button>
    </div>

    <!-- 左边：一句话介绍 -->
    <section class="intro">
      <div class="eyebrow">On-chain Security Bureau</div>
      <h1>边读、边问、边破案</h1>
      <p>一个带 AI 导师的智能合约安全学习平台</p>
      <ul>
        <li><span>01</span>训练营 · 读教材，选中就能问 AI</li>
        <li><span>02</span>白帽导师 · 回答都标注教材出处</li>
        <li><span>03</span>实战任务 · 在合约里找出漏洞</li>
      </ul>
    </section>

    <!-- 右边：登录 / 注册 -->
    <form class="box glass" @submit.prevent="submit">
      <div class="eyebrow">{{ mode === 'login' ? 'Sign in' : 'Join us' }}</div>
      <h2>{{ mode === 'login' ? '欢迎回来，审计员' : '加入链上安全局' }}</h2>
      <input v-model="account" class="input" placeholder="账号（字母、数字、下划线）" autocomplete="username" />
      <input v-model="pwd" class="input" type="password" placeholder="密码（至少 6 位）" autocomplete="current-password" />
      <input v-if="mode === 'register'" v-model="nickname" class="input" placeholder="审计员代号（昵称）" />
      <div v-if="error" class="error">{{ error }}</div>
      <button class="btn primary submit" :disabled="loading">
        {{ loading ? '请稍候…' : mode === 'login' ? '登 录' : '注 册' }}
      </button>
      <p class="switch">
        <template v-if="mode === 'login'">还没有账号？<a @click="switchMode('register')">去注册</a></template>
        <template v-else>已有账号？<a @click="switchMode('login')">去登录</a></template>
      </p>
      <p class="privacy">我们会记录你的登录时间，仅用于学习数据统计。</p>
    </form>
  </div>
</template>

<style scoped>
.login-page {
  position: relative; height: 100vh;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 10%;
  font-weight: 300;
}
.brand { position: absolute; top: 24px; left: 40px; font-size: 18px; letter-spacing: 3px; color: #fff; }

/* 左边介绍 */
.intro h1 { margin: 16px 0 14px; font-size: 56px; font-weight: 200; letter-spacing: 8px; color: #fff; }
.intro p { margin: 0; font-size: 18px; letter-spacing: 2px; color: var(--text-dim); }
.intro ul { list-style: none; padding: 0; margin: 44px 0 0; font-size: 17px; line-height: 2.4; color: var(--text-dim); }
.intro li span { display: inline-block; width: 40px; color: var(--text-faint); }

/* 右边登录框 */
.box { width: 420px; padding: 40px 38px; display: flex; flex-direction: column; gap: 20px; }
.box :deep(.input), .box .input { font-size: 16px; padding: 12px 2px; }
.intro .eyebrow, .box .eyebrow { font-size: 13px; }
.box h2 { margin: -8px 0 6px; font-size: 28px; font-weight: 300; letter-spacing: 3px; color: #fff; }
.submit { margin-top: 8px; padding: 14px; font-size: 17px; letter-spacing: 4px; }
.error { color: var(--danger); font-size: 15px; }
.switch { margin: 0; text-align: center; font-size: 15px; color: var(--text-dim); }
.switch a { color: var(--accent); cursor: pointer; }
.privacy { margin: 0; text-align: center; font-size: 13px; color: var(--text-faint); }

/* 左下角的背景切换：小字按钮，选中的那个亮起来、下面一个小圆点 */
.themes { position: absolute; left: 40px; bottom: 30px; display: flex; align-items: center; gap: 22px; font-size: 15px; }
.theme {
  position: relative; padding: 0; border: none; background: none; cursor: pointer;
  font-family: var(--font); font-size: 15px; letter-spacing: 1px; color: var(--text-dim); transition: color 0.3s;
}
.theme:hover, .theme.on { color: #fff; }
.theme.on::after {
  content: ''; position: absolute; left: 50%; bottom: -8px; width: 4px; height: 4px; margin-left: -2px;
  border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px var(--accent);
}
/* ===== 手机（屏幕窄于 760px） ===== */
@media (max-width: 760px) {
  .box { width: min(420px, 92vw); padding: 30px 22px; }
}
</style>
