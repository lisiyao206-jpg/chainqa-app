<script setup lang="ts">
// 学习报告：我各个知识点掌握得怎么样、下一步学什么，还可以让白帽导师写学习建议
import { ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import ReportPanel from '../components/ReportPanel.vue'
import type { Report } from '../types'

const userStore = useUserStore()
const report = ref<Report | null>(null)
const error = ref('')

onMounted(async () => {
  try {
    report.value = await userStore.api<Report>('/api/report')
  } catch (err) {
    error.value = (err as Error).message
  }
})
</script>

<template>
  <div class="report-page">
    <header class="head">
      <div class="eyebrow">Learning Report</div>
      <h2>学习报告</h2>
      <p>根据你在学习中心、防御战、实战任务和错题本里的记录自动生成，学得越多越准确。</p>
    </header>
    <p v-if="error" class="error">{{ error }}</p>
    <ReportPanel v-if="report" :report="report" self />
  </div>
</template>

<style scoped>
.report-page { max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.head h2 { margin: 4px 0 6px; font-size: 28px; font-weight: 300; letter-spacing: 6px; color: #fff; }
.head p { margin: 0; font-size: 14px; color: var(--text-dim); }
.error { color: var(--danger); }
</style>
