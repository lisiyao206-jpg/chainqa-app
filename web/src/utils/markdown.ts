// utils/markdown.ts —— 把 AI 回答里的 Markdown 转成 HTML（AI 小助手、AI 审计报告共用）
// 只支持我们用得到的几种写法：代码块、行内代码、粗体、标题、列表、引用编号 [1]
// 先把 < > & 转义，再加上我们自己的标签：AI 输出里就算有 <script> 也只会显示成文字，不会被执行
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c])
}

export function renderMarkdown(md = '') {
  return md
    .split('```')
    .map((part, i) => {
      // 奇数段是代码块（``` 和 ``` 之间），第一行的语言名去掉
      if (i % 2 === 1) return `<pre><code>${escapeHtml(part.replace(/^[\w-]*\n/, ''))}</code></pre>`
      return escapeHtml(part)
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[(\d+)\]/g, '<span class="cite">$1</span>')
        .replace(/\n/g, '<br>')
        .replace(/<\/(h3|h4|li)><br>/g, '</$1>') // 标题、列表项后面不用再换行
    })
    .join('')
}
