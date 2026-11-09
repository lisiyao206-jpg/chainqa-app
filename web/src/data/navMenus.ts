// data/navMenus.ts —— 顶栏的下拉菜单：大厅和其他页面的顶栏共用
// 鼠标移到这些导航上，下面展开分支；match 里的页面都算这个栏目（顶栏上它会亮起来）

// 顶栏导航的顺序：带下拉菜单的四个栏目放在一起，排在前面
export const NAV = [
  { to: '/learn', title: '学习中心' },
  { to: '/archive', title: '案件档案' },
  { to: '/mission', title: '实战任务' },
  { to: '/social', title: '情报站' },
  { to: '/class', title: '我的班级' },
  { to: '/report', title: '学习报告' },
  { to: '/mentor', title: '白帽导师' },
  { to: '/audit', title: 'AI 审计' },
]

export interface NavMenu {
  match: string[]
  subs: { to: string; title: string }[]
}

export const NAV_MENUS: Record<string, NavMenu> = {
  '/learn': {
    match: ['/learn', '/prep', '/camp', '/fisco', '/frontier'],
    subs: [
      { to: '/learn', title: '📚 全部路线' },
      { to: '/learn?track=basics', title: '01 区块链基础' },
      { to: '/learn?track=fisco', title: '02 联盟链实战' },
      { to: '/learn?track=dev', title: '03 智能合约开发' },
      { to: '/learn?track=security', title: '04 智能合约安全' },
      { to: '/learn?track=frontier', title: '05 应用与前沿' },
    ],
  },
  '/mission': {
    match: ['/mission', '/lab', '/playground'],
    subs: [
      { to: '/mission', title: '🐉 打怪' },
      { to: '/lab', title: '⛓ 链上实验场' },
      { to: '/playground', title: '🧪 合约练习场' },
    ],
  },
  '/archive': {
    match: ['/archive'],
    subs: [
      { to: '/archive', title: '📝 我的笔记' },
      { to: '/archive?open=mistakes', title: '📕 错题本' },
    ],
  },
  '/social': {
    match: ['/social'],
    subs: [
      { to: '/social?tab=square', title: '🏛 广场' },
      { to: '/social?tab=chat', title: '💬 聊天' },
      { to: '/social?tab=moments', title: '🌐 好友圈' },
      { to: '/social?tab=friends', title: '👥 好友' },
      { to: '/social?tab=folder', title: '📁 情报收集文件夹' },
    ],
  },
}
