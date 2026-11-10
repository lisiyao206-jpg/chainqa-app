# 同一份合约换一条链：FISCO BCOS 上的时间戳

## 这一章要做什么

训练营的教材（WTF-Solidity）是按**以太坊**写的。平台的合约练习场把这些合约部署到**国产联盟链 FISCO BCOS** 上运行，大多数代码的行为完全一样，但有少数地方两条链的约定不同。

这一章讲其中影响最大的一处：**区块时间戳的单位**。我们会先看两份官方文档分别怎么规定，再在平台的链上亲手测一次。

## 两份官方文档的规定

| 来源 | 原文要点 | 单位 |
| --- | --- | --- |
| Solidity 官方文档《Units and Globally Available Variables》 | `block.timestamp`：current block timestamp as seconds since unix epoch | 秒 |
| FISCO BCOS v2.11.0 官方文档《区块链功能接口列表》 | 区块的 `timestamp` 字段：时间戳，单位毫秒 | 毫秒 |

Solidity 文档描述的是以太坊上的约定：区块时间按**秒**计。FISCO BCOS 的文档说明它的区块时间戳按**毫秒**记录。合约里的 `block.timestamp` 读到的就是区块头里的这个时间戳，所以在 FISCO BCOS 上，它也是毫秒。

> 两份文档都可以在本章末尾的「参考资料」里找到原文。下面的实验用平台自己的链验证这一点。

## 动手验证

本章附带了一个很小的合约 `TimeProbe.sol`，点页面上的「在合约练习场打开」就能载入。

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TimeProbe {
    uint256 public deployedAt;

    constructor() {
        deployedAt = block.timestamp;
    }

    function nowTimestamp() public view returns (uint256) {
        return block.timestamp;
    }

    function oneMinute() public pure returns (uint256) {
        return 1 minutes;
    }
}
```

操作步骤：

1. 编译、部署到链上，记下部署时间（练习场里合约名字后面会显示）；
2. 调用 `deployedAt`，看返回的数字有几位；
3. 调用 `oneMinute`，看返回值。

平台开发时（2026 年 11 月 10 日 21:58）在 FISCO BCOS v2.11.0 上的一次实测结果：

| 调用 | 返回值 | 说明 |
| --- | --- | --- |
| `deployedAt` | `1794319080168` | 13 位数。按毫秒换算正好是北京时间 2026-11-10 21:58:00，按秒换算则是几万年以后 |
| `oneMinute` | `60` | `1 minutes`、`1 hours` 这些时间单位是**编译器**按秒换算的，和链无关 |

你的结果数字会不同，但应该同样是 13 位。

## 这会带来什么问题

问题出在两者相遇的地方：`block.timestamp` 是毫秒，而代码里写的 `60`、`1 minutes`、`1 days` 都是按秒算的。

以训练营第 35 讲「荷兰拍卖」为例，合约规定每过 `AUCTION_DROP_INTERVAL = 1 minutes`（也就是 60）降一次价：

```solidity
uint256 steps = (block.timestamp - auctionStartTime) / AUCTION_DROP_INTERVAL;
```

- 在以太坊上：过 60 **秒**降一次价，10 分钟降完；
- 在 FISCO BCOS 上：过 60 **毫秒**就降一次价，不到 1 秒价格就降到底了。

同理，「锁仓 1 天」「投票持续 7 天」这类逻辑，在 FISCO BCOS 上如果不做换算，实际时长只有原来的千分之一。

这类问题**编译不会报错，部署也会成功**，只有按时间运行起来才会暴露，所以特别容易被忽略。

## 怎么写才稳妥

常见的做法是在合约里把时间统一换算成秒，再和时间单位比较：

```solidity
// 在 FISCO BCOS 上：把毫秒换成秒
function nowSeconds() internal view returns (uint256) {
    return block.timestamp / 1000;
}
```

需要注意：

- 这段代码只适用于时间戳是毫秒的链。把同一份合约搬回以太坊时，要去掉 `/ 1000`；
- 更好的写法是把换算集中在一个函数里，换链时只改这一处，而不是在每个用到时间的地方各自除以 1000；
- 部署前读一次 `block.timestamp`，确认它的位数（10 位是秒，13 位是毫秒），是最直接的检查方法。

## 小结

- Solidity 官方文档规定 `block.timestamp` 以**秒**为单位，这是以太坊的约定；
- FISCO BCOS 官方文档规定区块时间戳以**毫秒**为单位，平台实测也是如此；
- `1 minutes`、`1 days` 等时间单位由编译器按秒换算，不随链变化；
- 同一份合约换一条链运行前，要核对这类**链相关的约定**，不能只看编译是否通过。

## 参考资料

- Solidity 官方文档，Units and Globally Available Variables（区块和交易属性、时间单位）：https://docs.soliditylang.org/en/latest/units-and-global-variables.html
- FISCO BCOS 2.0 v2.11.0 官方文档，区块链功能接口列表（getBlockByNumber 等接口返回的 timestamp 字段）：https://fisco-bcos-documentation.readthedocs.io/zh-cn/latest/docs/api.html
- 训练营第 35 讲「荷兰拍卖」（WTF-Solidity），本章用作示例的合约
