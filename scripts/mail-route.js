#!/usr/bin/env node
"use strict";

// The mail route (アストラの正式化案 NOTICE-ASTRA-FINAL-20261126 ②⑤, よしひろさん「この形で作って」2026-11-26).
// Monet sends one consultation at a time to the iPhone by mail; the normal Chat answers; the answer comes back by mail.
// The consultation thread keeps the state, so Monet can pick up from any wake-up:
//   [MONE-SEND]   request=ID round=R source=N tag=T            just before the mail is sent (the slot is taken)
//   [MONE-SEND]   request=ID round=R source=N tag=T status=release   the slot is freed without an answer
//   [MONE-RECORD] request=ID round=R source=N tag=T            the answer, received by Monet (the slot is freed)
// T is the first 16 hex characters of SHA-256 of the one-time token. The token itself is never written in GitHub.
const crypto = require("node:crypto");

const OWNER = "amukutsurogiwork-oss";
const first = (b) => String(b || "").replace(/^﻿/, "").split(/\r?\n/)[0].trim();
const fields = (line) => {
  const out = {};
  for (const kv of line.replace(/^\[[^\]]+\]\s*/, "").split(/\s+/)) {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
};
const owners = (comments) => (comments || []).filter((c) => !c.user || c.user.login === OWNER);

// An answer is Amu's own post ([AMU-ANSWER]) or Monet's record of the normal Chat's mailed reply ([MONE-RECORD]).
const isAnswerHead = (head) => head.startsWith("[AMU-ANSWER]") || head.startsWith("[MONE-RECORD]");
const tagOf = (token) => crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 16);
const newToken = () => crypto.randomBytes(16).toString("hex");

// The send still waiting for its answer (at most one should exist), or null.
function openSend(comments) {
  const done = new Set();
  let open = null;
  for (const c of owners(comments)) {
    const h = first(c.body), f = fields(h);
    if (h.startsWith("[MONE-RECORD]") || (h.startsWith("[MONE-SEND]") && f.status === "release")) done.add(f.tag);
  }
  for (const c of owners(comments)) {
    const h = first(c.body), f = fields(h);
    if (h.startsWith("[MONE-SEND]") && f.status !== "release" && !done.has(f.tag)) open = { ...f, comment: c.id };
  }
  return open;
}

// Whether a new mail may go out now, and for which ask (the oldest waiting one, as the packet chooses).
function planSend(comments) {
  const busy = openSend(comments);
  if (busy) return { ok: false, reason: `答え待ちのメールが1通あります (request=${busy.request} round=${busy.round})。答えが来るか、枠を空けるまで送りません` };
  const { pendingKeys } = require("./post");
  const waiting = pendingKeys(owners(comments));
  for (const c of owners(comments)) {
    const h = first(c.body), f = fields(h);
    if (h.startsWith("[MONE-ASK]") && f.status !== "cancel" && waiting.has(`${f.id}:1`)) return { ok: true, target: { id: f.id, round: 1, source: c.id } };
    if (h.startsWith("[MONE-REPLY]") && waiting.has(`${f.id}:${f.round}`)) return { ok: true, target: { id: f.id, round: Number(f.round), source: c.id } };
  }
  return { ok: false, reason: "送る相談がありません (答え待ちの相談がない)" };
}

// Whether a reply carrying this tag may be recorded now.
function planRecord(comments, tag) {
  const open = openSend(comments);
  if (!open || open.tag !== tag) return { ok: false, reason: "照合札が合いません (答え待ちのメールと対応しない返信です)。保留します" };
  for (const c of owners(comments)) {
    const h = first(c.body), f = fields(h);
    if (h.startsWith("[MONE-ASK]") && f.status === "cancel" && f.id === open.request) return { ok: false, reason: `相談 ${open.request} は取り消されています。記録しません` };
    if (isAnswerHead(h) && f.request === open.request && Number(f.round) === Number(open.round) && String(f.source) === String(open.source) && f.status !== "blocked") {
      return { ok: false, reason: `相談 ${open.request} round=${open.round} には、もう答えがあります。記録しません` };
    }
  }
  return { ok: true, send: open };
}

function recordBody({ request, round, source, tag }, answer) {
  return `[MONE-RECORD] request=${request} round=${round} source=${source} tag=${tag}\n`
    + "通常Chatの返答をモネがメールで受領しました。以下は返答の全文です。\n\n"
    // a quoted "@codex" would call Codex on the thread (2026-11-26, CUSTOM-INST-1): write the at sign full-width
    + String(answer).replace(/\s+$/, "").replace(/@(codex)/gi, "＠$1") + "\n\n次の担当: モネ (採否と改訂の検討)\n";
}

module.exports = { isAnswerHead, tagOf, newToken, openSend, planSend, planRecord, recordBody };
