// chainlab/labs.mjs —— 链上实验场的题目
// 每道题：一份有漏洞的合约（学生在网页上直接改）+ 一组「检验」：
//   业务检查（kind: "business"）：管理员的正常操作必须还能用，防止学生为了防攻击把功能整个删掉
//   攻击（kind: "attack"）：攻击者用不同手法进攻，学生的合约必须全部挡住
// 每项检验都会重新部署一份学生的合约，互不影响。所有部署和交易都真实发生在联盟链上
//
// FISCO BCOS 2.x 支持 Solidity 0.4.25 ~ 0.6.10，所以合约按 0.6 的语法写（构造函数要写 public）
// 联盟链没有以太币，「转走 ETH」改成「演示余额」的增减：只是合约里的一个数字，不是代币，原理完全一样

const VAULT_STARTER = `// SPDX-License-Identifier: MIT
pragma solidity >=0.4.24 <0.7.0;

// 没上锁的金库
// 管理员往金库里存演示余额，只有管理员能把钱取走、能更换管理员。
// 这份合约有安全漏洞，攻击者能把金库搬空。找到漏洞，亲手修好它，再部署到链上接受攻击。
contract Vault {
    address public owner;                          // 管理员
    uint256 public vault;                          // 金库里的演示余额
    mapping(address => uint256) public balanceOf;  // 每个账户拿到的演示余额

    constructor() public {
        owner = msg.sender;                        // 谁部署合约，谁就是管理员
    }

    // 安全检查：只有管理员能调用
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // 管理员往金库存钱
    function deposit(uint256 amount) public onlyOwner {
        vault += amount;
    }

    // 把金库里的钱全部转给 to
    function withdrawAll(address to) public {
        balanceOf[to] += vault;
        vault = 0;
    }

    // 更换管理员
    function setOwner(address newOwner) public {
        owner = newOwner;
    }
}
`;

const VAULT_ANSWER = VAULT_STARTER
  .replace("function withdrawAll(address to) public {", "function withdrawAll(address to) public onlyOwner {")
  .replace("function setOwner(address newOwner) public {", "function setOwner(address newOwner) public onlyOwner {");

