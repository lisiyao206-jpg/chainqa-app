// data/linkPolicy.ts —— 教材里的外部链接，哪些在国内能打开
// 2026-11-09 在腾讯云广州服务器上逐个实测了教材里全部 145 个外部链接（每个最多等 10 秒）：
//   能打开的网站：保留链接，在新标签页打开
//   打不开的网站（GitHub、以太坊官网、推特、维基百科等）：改成不能点的灰色文字，出处信息保留
//   本身已经失效的链接（网页返回 404）：改成文字，并注明「原链接已失效」
// 以后教材里出现新的网站，默认按「打不开」处理；实测能打开后再加进 OK_HOSTS

export const OK_HOSTS = new Set([
  // 国内网站
  'learnblockchain.cn', 'tool.chinaz.com', 'www.court.gov.cn', 'gongbao.court.gov.cn', 'www.gov.cn', 'space.bilibili.com', 'www.bilibili.com', 'gitee.com',
  // 实测能打开的国外网站
  'fisco-bcos-doc.readthedocs.io', 'fisco-bcos-documentation.readthedocs.io', 'solidity-cn.readthedocs.io',
  'docs.soliditylang.org', 'blog.soliditylang.org', 'rekt.news', 'book.getfoundry.sh', 'www.paradigm.xyz',
  'www.kingoftheether.com', 'www.4byte.directory', 'uniswapv3book.com', 'lab.miguelmota.com', 'jeiwan.net',
  'gnidan.github.io', 'forum.openzeppelin.com', 'f.hubspotusercontent40.net', 'dune.com',
  'vrf.chain.link', 'faucets.chain.link', 'docs.chain.link', 'abi.hashex.org',
])

// 已经失效的链接（网页不存在了）
export const DEAD_LINKS = new Set([
  'https://docs.soliditylang.org/zh/v0.8.19/index.html',
  'https://github.com/ethereum/solidity/issues/4635',
  'https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/finance/PaymentSplitter.sol',
  'https://github.com/transmissions11/solmate/blob/main/src/mixins/ERC4626.sol',
  'https://y1cunhui.github.io/uniswapV3-book-zh-cn/',
  'https://ave.ai/check',
  'https://www.protocol.com/fintech/coinbase-crypto-insider-trading',
])
