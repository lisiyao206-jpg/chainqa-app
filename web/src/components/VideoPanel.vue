<template>
  <div class="video-card">
    <div class="vc-header"> 视频讲解</div>

    <!-- 播放器 -->
    <div v-if="activeVideo" class="player">
      <div class="player-bar">
        <span class="now-playing">{{ activeVideo.title }}</span>
        <button class="close-btn" @click="activeVideo = null">✕</button>
      </div>
      <div class="iframe-wrap">
        <iframe
          :src="getPlayerUrl(activeVideo)"
          scrolling="no"
          border="0"
          frameborder="no"
          framespacing="0"
          allowfullscreen="true"
          sandbox="allow-top-navigation allow-scripts allow-same-origin allow-popups"
        ></iframe>
      </div>
    </div>

    <!-- 推荐视频列表 -->
    <div class="vc-body">
      <div v-if="recommendedVideos.length > 0" class="rec-list">
        <div
          v-for="vid in recommendedVideos"
          :key="vid.bvid + (vid.page || '')"
          class="rec-item"
          :class="{ playing: isPlaying(vid) }"
          @click="play(vid)"
        >
          <div class="rec-icon">{{ isPlaying(vid) ? '⏸' : '▶' }}</div>
          <div class="rec-info">
            <div class="rec-title">{{ vid.title }}</div>
            <div class="rec-meta">{{ vid.author }} · {{ vid.duration }}</div>
          </div>
        </div>
      </div>

      <!-- 搜索 -->
      <div class="search-area">
        <div class="search-row">
          <input
            v-model="searchQuery"
            placeholder="搜索 B站视频…"
            @keyup.enter="doSearch"
          />
          <button @click="doSearch" :disabled="!searchQuery.trim()">搜索</button>
        </div>
      </div>

      <!-- 搜索结果 -->
      <div v-if="searchResults.length > 0" class="rec-list">
        <div
          v-for="item in searchResults"
          :key="item.bvid"
          class="rec-item"
          :class="{ playing: activeVideo?.bvid === item.bvid }"
          @click="play(item)"
        >
          <div class="rec-icon">{{ activeVideo?.bvid === item.bvid ? '⏸' : '▶' }}</div>
          <div class="rec-info">
            <div class="rec-title">{{ item.title }}</div>
            <div class="rec-meta">{{ item.author }} · {{ item.duration }}</div>
          </div>
        </div>
      </div>
      <div v-else-if="searched && searchResults.length === 0" class="empty">
        站内没搜到结果（B站有时会拦截搜索），可以点下面直接去 B站搜「{{ searchQuery.trim() }}」
      </div>

      <div class="bili-link">
        <a :href="biliSearchUrl" target="_blank" rel="noopener">去 B站看更多 →</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useUserStore } from '../stores/user'

interface VideoItem {
  bvid: string
  title: string
  author: string
  duration: string
  page?: number   // 合集视频的第几集（不填就是第 1 集）
  cover?: string
}

interface SearchResult {
  bvid: string
  title: string
  author: string
  duration: string
  cover: string
}

const props = defineProps<{
  chapterId: string
  chapterTitle: string
  chapterNo?: string | number
}>()

const activeVideo = ref<VideoItem | null>(null)
const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searched = ref(false)

