#!/usr/bin/env node
"use strict";

// One command for Mone: run the pre-post checks, then post. Never retries a post.
// Usage: node scripts/post.js ask|request <file> [--dry-run]
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { checkAsk } = require("./check-ask");
const { checkRequest } = require("./check-request");
const { wakeAllowed } = require("./check-wake-gap");

const REPO = "amukutsurogiwork-oss/ai-collab-sandbox";
// The consultation thread is the one the registry names (Amu reads the same registry), so moving threads is one registry change.
function askPr(registryText = fs.readFileSync(require("node:path").join(__dirname, "../collab/registry.json"), "utf8")) {
  const hits = (JSON.parse(registryText).projects || []).filter((p) => p && p.repo === REPO && Number.isInteger(p.consultPrNumber) && p.consultPrNumber > 0);
  if (hits.length !== 1) throw new Error("台帳に sandbox の相談用 PR が1件だけ書かれていません");
  return hits[0].consultPrNumber;
}
const REQUEST_PR = 25;

// The only place that talks to gh. Tests replace it.
function run(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function firstLine(text) {
  return String(text).replace(/^﻿/, "").split(/\r?\n/)[0].trim();
}

function parseFields(line) {
  const out = {};
  for (const kv of line.replace(/^\[[^\]]+\]\s*/, "").split(/\s+/).filter(Boolean)) {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

const MAX_PAGES = 50;
// Amu reads every comment of the thread before answering; at 360 comments (PR #23, 2026-11-22) she could not.
// Stop well before that and move to a new thread.
const MAX_THREAD_COMMENTS = 200;
// Instruction v21 (2026-11-24, Amu's design): Amu checks every comment's header with a program and reads in full only
// the comments of the asks she will answer (and their earlier rounds). She read 10 comments / 8,930 characters in full
// without a cut (2026-11-24 test; 5 comments / 3,576 characters had been cut only by the extra API fields, fixed in v20).
// Keep what she reads in full within 8,000 characters.
const MAX_READ_CHARS = 8000;
const chars = (s) => [...String(s || "")].length;
// Each ask/reply waits for one answer of up to 800 characters (instruction v18); keep room for every answer still to come.
const ANSWER_RESERVE = 800;
// "id:round" of every ask/reply that still waits for Amu's answer (cancelled ids excluded).
function pendingKeys(comments) {
  const want = new Map(), cancelled = new Set();
  for (const c of comments || []) {
    const head = firstLine(c.body || ""), f = parseFields(head);
    if (head.startsWith("[MONE-ASK]") && f.status === "cancel") cancelled.add(f.id);
    else if (head.startsWith("[MONE-ASK]")) want.set(`${f.id}:1`, c);
    else if (head.startsWith("[MONE-REPLY]")) want.set(`${f.id}:${f.round}`, c);
  }
  // Codex P2 on #95: answered only when id, round and source (the ask's comment number) all match and it is not blocked,
  // as in the instruction, diagnose.js and status.js. A comment without a number (tests of older code) matches any source.
  for (const c of comments || []) {
    const head = firstLine(c.body || ""), f = parseFields(head), key = `${f.request}:${f.round}`;
    if (!(head.startsWith("[AMU-ANSWER]") || head.startsWith("[MONE-RECORD]")) || f.status === "blocked" || !want.has(key)) continue;
    const askId = want.get(key).id;
    if (askId === undefined || String(askId) === String(f.source)) want.delete(key);
  }
  for (const [k, c] of want) want.set(k, c.body);
  for (const k of [...want.keys()]) if (cancelled.has(k.split(":")[0])) want.delete(k);
  return want; // key -> body of the waiting post
}
function pendingAnswers(comments) {
  return pendingKeys(comments).size;
}
// ids Amu will answer in this run: every pending one, plus the one being posted.
function readIds(comments, text) {
  const ids = new Set([...pendingKeys(comments).keys()].map((k) => k.split(":")[0]));
  ids.add(parseFields(firstLine(text)).id);
  return ids;
}
// Characters of the comments Amu reads in full: asks, replies and answers of those ids.
function readChars(comments, ids) {
  let n = 0;
  for (const c of comments || []) {
    const head = firstLine(c.body || ""), f = parseFields(head);
    const id = (head.startsWith("[AMU-ANSWER]") || head.startsWith("[MONE-RECORD]")) ? f.request : (head.startsWith("[MONE-ASK]") || head.startsWith("[MONE-REPLY]")) ? f.id : null;
    if (id && ids.has(id)) n += chars(c.body);
  }
  return n;
}
// Room for every answer still to come: 800 each, or limit=N when the first ask of that id set one (design asks, up to 4000).
function limitOf(comments, id, text) {
  const asks = [...(comments || []).map((c) => c.body || ""), text || ""].map(firstLine)
    .filter((h) => h.startsWith("[MONE-ASK]") && parseFields(h).id === id && parseFields(h).status !== "cancel");
  const n = asks.length ? Number(parseFields(asks[0]).limit) : NaN;
  return Number.isInteger(n) && n > 0 ? n : ANSWER_RESERVE;
}
// true when the first ask of that id set limit=N (otherwise no length is specified: the answer is as long as the question needs).
function limitSpecified(comments, id) {
  const asks = (comments || []).map((c) => c.body || "").map(firstLine)
    .filter((h) => h.startsWith("[MONE-ASK]") && parseFields(h).id === id && parseFields(h).status !== "cancel");
  const n = asks.length ? Number(parseFields(asks[0]).limit) : NaN;
  return Number.isInteger(n) && n > 0;
}
function answerReserve(comments, text) {
  let r = 0;
  for (const k of pendingKeys(comments).keys()) r += limitOf(comments, k.split(":")[0]);
  return r + limitOf(comments, parseFields(firstLine(text)).id, text);
}
function overBudget(comments, text) {
  if (parseFields(firstLine(text)).status === "cancel") return null;
  // A [MONE-NOTE] gets no answer and is not read in full, so the read budget does not apply (2026-11-26, CUSTOM-INST-1).
  if (firstLine(text).startsWith("[MONE-NOTE]")) return null;
  const used = readChars(comments, readIds(comments, text));
  const reserve = answerReserve(comments, text);
  return used + chars(text) + reserve > MAX_READ_CHARS
    ? `アムが全文を読む分 (答える相談と、その前の回のやり取り) が上限 ${MAX_READ_CHARS} 字をこえます (いま ${used} 字 + この投稿 ${chars(text)} 字 + これから来る回答の分 ${reserve} 字)。投稿せずに止まります。相談を短くするか、長い相談は post-long.js で分けてください`
    : null;
}
// A cancellation is always allowed: refusing it would leave the original ask or request actionable.
function threadFull(comments, text) {
  if (parseFields(firstLine(text)).status === "cancel") return null;
  return (comments || []).length >= MAX_THREAD_COMMENTS
    ? `スレッドのコメントが ${MAX_THREAD_COMMENTS} 件に達しました。アムが全部を読み切れなくなるので、投稿せずに止まります。新しいスレッドへ引っ越してください`
    : null;
}

function planAsk(text, comments, now = new Date()) {
  const err = checkAsk(text) || threadFull(comments, text) || overBudget(comments, text);
  if (err) return { ok: false, reason: err };
  // Amu ignores a second initial ask for the same id and a second reply for the same round.
  const head = firstLine(text);
  const tag = (head.match(/^\[(MONE-[A-Z]+)\]/) || [])[1];
  const f = parseFields(head);
  if (tag === "MONE-ASK" || tag === "MONE-REPLY") {
    const cancel = f.status === "cancel";
    for (const c of comments || []) {
      if (typeof c.body !== "string") continue;
      const ch = firstLine(c.body);
      const ctag = (ch.match(/^\[(MONE-[A-Z]+)\]/) || [])[1];
      const cf = parseFields(ch);
      if (ctag !== tag || cf.id !== f.id) continue;
      if ((cf.status === "cancel") !== cancel) continue;
      if (tag === "MONE-REPLY" && cf.round !== f.round) continue;
      return { ok: false, reason: `id=${f.id} の同じ相談(または同じ回の返事)が、すでに投稿されています(二重投稿)` };
    }
  }
  const w = wakeAllowed(comments, now);
  return { ok: true, wake: w.ok ? { ok: true } : { ok: false, waitSeconds: w.waitSeconds } };
}

function planRequest(text, prHeadSha, comments, now = new Date()) {
  const err = checkRequest(text, now) || threadFull(comments, text);
  if (err) return { ok: false, reason: err };
  const first = firstLine(text);
  const f = parseFields(first);
  const cancel = f.status === "cancel";
  if (!cancel) {
    if (!f.sha) return { ok: false, reason: "先頭行に sha=<PR #25 の最新の版> がありません" };
    if (!prHeadSha || f.sha !== String(prHeadSha).trim()) {
      return { ok: false, reason: "sha が PR #25 の今の最新の版と違います" };
    }
  }
  for (const c of comments || []) {
    if (typeof c.body !== "string") continue;
    const cf = parseFields(firstLine(c.body));
    if (!firstLine(c.body).startsWith("[MONE-REQUEST]") || cf.id !== f.id) continue;
    if ((cf.status === "cancel") === cancel) {
      return { ok: false, reason: `id=${f.id} は、すでに PR #25 に投稿されています(二重投稿)` };
    }
  }
  return { ok: true };
}

// Reads the whole history page by page (the proxy cannot use --paginate). Too many pages -> stop.
function fetchAll(pr, runner = run) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = JSON.parse(runner(["api", `repos/${REPO}/issues/${pr}/comments?per_page=100&page=${page}`]));
    all.push(...batch);
    if (batch.length < 100) return all;
  }
  throw new Error("コメントが多すぎて、全部を読み切れません");
}

