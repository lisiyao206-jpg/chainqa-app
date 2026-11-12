// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// 一个最小的「存证」合约：只把文件的哈希（指纹）记到链上，原文件留在自己手里
// 用法：先用 hashOf 算出一段文字的指纹 → 用 notarize 存证 → 以后用 verify 核验
contract HashNotary {
    struct Record {
        address owner;     // 谁存的证
        uint256 time;      // 存证时的区块时间戳（FISCO BCOS 上单位是毫秒，见 F02）
        uint256 blockNo;   // 存在第几个区块
    }

    mapping(bytes32 => Record) private records;

    event Notarized(bytes32 indexed hash, address indexed owner, uint256 time);

    // 算一段文字的指纹（keccak256）。只是读取，不上链、不花时间
    function hashOf(string memory text) public pure returns (bytes32) {
        return keccak256(bytes(text));
    }

    // 存证：同一个指纹只能存一次，先存的人就是「最早持有这份文件」的证明
    function notarize(bytes32 hash) public {
        require(records[hash].time == 0, "already notarized");
        records[hash] = Record(msg.sender, block.timestamp, block.number);
        emit Notarized(hash, msg.sender, block.timestamp);
    }

    // 核验：这个指纹有没有存过证、谁存的、什么时候存的
    function verify(bytes32 hash) public view returns (bool exists, address owner, uint256 time, uint256 blockNo) {
        Record memory r = records[hash];
        return (r.time != 0, r.owner, r.time, r.blockNo);
    }
}
