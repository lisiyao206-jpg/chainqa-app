// utils/clipboard.js —— 复制、粘贴的小工具（聊天、广场、好友圈都用它）

// 复制文字到剪贴板
// navigator.clipboard 只能在 https 或 localhost 下用；用 http 打开时（比如局域网 IP）它不存在，
// 就退回老办法：放进一个看不见的输入框，选中后执行「复制」
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const box = document.createElement('textarea')
    box.value = text
    box.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(box)
    box.select()
    document.execCommand('copy')
    box.remove()
  }
}

// 粘贴时取出里面的文件（比如截图后直接 Ctrl + V）。没有文件就返回 null，让浏览器照常粘贴文字
export function fileFromPaste(e) {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file')
  const file = item?.getAsFile()
  if (!file) return null
  // 截图粘贴进来的图片没有名字（或者都叫 image.png），按时间起个名字，方便区分
  if (!file.name || file.name === 'image.png') {
    const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    return new File([file], `截图-${new Date().toLocaleString('zh-CN').replace(/[/: ]/g, '')}.${ext}`, { type: file.type })
  }
  return file
}
