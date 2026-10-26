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
          :src="getPlayerUrl(activeVideo.bvid)"
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
          :key="vid.bvid"
          class="rec-item"
          :class="{ playing: activeVideo?.bvid === vid.bvid }"
          @click="play(vid)"
        >
          <div class="rec-icon">{{ activeVideo?.bvid === vid.bvid ? '⏸' : '▶' }}</div>
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
        没找到，试试别的关键词
      </div>

      <div class="bili-link">
        <a :href="biliSearchUrl" target="_blank" rel="noopener">去 B站看更多 →</a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface VideoItem {
  bvid: string
  title: string
  author: string
  duration: string
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

// 各章节推荐视频（BV号占位，替换为实际视频）
const chapterVideos: Record<string, VideoItem[]> = {
  P01: [
    { bvid: 'BV1FW4y157uJ', title: '区块链技术原理动画讲解', author: '区块链科普', duration: '8:32' },
    { bvid: 'BV1Sv411r7q4', title: '5分钟搞懂区块链是什么', author: '区块链小白', duration: '5:15' },
    { bvid: 'BV1xU4y1H7Xs', title: '区块链入门科普：分布式账本', author: '科技说', duration: '10:45' },
  ],
  P02: [
    { bvid: 'BV1Ab4y1Q7Cv', title: '区块链中的哈希函数详解', author: '加密学院', duration: '12:08' },
    { bvid: 'BV1dS4y1b7wH', title: '区块结构与挖矿原理动画', author: '区块链学堂', duration: '9:22' },
  ],
  P03: [
    { bvid: 'BV1QK4y1A7Jz', title: '非对称加密与数字签名通俗讲解', author: '密码学科普', duration: '11:30' },
    { bvid: 'BV1hN4y1K7mX', title: '区块链私钥公钥地址的关系', author: '链上学院', duration: '7:45' },
  ],
  P04: [
    { bvid: 'BV1jT4y1X7Fq', title: '区块链共识机制：PoW与PoS', author: '区块链学堂', duration: '13:20' },
    { bvid: 'BV1M44y1H7Gn', title: 'Gas机制是什么？以太坊Gas详解', author: '以太坊百科', duration: '8:55' },
  ],
  P05: [
    { bvid: 'BV1Yb4y137vE', title: '公链vs联盟链，区别在哪？', author: '链上观察', duration: '10:15' },
    { bvid: 'BV1FS4y1G7Rw', title: 'FISCO BCOS 联盟链入门', author: '微众区块链', duration: '14:02' },
  ],
  P06: [
    { bvid: 'BV1rh411R7XE', title: '智能合约是什么？自动售货机比喻', author: 'Solidity教程', duration: '9:40' },
    { bvid: 'BV1gK4y1m7Lp', title: 'Solidity智能合约入门教程', author: 'WTF Academy', duration: '15:30' },
  ],
  P07: [
    { bvid: 'BV1vE411S7cP', title: 'The DAO事件：智能合约安全的警钟', author: '区块链安全', duration: '12:50' },
    { bvid: 'BV1pN411d7sY', title: '智能合约常见漏洞与防范', author: '安全学院', duration: '16:20' },
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

function getPlayerUrl(bvid: string): string {
  return `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&danmaku=0&autoplay=1`
}

function play(vid: VideoItem) {
  activeVideo.value = vid
}

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

async function doSearch() {
  const kw = searchQuery.value.trim()
  if (!kw) return
  searched.value = true
  searchResults.value = []
  try {
    const resp = await fetch(`/api/bilibili/search?keyword=${encodeURIComponent(kw)}`)
    const data = await resp.json()
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
    window.open(biliSearchUrl.value, '_blank')
  }
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
