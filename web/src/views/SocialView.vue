<script setup>
// 情报站：审计员之间交流的地方，分三栏
//   聊天：和好友私聊、建讨论组一起讨论题目，可以互相传文件（ChatRoom.vue）
//   好友圈：发动态、点赞、评论（MomentsFeed.vue）
//   好友：按账号加好友、处理好友申请、好友列表
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '../stores/user.js'
import ChatRoom from '../components/ChatRoom.vue'
import MomentsFeed from '../components/MomentsFeed.vue'
import UserAvatar from '../components/UserAvatar.vue'

const userStore = useUserStore()
const tab = ref('chat')
const rooms = ref([])
const friends = ref([])
const requests = ref([])
const currentId = ref(null)
const current = computed(() => rooms.value.find((r) => r.id === currentId.value))
const totalUnread = computed(() => rooms.value.reduce((n, r) => n + (currentId.value === r.id ? 0 : r.unread), 0))
const error = ref('')

async function loadRooms() {
  rooms.value = await userStore.api('/api/social/rooms')
}
async function loadFriends() {
  ;[friends.value, requests.value] = await Promise.all([
    userStore.api('/api/social/friends'),
    userStore.api('/api/social/requests'),
  ])
}

// 聊天列表和好友申请每 4 秒刷新一次：有新消息、新申请时，红点会自己冒出来
let timer
onMounted(() => {
  loadRooms()
  loadFriends()
  timer = setInterval(() => {
    loadRooms().catch(() => {})
    loadFriends().catch(() => {})
  }, 4000)
})
onUnmounted(() => clearInterval(timer))

async function act(fn) {
  error.value = ''
  try {
    return await fn()
  } catch (e) {
    error.value = e.message
  }
}

// ===== 好友 =====
const account = ref('')
const found = ref(null)
const tip = ref('')
const search = () =>
  act(async () => {
    tip.value = ''
    found.value = null
    found.value = await userStore.api(`/api/social/search?account=${encodeURIComponent(account.value.trim())}`)
  })
const addFriend = () =>
  act(async () => {
    tip.value = (await userStore.api('/api/social/friends', { account: found.value.account })).message
    found.value = null
    account.value = ''
    loadFriends()
  })
const respond = (r, accept) =>
  act(async () => {
    await userStore.api(`/api/social/requests/${r.id}`, { accept }, 'PUT')
    loadFriends()
  })
const removeFriend = (f) =>
  confirm(`删除好友「${f.nickname}」？`) &&
  act(async () => {
    await userStore.api(`/api/social/friends/${f.userId}`, null, 'DELETE')
    loadFriends()
  })
// 点「私聊」：打开（或新建）和他的聊天室，跳到聊天栏
const chatWith = (f) =>
  act(async () => {
    const { roomId } = await userStore.api('/api/social/rooms/dm', { friendId: f.userId })
    await loadRooms()
    currentId.value = roomId
    tab.value = 'chat'
  })

// ===== 新建讨论组 =====
const showNew = ref(false)
const groupName = ref('')
const groupMembers = ref([])
const createGroup = () =>
  act(async () => {
    const { roomId } = await userStore.api('/api/social/rooms/group', { name: groupName.value, memberIds: groupMembers.value })
    showNew.value = false
    groupName.value = ''
    groupMembers.value = []
    await loadRooms()
    currentId.value = roomId
  })

async function onLeft() {
  currentId.value = null
  await loadRooms()
}
</script>

