// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// 读一读链上的「现在几点」：部署后分别调用三个函数，对比返回值
contract TimeProbe {
    uint256 public deployedAt; // 部署那一刻的 block.timestamp

    constructor() {
        deployedAt = block.timestamp;
    }

    // 当前区块的时间戳
    function nowTimestamp() public view returns (uint256) {
        return block.timestamp;
    }

    // Solidity 的时间单位：1 minutes 在编译时就换算成了 60
    function oneMinute() public pure returns (uint256) {
        return 1 minutes;
    }
}
