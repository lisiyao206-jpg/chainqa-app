/**
 * B站视频搜索代理
 *
 * 用途：前端直接请求 B站搜索 API 会被 CORS 拦截，
 * 通过后端代理转发请求，绕过跨域限制。
 *
 * 集成方式：
 * 1. 在 server.mjs 的路由分发中加入此模块
 * 2. 前端请求 /api/bilibili/search?keyword=区块链
 *
 * 不需要额外依赖，使用 node 内置 https 模块
 */

import https from 'node:https'

/**
 * 搜索B站视频
 * @param {string} keyword 搜索关键词
 * @param {number} page 页码，默认1
 * @param {number} pageSize 每页数量，默认10
 * @returns {Promise<Array>} 视频列表
 */
export async function searchBilibili(keyword, page = 1, pageSize = 10) {
  const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}&page=${page}&page_size=${pageSize}`

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        // 必须带 Referer，否则 B站返回 -403
        'Referer': 'https://www.bilibili.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.code === 0 && json.data?.result) {
            resolve(
              json.data.result
                .filter(item => item.bvid)
                .map(item => ({
                  bvid: item.bvid,
                  title: (item.title || '').replace(/<[^>]+>/g, ''), // 去除高亮标签
                  author: item.author || '',
                  duration: item.duration || 0,
                  cover: item.pic || '',
                  play: item.play || 0,
                  description: (item.description || '').slice(0, 100),
                }))
            )
          } else {
            resolve([])
          }
        } catch (e) {
          reject(new Error('解析B站搜索结果失败'))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(8000, () => {
      req.destroy()
      reject(new Error('B站搜索超时'))
    })
  })
}

/**
 * 获取视频详细信息（封面、标题等）
 * @param {string} bvid 视频的 BV 号
 * @returns {Promise<Object|null>}
 */
export async function getVideoInfo(bvid) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'Referer': 'https://www.bilibili.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.code === 0 && json.data) {
            const d = json.data
            resolve({
              bvid: d.bvid,
              title: d.title,
              cover: d.pic,
              duration: d.duration,
              author: d.owner?.name || '',
              description: d.desc || '',
              view: d.stat?.view || 0,
              danmaku: d.stat?.danmaku || 0,
            })
          } else {
            resolve(null)
          }
        } catch (e) {
          reject(new Error('解析视频信息失败'))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(8000, () => {
      req.destroy()
      reject(new Error('获取视频信息超时'))
    })
  })
}
