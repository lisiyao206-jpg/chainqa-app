// data/avatars.js —— 系统提供的 6 个头像
// 美术同学设计好后，把图片命名成 avatar-1.png ~ avatar-6.png，放进 web/public/avatars/ 文件夹，就会自动显示
// 图片还没放进来时，先用 emoji + 渐变色代替（emoji 和颜色可以随便改）
export const PRESET_AVATARS = [
  { src: '/avatars/avatar-1.png', emoji: '🦊', color: 'linear-gradient(135deg, #ff2bd6, #7b2bff)' },
  { src: '/avatars/avatar-2.png', emoji: '🤖', color: 'linear-gradient(135deg, #00f0ff, #2b6bff)' },
  { src: '/avatars/avatar-3.png', emoji: '🐱', color: 'linear-gradient(135deg, #fcee0a, #ff7a2b)' },
  { src: '/avatars/avatar-4.png', emoji: '👾', color: 'linear-gradient(135deg, #8ee6c4, #00a3ff)' },
  { src: '/avatars/avatar-5.png', emoji: '🦉', color: 'linear-gradient(135deg, #b18cff, #ff2bd6)' },
  { src: '/avatars/avatar-6.png', emoji: '🐉', color: 'linear-gradient(135deg, #ff6b81, #fcee0a)' },
]