export const LABS = [
  {
    id: 1,
    level: 1,
    title: "没上锁的金库",
    type: "访问控制",
    contract: "Vault",
    // 学生不能删掉或改名的函数（检验要用到它们）
    required: ["deposit(uint256)", "withdrawAll(address)", "setOwner(address)", "owner()", "vault()", "balanceOf(address)"],
    brief: "管理员往金库里存了 100 演示余额。攻击者想把钱搬走，他会尝试三种手法。修改合约代码，筑起安全墙，让三种攻击全部失败，同时保证管理员还能正常存取。",
    starter: VAULT_STARTER,
    answer: VAULT_ANSWER,
    hints: [
      "先找「门」：看看合约里哪些函数是任何人都能调用的。",
      "deposit 已经有 onlyOwner 保护了，另外两个改动金库和管理员的函数呢？",
      "只给 withdrawAll 加锁还不够：攻击者可以先调用 setOwner 把自己设成管理员，再光明正大地取钱。两道门都要锁上。",
    ],
    checks: [
      {
        key: "business",
        kind: "business",
        title: "正常业务",
        desc: "管理员存入 100，再取出到自己账户；然后把管理员交接给新管理员",
        // 没通过时告诉学生去哪里找问题（不直接给答案）
        fix: "检查你加的限制条件：管理员自己调用 deposit、withdrawAll、setOwner 时，require 的判断能不能通过？",
        steps: [
          { who: "admin", fn: "deposit", args: () => ["100"], label: "管理员存入 100" },
          { who: "admin", fn: "withdrawAll", args: (a) => [a.admin], label: "管理员取出到自己账户" },
          { who: "admin", fn: "setOwner", args: (a) => [a.admin2], label: "管理员交接给新管理员" },
        ],
        // 业务检查：每一步都必须成功，余额和管理员也要对
        judge: async (r) =>
          r.steps.every((s) => s.ok) && Number(await r.read("balanceOf", [r.acc.admin])) === 100 && sameAddr(await r.read("owner"), r.acc.admin2)
            ? { pass: true, text: "管理员的正常操作都能完成" }
            : { pass: false, text: "管理员的正常操作被挡住了：安全墙不能把自己人也锁在门外" },
      },
      {
        key: "forge",
        kind: "attack",
        title: "伪造存款",
        desc: "攻击者假装管理员，往金库里凭空存入 100 万",
        fix: "deposit 谁都能调用了：它原来的 onlyOwner 保护还在吗？",
        steps: [{ who: "attacker", fn: "deposit", args: () => ["1000000"], label: "攻击者调用 deposit(1000000)" }],
        judge: async (r) =>
          Number(await r.read("vault")) === 0
            ? { pass: true, text: "挡住了：攻击者不能凭空存款" }
            : { pass: false, text: "被突破：攻击者凭空造出了余额" },
      },
      {
        key: "drain",
        kind: "attack",
        title: "直接搬空",
        desc: "管理员存入 100 后，攻击者直接调用 withdrawAll，把钱转给自己",
        fix: "withdrawAll 没有检查调用者是谁：任何人都能把金库里的钱转走。",
        steps: [
          { who: "admin", fn: "deposit", args: () => ["100"], label: "管理员存入 100" },
          { who: "attacker", fn: "withdrawAll", args: (a) => [a.attacker], label: "攻击者调用 withdrawAll(攻击者)" },
        ],
        judge: async (r) => {
          const stolen = Number(await r.read("balanceOf", [r.acc.attacker]));
          return stolen === 0
            ? { pass: true, text: "挡住了：金库里的 100 一分没少" }
            : { pass: false, text: `被突破：攻击者拿走了 ${stolen}` };
        },
      },
      {
        key: "takeover",
        kind: "attack",
        title: "篡位夺权",
        desc: "管理员存入 100 后，攻击者先把自己设成管理员，再取钱",
        fix: "setOwner 没有检查调用者是谁：攻击者先把自己设成管理员，之后所有的 onlyOwner 都拦不住他。",
        steps: [
          { who: "admin", fn: "deposit", args: () => ["100"], label: "管理员存入 100" },
          { who: "attacker", fn: "setOwner", args: (a) => [a.attacker], label: "攻击者调用 setOwner(攻击者)" },
          { who: "attacker", fn: "withdrawAll", args: (a) => [a.attacker], label: "攻击者调用 withdrawAll(攻击者)" },
        ],
        judge: async (r) => {
          const owner = await r.read("owner");
          const stolen = Number(await r.read("balanceOf", [r.acc.attacker]));
          if (sameAddr(owner, r.acc.attacker)) return { pass: false, text: `被突破：攻击者成了管理员${stolen ? `，还拿走了 ${stolen}` : ""}` };
          return stolen === 0 ? { pass: true, text: "挡住了：管理员之位没被抢走" } : { pass: false, text: `被突破：攻击者拿走了 ${stolen}` };
        },
      },
    ],
  },
];

// 还没上线的题目：和实战任务的关卡一一对应，页面上显示「即将开放」
export const UPCOMING = [
  { level: 2, title: "归零的里程表", type: "整数溢出" },
  { level: 3, title: "取不完的提款机", type: "重入攻击" },
  { level: 4, title: "被冒充的主人", type: "tx.origin 钓鱼" },
  { level: 5, title: "能算出来的彩票", type: "坏随机数" },
  { level: 6, title: "被劫持的代理", type: "delegatecall" },
  { level: 7, title: "沉默的转账", type: "未检查返回值" },
  { level: 8, title: "卡死的分红池", type: "拒绝服务" },
  { level: 9, title: "被拨快的时钟", type: "时间戳依赖" },
  { level: 10, title: "无限提款的 BOSS", type: "签名重放" },
];

function sameAddr(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