// 各章节推荐视频：均为 B 站上的真实视频，通过 B 站官方播放器嵌入播放（不下载、不转存），版权归原作者
// 每章一个通俗短视频 + 北京大学肖臻老师《区块链技术与应用》公开课的对应一集（page 是公开课第几集）
// 2026-10-28 逐个打开核对过标题、作者和时长；以后要换视频，记得也先点开确认
const XIAO = { bvid: 'BV1Vt411X7JF', author: '北京大学肖臻 · 公开课' }
const chapterVideos: Record<string, VideoItem[]> = {
  P01: [
    { bvid: 'BV1J7411Z7T9', title: '6分钟，用人话讲清楚区块链', author: '裹小脚的大叔', duration: '6:00' },
    { bvid: 'BV14E411v7eS', title: '程序员来讲讲什么是区块链（小白也能听懂）', author: '是落拓呀', duration: '10:22' },
  ],
  P02: [
    { bvid: 'BV1aa411U7ag', title: '哈希函数是什么？为什么 Hash 是区块链最基础的函数', author: 'BuidlerDAO-Web3', duration: '10:02' },
    { ...XIAO, page: 3, title: '北大公开课 第3讲：比特币的数据结构（哈希指针、默克尔树）', duration: '37:35' },
  ],
  P03: [
    { bvid: 'BV1jE411H7xU', title: '私钥和公钥是什么？数字签名什么原理？', author: 'lifeform233', duration: '8:37' },
    { ...XIAO, page: 2, title: '北大公开课 第2讲：密码学原理（哈希与签名）', duration: '34:42' },
  ],
  P04: [
    { bvid: 'BV1iJ411D7nb', title: '程序员带你理解哈希函数和工作量证明机制', author: '是落拓呀', duration: '10:47' },
    { ...XIAO, page: 4, title: '北大公开课 第4讲：比特币的共识协议', duration: '1:27:34' },
  ],
  P05: [
    { bvid: 'BV14u41117qC', title: '公链、私链、联盟链……傻傻分不清楚？看这篇就够了', author: '云说区块链', duration: '5:47' },
    { bvid: 'BV12x411R7d5', title: '探访联盟链底层技术平台 FISCO BCOS', author: '烦立停', duration: '20:57' },
    { ...XIAO, page: 14, title: '北大公开课 第14讲：以太坊概述', duration: '14:47' },
  ],
  P06: [
    { bvid: 'BV1c64y1k7r7', title: '什么是智能合约？', author: '区块链新说', duration: '4:17' },
    { bvid: 'BV1wK411f7Vn', title: '智能合约到底有多智能？Solidity 又是什么？', author: '设计师Omega', duration: '6:18' },
    { ...XIAO, page: 22, title: '北大公开课 第22讲：以太坊智能合约', duration: '2:17:06' },
  ],
  P07: [
    { bvid: 'BV12X4y1c7pJ', title: '重入攻击｜藏在智能合约里的神秘漏洞', author: '创宇区块链安全实验室', duration: '2:44' },
    { ...XIAO, page: 23, title: '北大公开课 第23讲：The DAO 事件（重入攻击）', duration: '43:38' },
    { ...XIAO, page: 25, title: '北大公开课 第25讲：美链事件（整数溢出）', duration: '19:04' },
  ],
}

// 匹配章节编号 → 推荐视频
const recommendedVideos = computed(() => {
  // 1. chapterId 直接匹配
  if (chapterVideos[props.chapterId]) return chapterVideos[props.chapterId]
  // 2. 正则提取 P01
  const m = props.chapterId.match(/^([A-Z]\d{2})_/)
  if (m && chapterVideos[m[1]]) return chapterVideos[m[1]]
  // 3. chapterNo（支持 string 和 number）
  const no = typeof props.chapterNo === 'number'
    ? props.chapterNo
    : parseInt(String(props.chapterNo), 10)
  if (!isNaN(no) && no >= 1 && no <= 7) {
    const key = `P${String(no).padStart(2, '0')}`
    if (chapterVideos[key]) return chapterVideos[key]
  }
  // 4. chapterId 开头数字
  const n = props.chapterId.match(/^(\d{1,2})[_\-]/)
  if (n) {
    const num = parseInt(n[1], 10)
    const key = `P${String(num).padStart(2, '0')}`
    if (chapterVideos[key]) return chapterVideos[key]
  }
  return []
})

const biliSearchUrl = computed(() => {
  const kw = searchQuery.value.trim() || props.chapterTitle
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(kw)}`
})

watch(searchQuery, () => {
  searched.value = false
  searchResults.value = []
})

function getPlayerUrl(v: VideoItem): string {
  return `https://player.bilibili.com/player.html?bvid=${v.bvid}&p=${v.page || 1}&high_quality=1&danmaku=0&autoplay=1`
}

function play(vid: VideoItem) {
  activeVideo.value = vid
}