function postFile(pr, file) {
  return run(["api", `repos/${REPO}/issues/${pr}/comments`, "-F", `body=@${file}`, "--jq", ".created_at"]).trim();
}

function main(argv, now = new Date()) {
  const args = argv.filter((a) => a !== "--dry-run");
  const dry = args.length !== argv.length;
  const [kind, file] = args;
  const ng = (r) => { console.log("NG: " + r); return 1; };
  if (!["ask", "request"].includes(kind) || !file) {
    console.log("使い方: node scripts/post.js ask|request <ファイル> [--dry-run]");
    return 1;
  }
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (_) { return ng("ファイルを読めません"); }
  let plan;
  let pr;
  try {
    if (kind === "ask") {
      pr = askPr();
      const early = checkAsk(text);
      if (early) return ng(early);
      plan = planAsk(text, fetchAll(pr), now);
    } else {
      pr = REQUEST_PR;
      const early = checkRequest(text, now);
      if (early) return ng(early);
      const head = run(["api", `repos/${REPO}/pulls/${pr}`, "--jq", ".head.sha"]).trim();
      plan = planRequest(text, head, fetchAll(pr), now);
    }
  } catch (e) {
    return ng("GitHub から情報を取れませんでした(投稿していません)");
  }
  if (!plan.ok) return ng(plan.reason);
  if (kind === "ask") console.log(plan.wake.ok ? "WAKE-OK" : `WAKE-WAIT ${plan.wake.waitSeconds}`);
  if (dry) {
    console.log(`DRY-RUN: PR #${pr} に次を投稿する予定です(投稿はしていません)`);
    console.log(text);
    return 0;
  }
  let created;
  try { created = postFile(pr, file); } catch (_) { return ng("投稿に失敗しました(自動では再試行しません。状態を確認してください)"); }
  console.log(`POSTED ${created}`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { askPr, pendingKeys, readChars, MAX_READ_CHARS, limitOf, limitSpecified, planAsk, planRequest, fetchAll, run, main };
