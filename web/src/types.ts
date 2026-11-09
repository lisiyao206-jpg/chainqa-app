// types.ts —— 前后端共用的数据「形状」
// TypeScript 的好处：写错字段名（比如把 nickname 写成 nickName）时，编辑器当场标红，不用等运行才发现

export type Role = 'admin' | 'teacher' | 'user' // user 是学生

export interface User {
  userId: number
  account: string
  nickname: string
  role: Role
  avatar?: string | null
  lastLogin?: string | null
  createTime?: string
}

export interface LoginResult {
  token: string
  user: User
}

export interface Note {
  id: number
  chapterId?: string | null
  title: string
  content: string
  updatedAt: string
}

export type MistakeStatus = 'todo' | 'mastered'
export interface Mistake {
  id: number
  question: string
  answer: string
  status: MistakeStatus
  source: 'manual' | 'game' | string
  wrongCount?: number // 这道题错了几次
}

// 教材里的一章
export interface Chapter {
  id: string
  no: number | string
  title: string
  [key: string]: any
}

// 实战关卡里的怪兽
export interface Monster {
  name: string
  emoji: string
  color: string
  fx: string
  attacks: string[]
}

export interface FixOption {
  code: string[]    // 换上去的代码（每行一个字符串）
  correct: boolean
  why: string
}

export interface Level {
  id: number
  title: string
  type: string
  difficulty: number
  chapter: string
  story: string
  code: string[]      // 合约代码，每行一个字符串
  bugLines: number[]  // 有漏洞的行号（从 1 开始）
  hints: string[]
  explanation: string
  monster: Monster
  fix: { lines: [number, number]; options: FixOption[] }
  // 变种挑战的题带这几个字段（后端 AI 出的变种题）
  variantId?: number    // 变种题自身 id（当作进度 key 用）
  variantNo?: number    // 这一关的第几道变种
  isVariant?: boolean   // 是否 AI 出的变种题
  baseLevel?: number    // 基于哪一关（1~5）
}

// 规则扫描 / AI 审计发现的问题
export interface Finding {
  swc: string
  title: string
  line: number
  severity: string
  detail?: string
  [key: string]: any
}

// RAG 引用的资料
export interface Source {
  file: string
  heading: string
  score: number
}

// 情报站：上传的文件
export interface FileInfo {
  id: number
  name: string
  size: number
  mime?: string
  url?: string
  [key: string]: any
}

export type Pulse = { kind: 'hurt' | 'win' | string; id: number }

// 学习报告（ReportPanel 显示；/api/report 和老师查看学生报告都返回这个形状）
export interface KpScore {
  id: string; name: string; group: string
  done: number; total: number; mistakes: number; mastery: number
  state: 'untouched' | 'weak' | 'learning' | 'mastered'
}
export interface Report {
  summary: {
    chaptersDone: number; chaptersTotal: number; levelsDone: number; levelsTotal: number
    mistakesOpen: number; mistakesMastered: number; notes: number
  }
  kps: KpScore[]
  next: { kind: string; id: string; title: string; track: string; path: string; query: Record<string, string>; reason: string }[]
}