// 公开课的几集是同一个 BV 号，所以还要比较是第几集
function isPlaying(vid: VideoItem) {
  return activeVideo.value?.bvid === vid.bvid && (activeVideo.value?.page || 1) === (vid.page || 1)
}

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const userStore = useUserStore()

// 站内搜索：后端代为请求 B站；搜不到或被 B站拦截时，提示用户点「去 B站看更多」
async function doSearch() {
  const kw = searchQuery.value.trim()
  if (!kw) return
  searchResults.value = []
  try {
    const data = await userStore.api(`/api/bilibili/search?keyword=${encodeURIComponent(kw)}`)
    if (Array.isArray(data)) {
      searchResults.value = data.map((item: any) => ({
        bvid: item.bvid,
        title: item.title,
        author: item.author,
        duration: item.duration ? formatDuration(item.duration) : '',
        cover: item.cover || '',
      }))
    }
  } catch {
    // 失败时不自动弹新窗口（浏览器会拦截），交给下面的提示
  }
  searched.value = true
}
</script>

<style scoped>
/* ===== 视频卡片（始终可见，紧凑简洁） ===== */
.video-card {
  border: 1px solid var(--line, rgba(255,255,255,0.1));
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
  margin-bottom: 20px;
}

.vc-header {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text, #e0e8f0);
  background: rgba(0, 240, 255, 0.04);
  border-bottom: 1px solid var(--line, rgba(255,255,255,0.06));
}

/* 播放器 */
.player {
  border-bottom: 1px solid var(--line, rgba(255,255,255,0.06));
}
.player-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: rgba(0, 240, 255, 0.06);
}
.now-playing {
  font-size: 12px;
  color: var(--accent, #00f0ff);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 32px);
}
.close-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.close-btn:hover { color: #fff; background: rgba(255,0,0,0.3); }

.iframe-wrap {
  position: relative;
  width: 100%;
  padding-bottom: 56.25%;
}
.iframe-wrap iframe {
  position: absolute;
  top: 0; left: 0;
  width: 100%;
  height: 100%;
}

/* 主体 */
.vc-body {
  padding: 12px 16px 14px;
}

/* 推荐/搜索结果列表 */
.rec-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.rec-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}
.rec-item:hover {
  background: rgba(0, 240, 255, 0.06);
}
.rec-item.playing {
  background: rgba(0, 240, 255, 0.1);
  border: 1px solid rgba(0, 240, 255, 0.2);
}

.rec-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 240, 255, 0.12);
  font-size: 12px;
  flex-shrink: 0;
}
.rec-item.playing .rec-icon {
  background: rgba(0, 240, 255, 0.25);
  color: var(--accent, #00f0ff);
}

.rec-info {
  flex: 1;
  min-width: 0;
}
.rec-title {
  font-size: 13px;
  color: var(--text, #e0e8f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rec-meta {
  font-size: 11px;
  color: var(--text-faint, rgba(255,255,255,0.4));
  margin-top: 2px;
}

/* 搜索 */
.search-area {
  margin-bottom: 8px;
}
.search-row {
  display: flex;
  gap: 6px;
}
.search-row input {
  flex: 1;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--line, rgba(255,255,255,0.1));
  background: rgba(0, 0, 0, 0.3);
  color: var(--text, #e0e8f0);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}
.search-row input:focus {
  border-color: rgba(0, 240, 255, 0.4);
}
.search-row input::placeholder {
  color: rgba(255,255,255,0.3);
}
.search-row button {
  padding: 7px 16px;
  border-radius: 8px;
  border: 1px solid rgba(0, 240, 255, 0.3);
  background: rgba(0, 240, 255, 0.1);
  color: var(--accent, #00f0ff);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.search-row button:hover:not(:disabled) {
  background: rgba(0, 240, 255, 0.2);
}
.search-row button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty {
  color: var(--text-faint, rgba(255,255,255,0.4));
  font-size: 12px;
  text-align: center;
  padding: 8px 0;
}

.bili-link {
  text-align: center;
  margin-top: 4px;
}
.bili-link a {
  font-size: 12px;
  color: rgba(0, 240, 255, 0.5);
  text-decoration: none;
}
.bili-link a:hover { color: var(--accent, #00f0ff); }
</style>
