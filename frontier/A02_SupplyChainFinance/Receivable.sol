// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// 一个简化的「链上应收账款」合约：核心企业开出应收账款，供应商可以拆分转给下一级供应商
// 每一笔都能追溯到最初的核心企业，这就是「信用穿透」
contract Receivable {
    struct Bill {
        address holder;    // 现在持有这笔应收账款的企业
        uint256 amount;    // 金额（演示用，单位：万元）
        uint256 parent;    // 从哪一笔拆分来的；0 表示核心企业直接开出的
        bool paid;         // 核心企业是否已经付款
    }

    address public core;               // 核心企业：部署合约的账户
    uint256 public count;              // 一共有多少笔
    mapping(uint256 => Bill) public bills;

    event Issued(uint256 indexed id, address indexed to, uint256 amount);
    event Split(uint256 indexed from, uint256 indexed id, address indexed to, uint256 amount);
    event Paid(uint256 indexed id, address indexed holder, uint256 amount);

    constructor() {
        core = msg.sender;
    }

    // 核心企业开出一笔应收账款给一级供应商
    function issue(address to, uint256 amount) public returns (uint256) {
        require(msg.sender == core, "only core enterprise");
        require(amount > 0, "amount must be > 0");
        count++;
        bills[count] = Bill(to, amount, 0, false);
        emit Issued(count, to, amount);
        return count;
    }

    // 持有人把手里的一部分拆出来，转给下一级供应商（用来抵付货款）
    function split(uint256 id, address to, uint256 amount) public returns (uint256) {
        Bill storage b = bills[id];
        require(b.holder == msg.sender, "not holder");
        require(!b.paid, "already paid");
        require(amount > 0 && amount <= b.amount, "bad amount");
        b.amount -= amount;
        count++;
        bills[count] = Bill(to, amount, id, false);
        emit Split(id, count, to, amount);
        return count;
    }

    // 到期后核心企业付款（演示：只记录状态，不真的转钱）
    function pay(uint256 id) public {
        require(msg.sender == core, "only core enterprise");
        Bill storage b = bills[id];
        require(b.amount > 0 && !b.paid, "nothing to pay");
        b.paid = true;
        emit Paid(id, b.holder, b.amount);
    }

    // 追溯：从任意一笔往上找，直到核心企业直接开出的那一笔，返回经过了几级
    function levelOf(uint256 id) public view returns (uint256 level, uint256 rootId) {
        require(id > 0 && id <= count, "no such bill");
        level = 1;
        rootId = id;
        while (bills[rootId].parent != 0) {
            rootId = bills[rootId].parent;
            level++;
        }
    }
}
