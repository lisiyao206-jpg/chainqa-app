// stores/theme.js —— 背景主题的「公告板」：现在用哪个动态背景
// 用户在「我的档案」里选，选好的存在浏览器里，下次打开还是这个
import { defineStore } from 'pinia'

const KEY = 'chainqa-bg'

// 所有可选的背景：id 对应 App.vue 里的组件，desc 是给用户看的说明
export const BACKGROUNDS = [
  { id: 'silk', name: '彩虹丝绸', desc: '流动的彩色光带，明亮柔和' },
  { id: 'galaxy', name: '螺旋星系', desc: '3D 十五万颗粒子的螺旋星系，区块沿旋臂运行' },
  { id: 'chain', name: '链上星河', desc: '3D 水晶区块链 + 星云，梦幻' },
  { id: 'ocean', name: '数据海洋', desc: '3D 光点海浪 + 赛博落日' },
  { id: 'butterfly', name: '粒子蝴蝶', desc: '蝴蝶聚拢又散成星尘' },
  { id: 'sand', name: '流沙', desc: '红金色沙绸，沙字随风飘散' },
]

export const useThemeStore = defineStore('theme', {
  state: () => ({
    // 没选过就用彩虹丝绸；存的 id 已经不存在了（比如删掉了某个背景），也回到默认
    bg: BACKGROUNDS.some((b) => b.id === localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'silk',
  }),
  actions: {
    setBg(id) {
      this.bg = id
      localStorage.setItem(KEY, id)
    },
  },
})
