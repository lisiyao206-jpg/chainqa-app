<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user.js'

const userStore = useUserStore()
const router = useRouter()

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
    error.value = err.message
  }
  loading.value = false
}
</script>

<template>
  <div class="login-page">
    <!-- 左边：产品介绍（以后换成封面插画） -->
    <section class="intro">
      <h1>链上安全局</h1>
      <p class="slogan">边读、边问、边破案，学会区块链</p>
      <ul>
        <li>📖 训练营：读教材，选中就能问 AI</li>
        <li>🧑‍💻 白帽导师：回答都标注教材出处</li>
        <li>🎯 实战任务：在合约里找出漏洞</li>
      </ul>
    </section>

    <!-- 右边：登录 / 注册框 -->
    <form class="box" @submit.prevent="submit">
      <h2>{{ mode === 'login' ? '欢迎回来，审计员' : '加入链上安全局' }}</h2>
      <input v-model="account" placeholder="账号（字母、数字、下划线）" autocomplete="username" />
      <input v-model="pwd" type="password" placeholder="密码（至少 6 位）" autocomplete="current-password" />
      <input v-if="mode === 'register'" v-model="nickname" placeholder="审计员代号（昵称）" />
      <div v-if="error" class="error">{{ error }}</div>
      <button class="primary" :disabled="loading">
        {{ loading ? '请稍候…' : mode === 'login' ? '登 录' : '注 册' }}
      </button>
      <p class="switch">
        <template v-if="mode === 'login'">还没有账号？<a @click="mode = 'register'; error = ''">去注册</a></template>
        <template v-else>已有账号？<a @click="mode = 'login'; error = ''">去登录</a></template>
      </p>
      <p class="privacy">我们会记录你的登录时间，仅用于学习数据统计。</p>
    </form>
  </div>
</template>

<style scoped>
.login-page {
  height: 100vh; display: flex; align-items: center; justify-content: center; gap: 80px;
  background: radial-gradient(circle at center, #10203a 0%, #07090f 70%);
  color: #e5e7eb;
}
.intro h1 { font-size: 44px; letter-spacing: 6px; color: #ff5a66; text-shadow: 0 0 14px rgba(255, 59, 74, 0.8); margin: 0; }
.slogan { font-size: 18px; color: #9ca3af; }
.intro ul { list-style: none; padding: 0; line-height: 2.2; }
.box {
  width: 340px; display: flex; flex-direction: column; gap: 12px;
  padding: 32px; border-radius: 14px;
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15);
}
.box h2 { margin: 0 0 8px; font-size: 20px; }
.box input {
  padding: 12px 14px; border-radius: 8px; font-size: 15px; outline: none;
  border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(0, 0, 0, 0.3); color: #fff;
}
.box input:focus { border-color: #3be3ff; }
.primary {
  padding: 12px; border: none; border-radius: 8px; cursor: pointer;
  background: #ff3b4a; color: #fff; font-size: 16px; font-weight: bold;
}
.primary:disabled { opacity: 0.5; }
.error { color: #ff8a93; font-size: 14px; }
.switch { text-align: center; font-size: 14px; color: #9ca3af; margin: 0; }
.switch a { color: #3be3ff; cursor: pointer; }
.privacy { font-size: 12px; color: #6b7280; text-align: center; margin: 0; }
</style>
