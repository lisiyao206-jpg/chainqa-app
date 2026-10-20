// types.ts —— 前后端共用的数据「形状」
// TypeScript 的好处：写错字段名（比如把 nickname 写成 nickName）时，编辑器当场标红，不用等运行才发现

export type Role = 'admin' | 'user'

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
