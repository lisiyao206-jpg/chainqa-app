// data/swcLinks.js —— 漏洞编号（SWC）和「训练营章节」「实战任务关卡」的对应关系
// AI 审计找到某个漏洞后，用它生成「📖 去训练营学这一章」「🎮 去打这只怪练手」的传送门
// chapter 写章节编号的开头（例如 S01），训练营会打开以它开头的那一章；level 是实战任务的关卡编号
export const SWC_LINKS = {
  'SWC-101': { chapter: 'S05', level: 2 }, // 整数溢出 → 溢出刺球
  'SWC-104': { chapter: 'S13' },           // 没检查底层调用返回值
  'SWC-105': { chapter: 'S04', level: 1 }, // 未受保护的提款 → 权限窃贼
  'SWC-106': { chapter: 'S04' },           // 未受保护的 selfdestruct（也是权限问题）
  'SWC-107': { chapter: 'S01', level: 3 }, // 重入攻击 → 重入幽灵
  'SWC-112': { chapter: '23' },            // delegatecall
  'SWC-113': { chapter: 'S09' },           // 调用失败导致拒绝服务
  'SWC-114': { chapter: 'S11' },           // 抢跑
  'SWC-115': { chapter: 'S12', level: 4 }, // tx.origin → 钓鱼魅影
  'SWC-116': { chapter: 'S14' },           // 依赖区块时间
  'SWC-120': { chapter: 'S07', level: 5 }, // 坏随机数 → 预言巫师
  'SWC-121': { chapter: 'S06' },           // 签名重放
  'SWC-128': { chapter: 'S09' },           // gas 上限导致拒绝服务
}
