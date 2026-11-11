// utils/autoFrame.ts —— 给全站的面板边框自动加上「流动的代码」
// 做法：盯着页面的变化（MutationObserver），一出现符合条件的面板，就往里面放一个 CodeFrame 组件
// 哪些面板会加：
//   class="glass" 的面板、写了 data-frame 的元素，以及下面 EXTRA 里列出的几种面板
// 哪些不加：
//   写了 data-noframe 的；太小的（按钮、输入框）；自己会滚动的（代码会跟着内容一起滚走）；已经有代码边框的
import { h, render } from 'vue'
import CodeFrame from '../components/CodeFrame.vue'

const EXTRA = ['.archive .editor', '.archive .card', '.pane', '.block', '.fb', '.class-page .main', '.class-page .side']
const SELECTOR = ['.glass', '[data-frame]', ...EXTRA].join(', ')
const MIN_W = 160
const MIN_H = 80
const SPEED = 45 // 代码流动的速度：每秒走多少像素，大小面板看起来一样快

// 每个面板随机分到一段代码，免得全站转的都是同一句
const SNIPPETS = [
  'pragma solidity ^0.8.0; contract Vault { address public owner; mapping(address => uint256) public balanceOf; modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; } }',
  'function withdraw(uint256 amount) external { require(balanceOf[msg.sender] >= amount); balanceOf[msg.sender] -= amount; (bool ok, ) = msg.sender.call{value: amount}(""); require(ok); }',
  'event Transfer(address indexed from, address indexed to, uint256 value); function transfer(address to, uint256 v) public returns (bool) { _balances[msg.sender] -= v; _balances[to] += v; emit Transfer(msg.sender, to, v); return true; }',
  'bool private locked; modifier nonReentrant() { require(!locked, "reentrant"); locked = true; _; locked = false; }',
  'bytes32 hash = keccak256(abi.encodePacked(to, amount, nonce)); address signer = ecrecover(hash, v, r, s); require(signer == owner && !used[hash]); used[hash] = true;',
  'contract Ledger { struct Block { uint256 index; bytes32 prevHash; bytes32 dataHash; uint256 timestamp; } Block[] public chain; }',
]
const pick = () => SNIPPETS[Math.floor(Math.random() * SNIPPETS.length)]

function eligible(el: HTMLElement) {
  if (el.closest('[data-noframe]')) return false
  if ([...el.children].some((c) => c.classList.contains('cf-host') || c.classList.contains('code-frame'))) return false
  const r = el.getBoundingClientRect()
  if (r.width < MIN_W || r.height < MIN_H) return false
  const cs = getComputedStyle(el)
  if (/(auto|scroll)/.test(cs.overflowY) || cs.display === 'none') return false
  return true
}

function attach(el: HTMLElement) {
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
  const r = el.getBoundingClientRect()
  const host = document.createElement('div')
  host.className = 'cf-host'
  el.appendChild(host)
  render(h(CodeFrame, { text: pick(), chamfer: 0, size: 9, inset: 6, duration: Math.max(20, (2 * (r.width + r.height)) / SPEED) }), host)
}

function scan() {
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => eligible(el) && attach(el))
}

// 面板被移除时，把里面的 CodeFrame 也卸载掉（停止它的尺寸监听）
function cleanup(nodes: NodeList) {
  nodes.forEach((n) => {
    if (!(n instanceof HTMLElement)) return
    const hosts = n.classList.contains('cf-host') ? [n] : [...n.querySelectorAll<HTMLElement>('.cf-host')]
    hosts.forEach((host) => render(null, host))
  })
}

export function startAutoFrame() {
  let queued = false
  const schedule = () => {
    if (queued) return
    queued = true
    // 等页面这一轮更新完、量得到尺寸了再扫描
    requestAnimationFrame(() => setTimeout(() => ((queued = false), scan()), 60))
  }
  new MutationObserver((list) => {
    // 只是 CodeFrame 自己在变（文字流动、尺寸变化）的话不用重新扫描
    if (list.every((m) => (m.target as HTMLElement).closest?.('.cf-host'))) return
    list.forEach((m) => cleanup(m.removedNodes))
    schedule()
  }).observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', schedule)
  schedule()
}
