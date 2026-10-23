<script setup lang="ts">
// 登录 / 注册页：和大厅一样的极简排版，背景用 App.vue 里全站共用的紫色流动色彩
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useThemeStore, BACKGROUNDS } from '../stores/theme'
import { copyText } from '../utils/clipboard'
import { useSmsCode } from '../utils/smsCode'

const userStore = useUserStore()
const router = useRouter()
// 背景主题：登录页也能直接换，和「我的档案」里是同一个设置
const theme = useThemeStore()

const mode = ref('login')   // 'login' 登录 / 'register' 注册
const account = ref('')
const pwd = ref('')
const nickname = ref('')
const pwd2 = ref('')        // 注册时再输一次密码
const newAccount = ref('')  // 注册成功后系统分配的账号
const copied = ref(false)
const error = ref('')
const loading = ref(false)

// 登录方式：'pwd' 账号 / 手机号 + 密码，'sms' 手机号 + 验证码
const loginWay = ref<'pwd' | 'sms'>('pwd')
const phone = ref('')
const code = ref('')
const sms = useSmsCode('login')
const smsEnabled = ref(false) // 后端没开验证码登录（.env 没写 SMS_MODE）就不显示这一栏
onMounted(async () => {
  try {
    smsEnabled.value = (await userStore.api<{ enabled: boolean }>('/api/sms/status')).enabled
  } catch {}
})
async function getCode() {
  error.value = ''
  try {
    await sms.send(phone.value)
  } catch (err) {
    error.value = (err as Error).message
  }
}

// 账号是系统分配的数字（老用户是字母、数字、下划线）；填了中文多半是把昵称当成了账号，提前提醒
const accountHint = computed(() => {
  if (!account.value || /^[A-Za-z0-9_]*$/.test(account.value)) return ''
  return '请填 6 位数字账号或手机号：你填的可能是昵称'
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'login') {
      if (loginWay.value === 'sms') await userStore.loginBySms(phone.value, code.value)
      else await userStore.login(account.value, pwd.value) // 账号或手机号都行
      router.push('/') // 成功后进入大厅
    } else {
      if (pwd.value !== pwd2.value) throw new Error('两次输入的密码不一样')
      // 注册成功：先停在这里，把分配到的账号大字显示出来，记下了再进大厅
      newAccount.value = await userStore.register(pwd.value, nickname.value)
    }
  } catch (err) {
    error.value = (err as Error).message
  }
  loading.value = false
}

