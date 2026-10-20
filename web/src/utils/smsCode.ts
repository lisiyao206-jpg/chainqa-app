// utils/smsCode.ts —— 「获取验证码」按钮的小工具：发验证码 + 60 秒倒计时（登录页、我的档案都用它）
import { ref, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user'

export function useSmsCode(purpose: 'login' | 'bind') {
  const userStore = useUserStore()
  const countdown = ref(0)    // 还要等几秒才能再发；0 表示可以发
  const sending = ref(false)
  const demoCode = ref('')    // 演示模式：后端把验证码直接给网页显示
  let timer: ReturnType<typeof setInterval> | undefined

  async function send(phone: string) {
    if (countdown.value > 0 || sending.value) return
    sending.value = true
    try {
      const r = await userStore.api<{ seconds: number; demoCode?: string }>('/api/sms/send', { phone, purpose })
      demoCode.value = r.demoCode || ''
      countdown.value = r.seconds
      clearInterval(timer)
      timer = setInterval(() => {
        if (--countdown.value <= 0) clearInterval(timer)
      }, 1000)
    } finally {
      sending.value = false
    }
  }

  onUnmounted(() => clearInterval(timer))
  return { countdown, sending, demoCode, send }
}
