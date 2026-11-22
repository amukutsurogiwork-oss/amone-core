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
// Amu reads about 5,000 characters of comments at once (2026-11-22: 3 comments / 4,600 chars worked, 5 / 8,500 did not;
// the launch text was also cut at exactly 5,000 on 2026-11-15). Keep the whole Chat thread within 90%: 4,500 characters.
const MAX_THREAD_CHARS = 4500;
const chars = (s) => [...String(s || "")].length;
function overBudget(comments, text) {
  if (parseFields(firstLine(text)).status === "cancel") return null;
  const used = (comments || []).reduce((n, c) => n + chars(c.body), 0);
  return used + chars(text) > MAX_THREAD_CHARS
    ? `スレッドの文字数が上限 ${MAX_THREAD_CHARS} 字をこえます (いま ${used} 字 + この投稿 ${chars(text)} 字)。アムが読み切れなくなるので、投稿せずに止まります。新しいスレッドへ引っ越してください`
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

module.exports = { askPr, planAsk, planRequest, fetchAll, run, main };
