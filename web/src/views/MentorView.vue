<script setup lang="ts">
// 白帽导师页：左边是 3D 的白帽导师机器人，右边是对话框
// 机器人和右下角悬浮按钮用的是同一个组件 MentorBot：AI 正在回答时会做「说话」的动作，并转过来正对用户
import { defineAsyncComponent } from 'vue'
import ChatPanel from '../components/ChatPanel.vue'
import { useAiStore } from '../stores/ai'

// three.js 比较大，按需加载
const MentorBot = defineAsyncComponent(() => import('../components/MentorBot.vue'))
const ai = useAiStore()

// 快捷问题：点一下就交给对话框发出去（ChatPanel 会监听 ai.pending）
const SAMPLES = ['什么是重入攻击？怎么防范？', 'tx.origin 和 msg.sender 有什么区别？', '为什么不能用 block.timestamp 生成随机数？']
</script>

<template>
  <div class="mentor">
    <!-- 左：白帽导师 -->
    <section class="stage">
      <div class="bot-wrap">
        <div class="platform"></div>
        <MentorBot class="bot" :active="ai.thinking" :thinking="ai.thinking" />
      </div>
      <div class="intro">
        <div class="eyebrow">White-hat Mentor</div>
        <h2>白帽导师 · GUIDE</h2>
        <p>{{ ai.thinking ? '正在翻阅教材，组织回答……' : '我只依据教材回答，每句话都会标出处；教材里没有的，我会直接告诉你。' }}</p>
      </div>
      <div class="samples">
        <span class="s-title">试试问我</span>
        <button v-for="q in SAMPLES" :key="q" :disabled="ai.thinking" @click="ai.pending = q">{{ q }}</button>
      </div>
    </section>

    <!-- 右：对话框 -->
    <section class="chat glass">
      <ChatPanel />
    </section>
  </div>
</template>

<style scoped>
.mentor {
  display: grid; grid-template-columns: minmax(300px, 2fr) 3fr; gap: 28px;
  max-width: 1280px; height: calc(100vh - 140px); margin: 0 auto;
}

/* ===== 左：机器人站在发光的圆形平台上 ===== */
.stage { display: flex; flex-direction: column; align-items: center; min-height: 0; }
.bot-wrap { position: relative; flex: 1; width: 100%; min-height: 0; }
.bot { position: absolute; inset: 0; }
.platform {
  position: absolute; left: 50%; bottom: 4%; width: 62%; aspect-ratio: 4 / 1; transform: translateX(-50%);
  border-radius: 50%; border: 1px solid rgba(0, 240, 255, 0.6);
  background: radial-gradient(ellipse, rgba(0, 240, 255, 0.35), rgba(0, 240, 255, 0.05) 60%, transparent 72%);
  box-shadow: 0 0 40px rgba(0, 240, 255, 0.35), inset 0 0 30px rgba(0, 240, 255, 0.25);
  animation: hum 3s ease-in-out infinite;
}
@keyframes hum { 50% { box-shadow: 0 0 60px rgba(0, 240, 255, 0.55), inset 0 0 40px rgba(0, 240, 255, 0.4); } }

.intro { text-align: center; margin-top: 6px; }
.intro h2 { margin: 6px 0 8px; font-size: 24px; font-weight: 300; letter-spacing: 6px; color: #fff; text-shadow: 0 0 16px rgba(0, 240, 255, 0.4); }
.intro p { margin: 0 auto; max-width: 340px; min-height: 44px; font-size: 13px; line-height: 1.7; color: var(--text-dim); }

.samples { display: flex; flex-direction: column; align-items: stretch; gap: 8px; width: 100%; max-width: 360px; margin: 14px 0 6px; }
.s-title { font-size: 12px; letter-spacing: 2px; color: var(--text-faint); text-align: center; }
.samples button {
  padding: 8px 14px; font-size: 13px; text-align: left; cursor: pointer;
  color: var(--text); background: rgba(0, 240, 255, 0.05); border: 1px solid var(--line); border-radius: var(--radius);
  font-family: var(--font); transition: all 0.25s;
}
.samples button:hover:not(:disabled) { border-color: var(--accent); background: rgba(0, 240, 255, 0.12); color: #fff; }
.samples button:disabled { opacity: 0.45; cursor: default; }

/* ===== 右：对话框 ===== */
.chat { min-height: 0; padding: 18px; background: var(--glass-strong); }

/* ===== 手机（屏幕窄于 760px）：机器人缩小放在上面，快捷问题收起 ===== */
@media (max-width: 760px) {
  .mentor { grid-template-columns: 1fr; grid-template-rows: 170px minmax(0, 1fr); gap: 10px; height: calc(100vh - 150px); }
  .stage { flex-direction: row; gap: 10px; }
  .bot-wrap { flex: 0 0 120px; height: 100%; }
  .intro { text-align: left; }
  .intro h2 { font-size: 18px; letter-spacing: 3px; }
  .samples { display: none; }
  .chat { padding: 12px; }
}
</style>