<template>
  <div class="social">
    <div class="head">
      <div class="eyebrow">Intel Hub</div>
      <h2>情报站</h2>
      <nav class="tabs">
        <button :class="{ on: tab === 'chat' }" @click="tab = 'chat'">
          聊天 <i v-if="totalUnread" class="dot">{{ totalUnread }}</i>
        </button>
        <button :class="{ on: tab === 'moments' }" @click="tab = 'moments'">好友圈</button>
        <button :class="{ on: tab === 'friends' }" @click="tab = 'friends'">
          好友 <i v-if="requests.length" class="dot">{{ requests.length }}</i>
        </button>
      </nav>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <!-- 聊天：左边聊天列表，右边聊天窗口 -->
    <div v-if="tab === 'chat'" class="chat glass">
      <aside>
        <button class="btn primary new" @click="showNew = !showNew">+ 新建讨论组</button>
        <form v-if="showNew" class="new-group" @submit.prevent="createGroup">
          <input v-model="groupName" class="input" maxlength="20" placeholder="讨论组名字，例如：重入攻击研究小组" />
          <label v-for="f in friends" :key="f.userId">
            <input type="checkbox" :value="f.userId" v-model="groupMembers" /> {{ f.nickname }}
          </label>
          <div v-if="!friends.length" class="faint">先去「好友」里加几个好友吧</div>
          <button class="btn">创建</button>
        </form>

        <div v-if="!rooms.length" class="faint pad">还没有聊天。到「好友」里点「私聊」，或者建一个讨论组</div>
        <button
          v-for="r in rooms"
          :key="r.id"
          :class="['room-item', { on: r.id === currentId }]"
          @click="currentId = r.id"
        >
          <UserAvatar v-if="r.type === 'dm' && r.peer" :user="r.peer" :size="34" />
          <span v-else class="room-icon">#</span>
          <span class="room-text">
            <b>{{ r.name }}</b>
            <small>{{ r.last ? (r.type === 'group' ? r.last.from + '：' : '') + r.last.text : '暂无消息' }}</small>
          </span>
          <i v-if="r.unread && r.id !== currentId" class="dot">{{ r.unread }}</i>
        </button>
      </aside>
      <ChatRoom v-if="current" :room="current" :friends="friends" @changed="loadRooms" @left="onLeft" />
      <div v-else class="placeholder">选一个聊天开始讨论</div>
    </div>

    <MomentsFeed v-else-if="tab === 'moments'" />

    <!-- 好友 -->
    <div v-else class="friends">
      <section class="glass box">
        <h4>添加好友</h4>
        <form class="row" @submit.prevent="search">
          <input v-model="account" class="input" placeholder="输入对方的账号" />
          <button class="btn">搜索</button>
        </form>
        <div v-if="found" class="person">
          <UserAvatar :user="found" :size="34" />
          <span>{{ found.nickname }}<small>（{{ found.account }}）</small></span>
          <button v-if="found.relation === 'none'" class="btn primary" @click="addFriend">加好友</button>
          <span v-else class="faint">{{ { self: '这是你自己', friend: '已经是好友', pending: '已发送申请' }[found.relation] }}</span>
        </div>
        <div v-if="tip" class="ok">{{ tip }}</div>
      </section>

      <section v-if="requests.length" class="glass box">
        <h4>好友申请</h4>
        <div v-for="r in requests" :key="r.id" class="person">
          <UserAvatar :user="r.from" :size="34" />
          <span>{{ r.from.nickname }}<small>（{{ r.from.account }}）</small></span>
          <button class="btn primary" @click="respond(r, true)">同意</button>
          <button class="btn" @click="respond(r, false)">拒绝</button>
        </div>
      </section>

      <section class="glass box">
        <h4>我的好友（{{ friends.length }}）</h4>
        <div v-if="!friends.length" class="faint">还没有好友，用上面的搜索框加一个吧</div>
        <div v-for="f in friends" :key="f.userId" class="person">
          <UserAvatar :user="f" :size="34" />
          <span>{{ f.nickname }}<small>（{{ f.account }}）</small></span>
          <button class="btn primary" @click="chatWith(f)">私聊</button>
          <button class="btn danger" @click="removeFriend(f)">删除</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.social { max-width: 1100px; margin: 0 auto; color: var(--text); }
.head { text-align: center; margin-bottom: 18px; }
.head h2 { margin: 6px 0 14px; font-size: 30px; font-weight: 300; letter-spacing: 10px; color: #fff; }
.tabs { display: inline-flex; gap: 6px; }
.tabs button {
  position: relative; padding: 7px 22px; cursor: pointer; font-size: 14px; letter-spacing: 2px;
  color: var(--text-dim); background: rgba(255, 255, 255, 0.03); border: 1px solid var(--line);
}
.tabs button:hover { color: #fff; }
.tabs button.on { color: #05020f; font-weight: 600; border-color: transparent; background: linear-gradient(90deg, var(--accent-strong), var(--accent)); }
/* 红点：未读数 / 新申请数 */
.dot {
  display: inline-block; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  font-style: normal; font-size: 11px; line-height: 18px; text-align: center; color: #fff; background: var(--accent-strong);
}
.error { text-align: center; color: var(--danger); font-size: 13px; margin-bottom: 10px; }
.faint { color: var(--text-faint); font-size: 13px; }
.pad { padding: 10px 4px; }
.ok { margin-top: 8px; color: var(--ok); font-size: 13px; }

/* ===== 聊天 ===== */
.chat { display: grid; grid-template-columns: 270px 1fr; height: calc(100vh - 240px); min-height: 420px; overflow: hidden; }
aside { border-right: 1px solid var(--line); overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
.new { width: 100%; margin-bottom: 6px; }
.new-group { display: flex; flex-direction: column; gap: 8px; padding: 10px; margin-bottom: 6px; border: 1px dashed var(--line-strong); font-size: 13px; }
.room-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 10px; cursor: pointer; text-align: left;
  background: none; border: 1px solid transparent; color: var(--text); font-family: var(--font);
}
.room-item:hover { background: rgba(0, 240, 255, 0.05); }
.room-item.on { background: rgba(0, 240, 255, 0.1); border-color: var(--line-strong); }
.room-icon {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--line-strong); color: #fff; font-size: 14px; background: rgba(0, 240, 255, 0.08);
}
.room-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.room-text b { font-size: 14px; font-weight: 500; color: #fff; }
.room-text small { font-size: 12px; color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.placeholder { display: flex; align-items: center; justify-content: center; color: var(--text-faint); font-size: 14px; }

/* ===== 好友 ===== */
.friends { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; padding-bottom: 30px; }
.box { padding: 16px 20px; }
.box h4 { margin: 0 0 12px; color: var(--accent); font-weight: normal; letter-spacing: 2px; }
.row { display: flex; gap: 10px; align-items: center; }
.row .btn { flex-shrink: 0; white-space: nowrap; }
.person { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 14px; }
.person:last-child { border-bottom: none; }
.person > span:nth-child(2) { flex: 1; }
.person small { color: var(--text-faint); margin-left: 4px; }
.person .btn { padding: 5px 14px; font-size: 12px; }
</style>