async function copyAccount() {
  await copyText(newAccount.value)
  copied.value = true
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
      <p>从零认识区块链，一步步成长为智能合约安全审计员</p>
      <!-- 学习路线：四步，从「区块链是什么」一路走到「审计真实合约」 -->
      <ol class="route">
        <li><span>01</span><b>预备营</b>认识区块链：区块、哈希、私钥、交易、共识</li>
        <li><span>02</span><b>训练营</b>学 Solidity 与合约漏洞，学完一章打一场防御战</li>
        <li><span>03</span><b>实战任务</b>和漏洞怪兽对战：找出漏洞，选对修法</li>
        <li><span>04</span><b>AI 审计</b>用审计 Agent 检查真实合约，问题直通对应知识点</li>
      </ol>
      <p class="aside">全程有 <b>白帽导师</b> 答疑（每句话都标注教材出处），笔记和错题存进 <b>案件档案</b>，在 <b>情报站</b> 和其他审计员交流</p>
    </section>

    <!-- 右边：登录 / 注册 -->
    <form class="box glass" @submit.prevent="submit">
      <div class="eyebrow">{{ mode === 'login' ? 'Sign in' : 'Join us' }}</div>
      <h2>{{ mode === 'login' ? '欢迎回来，审计员' : '加入链上安全局' }}</h2>
      <!-- 登录：账号 + 密码。注册：只填昵称和密码，账号由系统分配 6 位数字（官方发号，不会重复） -->
      <!-- 登录方式切换：密码登录 / 验证码登录 -->
      <div v-if="mode === 'login' && smsEnabled" class="ways">
        <button type="button" :class="{ on: loginWay === 'pwd' }" @click="loginWay = 'pwd'; error = ''">密码登录</button>
        <button type="button" :class="{ on: loginWay === 'sms' }" @click="loginWay = 'sms'; error = ''">验证码登录</button>
      </div>
      <template v-if="mode === 'login' && loginWay === 'sms'">
        <label class="field">
          <span class="label">手机号</span>
          <input v-model="phone" class="input" placeholder="已绑定的手机号" maxlength="11" inputmode="numeric" autocomplete="tel" />
        </label>
        <label class="field">
          <span class="label">验证码</span>
          <span class="code-row">
            <input v-model="code" class="input" placeholder="6 位验证码" maxlength="6" inputmode="numeric" autocomplete="one-time-code" />
            <button type="button" class="btn get-code" :disabled="sms.countdown.value > 0 || sms.sending.value" @click="getCode">
              {{ sms.countdown.value > 0 ? `${sms.countdown.value} 秒后重发` : '获取验证码' }}
            </button>
          </span>
          <span v-if="sms.demoCode.value" class="field-tip">演示模式（不真发短信）：验证码是 {{ sms.demoCode.value }}</span>
        </label>
      </template>
      <label v-else-if="mode === 'login'" class="field">
        <span class="label">账号 / 手机号</span>
        <input v-model="account" class="input" placeholder="6 位数字账号或手机号" autocomplete="username" />
        <span v-if="accountHint" class="field-tip">{{ accountHint }}</span>
      </label>
      <label v-else class="field">
        <span class="label">昵称</span>
        <input v-model="nickname" class="input" placeholder="你的昵称" maxlength="12" />
      </label>
      <label v-if="!(mode === 'login' && loginWay === 'sms')" class="field">
        <span class="label">密码</span>
        <input v-model="pwd" class="input" type="password" placeholder="密码（至少 6 位）" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" />
      </label>
      <label v-if="mode === 'register'" class="field">
        <span class="label">确认密码</span>
        <input v-model="pwd2" class="input" type="password" placeholder="再输一次密码" autocomplete="new-password" />
      </label>
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

    <!-- 注册成功：大字显示系统分配的账号 -->
    <div v-if="newAccount" class="mask">
      <div class="issued glass">
        <div class="eyebrow">Your agent ID</div>
        <h3>🎉 注册成功，这是你的审计员编号</h3>
        <div class="acc-no">{{ newAccount }}</div>
        <p>以后用这个 <b>6 位数字账号</b> + 密码登录。<br />请截图或记下来；登录后在「我的档案」里也能看到。</p>
        <div class="issued-actions">
          <button class="btn" type="button" @click="copyAccount">{{ copied ? '✅ 已复制' : '📋 复制账号' }}</button>
          <button class="btn primary" type="button" @click="router.push('/')">记好了，进入大厅 →</button>
        </div>
      </div>
    </div>
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
.route { list-style: none; padding: 0; margin: 36px 0 0; font-size: 16px; line-height: 2.3; color: var(--text-dim); }
.route li span { display: inline-block; width: 40px; color: var(--text-faint); }
.route li b { display: inline-block; min-width: 88px; font-weight: 500; color: #fff; }
.intro .aside { margin-top: 22px; max-width: 520px; font-size: 14px; line-height: 1.8; letter-spacing: 1px; color: var(--text-faint); }
.intro .aside b { font-weight: 500; color: var(--accent); }

/* 右边登录框 */
.box { width: 420px; padding: 40px 38px; display: flex; flex-direction: column; gap: 20px; }
.box :deep(.input), .box .input { font-size: 16px; padding: 12px 2px; }
.intro .eyebrow, .box .eyebrow { font-size: 13px; }
.box h2 { margin: -8px 0 6px; font-size: 28px; font-weight: 300; letter-spacing: 3px; color: #fff; }
.ways { display: flex; gap: 22px; margin-top: -4px; }
.ways button {
  position: relative; padding: 0 0 6px; border: none; background: none; cursor: pointer;
  font-family: var(--font); font-size: 15px; letter-spacing: 1px; color: var(--text-dim);
}
.ways button.on { color: #fff; }
.ways button.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--accent); box-shadow: 0 0 8px var(--accent); }
.code-row { display: flex; align-items: flex-end; gap: 10px; }
.code-row .input { flex: 1; min-width: 0; }
.get-code { flex-shrink: 0; white-space: nowrap; padding: 7px 14px; font-size: 13px; }
.field { display: flex; flex-direction: column; gap: 2px; }
.label { font-size: 14px; letter-spacing: 1px; color: #fff; }
.field-tip { margin-top: 4px; font-size: 13px; color: var(--gold); }
/* 注册成功弹窗 */
.mask { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.7); }
.issued { width: min(440px, 92vw); padding: 32px 30px; text-align: center; background: rgba(8, 4, 22, 0.97); border: 1px solid var(--line-strong); }
.issued h3 { margin: 10px 0 18px; font-size: 20px; font-weight: 400; color: #fff; }
.acc-no {
  font-family: var(--font-code); font-size: 54px; letter-spacing: 14px; text-indent: 14px; color: #fff;
  text-shadow: 0 0 20px var(--accent), 0 0 44px rgba(255, 43, 214, 0.5); animation: pop-in 0.6s ease-out;
}
@keyframes pop-in { from { transform: scale(0.6); opacity: 0; } }
.issued p { margin: 18px 0 22px; font-size: 14px; line-height: 1.8; color: var(--text-dim); }
.issued p b { color: var(--gold); }
.issued-actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
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
  /* 手机：上面是标题和学习路线，下面是登录框，整页可以上下滑 */
  .login-page { height: auto; min-height: 100vh; flex-direction: column; justify-content: flex-start; gap: 24px; padding: 64px 4vw 80px; }
  .brand { top: 18px; left: 18px; }
  .intro { width: 100%; }
  .intro h1 { font-size: 30px; letter-spacing: 3px; margin: 10px 0 8px; }
  .intro p { font-size: 14px; letter-spacing: 1px; }
  .route { margin-top: 16px; font-size: 13px; line-height: 1.9; }
  .route li span { width: 26px; }
  .route li b { min-width: 64px; }
  .intro .aside { font-size: 12px; margin-top: 12px; }
  .box { width: 100%; padding: 26px 20px; }
  .themes { position: static; flex-wrap: wrap; gap: 14px; font-size: 13px; }
}
</style>
