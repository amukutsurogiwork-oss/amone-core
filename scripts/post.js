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
const ASK_PR = 23;
const REQUEST_PR = 25;
const ASK_WINDOW_MS = 12 * 60 * 60 * 1000;
const REQUEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

function planAsk(text, comments, now = new Date()) {
  const err = checkAsk(text);
  if (err) return { ok: false, reason: err };
  const w = wakeAllowed(comments, now);
  return { ok: true, wake: w.ok ? { ok: true } : { ok: false, waitSeconds: w.waitSeconds } };
}

function planRequest(text, prHeadSha, comments, now = new Date()) {
  const err = checkRequest(text, now);
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

function fetchComments(pr, sinceMs, now) {
  const since = new Date(now.getTime() - sinceMs).toISOString();
  const out = run(["api", `repos/${REPO}/issues/${pr}/comments?per_page=100&since=${since}`]);
  return JSON.parse(out.replace(/\]\s*\[/g, ","));
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
      pr = ASK_PR;
      const early = checkAsk(text);
      if (early) return ng(early);
      plan = planAsk(text, fetchComments(pr, ASK_WINDOW_MS, now), now);
    } else {
      pr = REQUEST_PR;
      const early = checkRequest(text, now);
      if (early) return ng(early);
      const head = run(["api", `repos/${REPO}/pulls/${pr}`, "--jq", ".head.sha"]).trim();
      plan = planRequest(text, head, fetchComments(pr, REQUEST_WINDOW_MS, now), now);
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

module.exports = { planAsk, planRequest, run, main };
