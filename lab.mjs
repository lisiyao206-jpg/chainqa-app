// lab.mjs —— 链上实验场：学生亲手改合约 → 现场编译 → 部署到联盟链 → 攻击者轮番进攻 → 补墙再战
// 题目写在 chainlab/labs.mjs；和区块链打交道的部分在 chain.mjs
// 编译在 solidity.mjs 里（官方 solc 0.6.10，FISCO BCOS 2.x 支持的最高版本）

import { compileSource } from "./solidity.mjs";
import { db } from "./db.mjs";
import * as chain from "./chain.mjs";
import { LABS, UPCOMING } from "./chainlab/labs.mjs";

const one = (sql, ...args) => db.prepare(sql).get(...args);
const MAX_CODE = 20000; // 代码最多 2 万个字符
const SHOW_ANSWER_AFTER = 3; // 上链失败 3 次后可以看参考答案

const progressOf = (uid, labId) =>
  one("SELECT * FROM lab_progress WHERE user_id = ? AND lab_id = ?", uid, labId) || { attempts: 0, passed: 0 };
const labOf = (id) => {
  const lab = LABS.find((l) => l.id === Number(id));
  if (!lab) throw new Error("没有这道题");
  return lab;
};

// ===== 题目列表 =====
export function listLabs(uid) {
  return {
    enabled: chain.chainEnabled(),
    labs: LABS.map((l) => {
      const p = progressOf(uid, l.id);
      return {
        id: l.id, level: l.level, title: l.title, type: l.type, brief: l.brief, starter: l.starter, hints: l.hints,
        checks: l.checks.map(({ key, kind, title, desc }) => ({ key, kind, title, desc })),
        attempts: p.attempts, passed: !!p.passed, passContract: p.pass_contract || null, passBlock: p.pass_block || null,
        answerReady: !!p.passed || p.attempts >= SHOW_ANSWER_AFTER,
      };
    }),
    upcoming: UPCOMING,
  };
}

// 参考答案：通关了，或者上链失败满 3 次才给看
export function answerOf(uid, labId) {
  const lab = labOf(labId);
  const p = progressOf(uid, lab.id);
  if (!p.passed && p.attempts < SHOW_ANSWER_AFTER) throw new Error(`再试 ${SHOW_ANSWER_AFTER - p.attempts} 次，就能查看参考答案`);
  return { answer: lab.answer };
}

// ===== 编译 =====
// 返回 { abi, bin } 或者 { errors: [{ line, message }] }
function compile(code, lab) {
  const built = compileSource(code, "Lab.sol");
  if (built.errors) return built;
  const c = built.contracts[lab.contract];
  if (!c) return { errors: [{ line: null, message: `找不到合约 ${lab.contract}，不要修改合约的名字` }] };
  // 检验要用到的函数不能删、不能改名、不能改参数
  const sigs = c.abi.filter((f) => f.type === "function").map((f) => `${f.name}(${f.inputs.map((i) => i.type).join(",")})`);
  const missing = lab.required.filter((s) => !sigs.includes(s));
  if (missing.length) return { errors: [{ line: null, message: `这些函数不能删除或改名：${missing.join("、")}` }] };
  return c;
}

// ===== 运行一次实验 =====
// emit(event, data)：每完成一步就推给前端（SSE）
const running = new Set(); // 同一个人同时只能跑一次实验
export async function runLab(uid, labId, code, emit) {
  const lab = labOf(labId);
  code = String(code || "");
  if (!code.trim()) throw new Error("代码是空的");
  if (code.length > MAX_CODE) throw new Error(`代码太长了（最多 ${MAX_CODE} 个字符）`);
  if (!chain.chainEnabled()) throw new Error("链上实验场还没有连接区块链");
  if (running.has(uid)) throw new Error("上一次实验还在进行，请等它结束");
  running.add(uid);
  try {
    // 1. 编译
    const built = compile(code, lab);
    emit("compile", built.errors ? { ok: false, errors: built.errors } : { ok: true });
    if (built.errors) return;

    // 2. 准备账号：管理员、新管理员、攻击者（私钥都在 WeBASE-Front 里）
    const acc = {
      admin: await chain.account("chainlab_admin"),
      admin2: await chain.account("chainlab_admin2"),
      attacker: await chain.account("chainlab_attacker"),
    };
    emit("chain", { ...(await chain.chainInfo()), accounts: acc });

    // 3. 逐项检验：每项都重新部署一份学生的合约
    const results = [];
    let lastDeploy = null;
    for (const check of lab.checks) {
      const d = await chain.deploy(acc.admin, lab.contract, built.abi, built.bin);
      lastDeploy = d;
      emit("deploy", { check: check.key, address: d.address, block: d.block });
      const steps = [];
      for (const s of check.steps) {
        const r = await chain.sendTx(acc[s.who], lab.contract, built.abi, d.address, s.fn, s.args(acc));
        steps.push(r);
        emit("step", { check: check.key, label: s.label, who: s.who, ...r });
      }
      const read = (fn, params = []) => chain.call(acc.admin, lab.contract, built.abi, d.address, fn, params);
      const verdict = await check.judge({ steps, read, acc });
      results.push(verdict.pass);
      emit("check", { check: check.key, pass: verdict.pass, text: verdict.text });
    }

    // 4. 记录成绩
    const passed = results.every(Boolean);
    db.prepare(`INSERT INTO lab_progress (user_id, lab_id, attempts) VALUES (?, ?, 1)
                ON CONFLICT (user_id, lab_id) DO UPDATE SET attempts = attempts + 1`).run(uid, lab.id);
    if (passed && !progressOf(uid, lab.id).passed)
      db.prepare(`UPDATE lab_progress SET passed = 1, pass_time = datetime('now', 'localtime'), pass_contract = ?, pass_block = ?
                  WHERE user_id = ? AND lab_id = ?`).run(lastDeploy.address, lastDeploy.block, uid, lab.id);
    const p = progressOf(uid, lab.id);
    emit("done", {
      passed, attempts: p.attempts, everPassed: !!p.passed,
      answerReady: !!p.passed || p.attempts >= SHOW_ANSWER_AFTER,
      passContract: p.pass_contract || null, passBlock: p.pass_block || null,
    });
  } finally {
    running.delete(uid);
  }
}

// 学习报告、班级任务用：某人通关了哪些实验
export const passedLabs = (uid) =>
  db.prepare("SELECT lab_id FROM lab_progress WHERE user_id = ? AND passed = 1").all(uid).map((r) => r.lab_id);
