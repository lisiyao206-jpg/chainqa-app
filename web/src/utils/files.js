// utils/files.js —— 上传、下载文件的小工具（情报站的聊天和好友圈都用它）
// 文件不能用 userStore.api 发：api 只会发 JSON，而文件是「二进制」，要原样发过去
import { useUserStore } from '../stores/user.js'

// 和后端一样：普通文件 10MB，视频（mp4 / webm）50MB
const MAX_SIZE = 10 * 1024 * 1024
const MAX_VIDEO_SIZE = 50 * 1024 * 1024
export const isVideoName = (name) => /\.(mp4|webm)$/i.test(name)

// 上传：成功后返回 { id, name, size, isImage }，把 id 放进消息或动态里发出去
export async function uploadFile(file) {
  if (isVideoName(file.name) ? file.size > MAX_VIDEO_SIZE : file.size > MAX_SIZE)
    throw new Error(isVideoName(file.name) ? '视频不能超过 50MB' : '文件不能超过 10MB')
  const res = await fetch('/api/social/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${useUserStore().token}`,
      // 文件名可能有中文，请求头里只能放英文，所以先编码
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || '上传失败')
  return data
}

// 下载：要带着登录凭证，所以不能直接用 <a href>，先 fetch 成 Blob，再交给浏览器
// 返回一个临时网址（blob:...），图片可以直接放进 <img>，用完要 URL.revokeObjectURL 释放
export async function fileURL(id) {
  const res = await fetch(`/api/social/files/${id}`, {
    headers: { Authorization: `Bearer ${useUserStore().token}` },
  })
  if (!res.ok) throw new Error('文件不存在或没有权限')
  return URL.createObjectURL(await res.blob())
}

export async function downloadFile(file) {
  const url = await fileURL(file.id)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// 1536 → 1.5 KB
export function prettySize(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
}
