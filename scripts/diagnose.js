#!/usr/bin/env node
"use strict";

// When Amu has not answered 15 minutes after the wake mail: check everything Mone can see and say whose side the problem is on.
// よしひろさん (2026-11-22):「15分返事がなかったら何が悪いかチェックして改善する機能をつけたい」
// Usage: node scripts/diagnose.js <相談ID> <round> <起こしメールを送った時刻 ISO>
const { execFileSync } = require("node:child_process");

const MAX_THREAD_CHARS = 4500, MAX_THREAD_COMMENTS = 200, WAKE_GAP_SECONDS = 300;
const chars = (s) => [...String(s || "")].length;
const first = (b) => String(b || "").split(/\r?\n/)[0].trim();
const fields = (line) => Object.fromEntries(line.replace(/^\[[^\]]+\]\s*/, "").split(/\s+/).filter((kv) => kv.includes("=")).map((kv) => kv.split("=")));

function diagnose({ id, round, comments, pr, wakeSentAt, now = new Date() }) {
  const cs = comments || [];
  const isCancel = (c) => { const h = first(c.body), f = fields(h); return h.startsWith("[MONE-ASK]") && f.id === id && f.status === "cancel"; };
  if (cs.some(isCancel)) return { side: "cancelled", checks: [], action: "この相談は取り消されています。調べることも、送り直すこともしません" };
  const mine = cs.find((c) => {
    const h = first(c.body), f = fields(h);
    return f.id === id && ((round === 1 && h.startsWith("[MONE-ASK]") && f.status !== "cancel") || (h.startsWith("[MONE-REPLY]") && Number(f.round) === round));
  });
  const answers = cs.filter((c) => { const h = first(c.body), f = fields(h); return h.startsWith("[AMU-ANSWER]") && f.request === id && Number(f.round) === round; });
  if (answers.some((c) => fields(first(c.body)).status !== "blocked")) return { side: "none", checks: [], action: "返事は来ています。直すことはありません" };
  if (answers.length) return { side: "amu-blocked", checks: [], action: "アムが止まった報告 (blocked) を書いています。理由の分類を読んで、モネの側で直せるものを直します" };

  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  add("相談の書き込み", mine, mine ? "あり" : `id=${id} round=${round} の書き込みが見つかりません`);
  if (round > 1 && mine) {
    // Amu answers a reply only after one normal answer to the round before it, and only when the reply came after that answer.
    const initial = cs.some((c) => { const h = first(c.body), f = fields(h); return h.startsWith("[MONE-ASK]") && f.id === id && f.status !== "cancel"; });
    const prev = cs.filter((c) => { const h = first(c.body), f = fields(h); return h.startsWith("[AMU-ANSWER]") && f.request === id && Number(f.round) === round - 1 && f.status !== "blocked"; });
    const after = prev.length === 1 && Date.parse(mine.created_at) > Date.parse(prev[0].created_at);
    add("順番", initial && after, !initial ? "最初の相談 (round=1) がありません" : prev.length !== 1 ? `round=${round - 1} の通常の答えが ${prev.length} 件です (1件必要)` : after ? "OK" : `round=${round} の書き込みが、round=${round - 1} の答えより前です`);
  }
  const used = cs.reduce((n, c) => n + chars(c.body), 0);
  add("文字数", used <= MAX_THREAD_CHARS, `スレッド合計 ${used} 字 (上限 ${MAX_THREAD_CHARS})`);
  add("件数", cs.length < MAX_THREAD_COMMENTS, `${cs.length} 件`);
  add("相談の場所", pr && pr.state === "open" && /^\[AMONE-CHAT\]/.test(pr.title || ""), pr ? `${pr.state} / ${pr.title}` : "PR が読めません");
  const m = mine && /files=(\d+) sha=([0-9a-f]{40})/.exec(mine.body);
  if (m) add("長文の版", pr && m[2] === pr.headSha, `目印の sha ${m[2].slice(0, 7)} / いまの head ${pr ? String(pr.headSha).slice(0, 7) : "?"}`);
  let wakeOk = !!wakeSentAt, wakeDetail = wakeSentAt ? `送信 ${wakeSentAt}` : "起こしメールを送っていません";
  if (wakeSentAt) {
    const sent = Date.parse(wakeSentAt);
    const lastAmu = cs.filter((c) => first(c.body).startsWith("[AMU-") && Date.parse(c.created_at) <= sent).map((c) => Date.parse(c.created_at)).sort((a, b) => b - a)[0];
    if (lastAmu && (sent - lastAmu) / 1000 < WAKE_GAP_SECONDS) { wakeOk = false; wakeDetail = `アムの書き込みから ${Math.round((sent - lastAmu) / 1000)} 秒で送っています (5分必要)`; }
  }
  add("起こしメール", wakeOk, wakeDetail);
  const bad = checks.filter((c) => !c.ok);
  if (bad.length) return { side: "mone", checks, action: `モネの側の原因: ${bad.map((c) => c.name).join("・")}。原因を直してから、1回だけ出し直します (2回続けて失敗したら止めて報告)` };
  return { side: "amu", checks, action: "モネの側は問題ありません。アムかショートカットの側です。よしひろさんに、アムの画面 (止まった報告や、動いていないか) を見てもらいます。送り直しはしません" };
}

function main(argv) {
  const [id, roundText, wakeSentAt] = argv;
  if (!id || !roundText) { console.log("使い方: node scripts/diagnose.js <相談ID> <round> <起こしメールの時刻 ISO>"); return 1; }
  const post = require("./post");
  const repo = "amukutsurogiwork-oss/ai-collab-sandbox", n = post.askPr();
  const p = JSON.parse(execFileSync("gh", ["api", `repos/${repo}/pulls/${n}`], { encoding: "utf8" }));
  const r = diagnose({ id, round: Number(roundText), comments: post.fetchAll(n), pr: { state: p.state, title: p.title, headSha: p.head.sha }, wakeSentAt: wakeSentAt || null });
  for (const c of r.checks) console.log(`${c.ok ? "OK" : "NG"} ${c.name}: ${c.detail}`);
  console.log(`=> ${r.side}: ${r.action}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { diagnose };
