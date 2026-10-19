// stores/theme.js —— 背景主题的「公告板」：现在用哪个动态背景
// 用户在「我的档案」里选，选好的存在浏览器里，下次打开还是这个
import { defineStore } from 'pinia'

const KEY = 'chainqa-bg'

// 所有可选的背景：id 对应 App.vue 里的组件，desc 是给用户看的说明
export const BACKGROUNDS = [
  { id: 'galaxy', name: '螺旋星系', desc: '3D 十五万颗粒子的螺旋星系，区块沿旋臂运行' },
  { id: 'chain', name: '链上星河', desc: '3D 水晶区块链 + 星云，梦幻' },
  { id: 'butterfly', name: '粒子蝴蝶', desc: '蝴蝶聚拢又散成星尘' },
]

export const useThemeStore = defineStore('theme', {
  state: () => ({
    // 没选过就用链上星河；存的 id 已经不存在了（比如彩虹丝绸、流沙已经删掉了），也回到默认
    bg: BACKGROUNDS.some((b) => b.id === localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'chain',
    // 背景的「情绪」：让背景跟着游戏一起变（CyberOverlay.vue 负责画出来）
    mood: null,  // 当前笼罩全屏的颜色，比如进入战斗时是这只怪兽的颜色；null 表示没有
    pulse: null, // 一次性的闪光：{ kind: 'hurt' 被反击时红光一闪 / 'win' 打败怪兽时光芒扩散, id }
  }),
  actions: {
    setMood(color) {
      this.mood = color
    },
    flash(kind) {
      this.pulse = { kind, id: Date.now() } // id 每次都不一样，连续两次同样的闪光也能重新播放
    },
    setBg(id) {
      this.bg = id
      localStorage.setItem(KEY, id)
    },
  },
})
