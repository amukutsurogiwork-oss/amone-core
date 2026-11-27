#!/usr/bin/env node
"use strict";

// Checks the first line (and body) of a Mone consult comment. Usage: node scripts/check-ask.js <file>
const fs = require("node:fs");
const path = require("node:path");

function chatOps() {
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "collab", "registry.json"), "utf8"));
    const ops = new Set();
    for (const p of reg.projects || []) {
      if (Array.isArray(p.allowedLanes) && p.allowedLanes.includes("chat") && Array.isArray(p.allowedOperations)) {
        p.allowedOperations.forEach((o) => ops.add(o));
      }
    }
    if (ops.size) return ops;
  } catch (_) { /* fall through to default */ }
  return new Set(["design", "review"]);
}

// Returns null when fine, otherwise a one-line Japanese reason.
function checkAsk(text) {
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
  const first = lines[0].trim();
  const body = lines.slice(1).join("\n");
  const tag = (first.match(/^\[(MONE-[A-Z]+)\]/) || [])[1];
  if (!tag) return "先頭行が [MONE-ASK] / [MONE-REPLY] / [MONE-NOTE] のどれでもありません";
  if (/@codex/i.test(text)) return "半角の「@codex」が含まれています(全角「＠codex」にしてください)";
  if (tag === "MONE-NOTE") return /^\[MONE-NOTE\] id=\S+/.test(first) ? null : "[MONE-NOTE] の後に id=<相談ID> が必要です";
  const f = Object.fromEntries(first.replace(/^\[[^\]]+\]\s*/, "").split(/\s+/).filter(Boolean).map((kv) => {
    const i = kv.indexOf("=");
    return i < 0 ? [kv, ""] : [kv.slice(0, i), kv.slice(i + 1)];
  }));
  const keys = Object.keys(f).sort().join(",");
  if (!f.id) return "id=<相談ID> がありません";
  if (tag === "MONE-REPLY") {
    if (keys !== "id,round") return "[MONE-REPLY] の欄は id と round だけです";
    return f.round === "2" || f.round === "3" ? null : "[MONE-REPLY] の round は 2 か 3 だけです";
  }
  if (tag === "MONE-ASK") {
    if (f.status === "cancel") return keys === "id,status" ? null : "取消は [MONE-ASK] id=<相談ID> status=cancel だけです";
    // アムの設計 (Astra, 2026-11-26; 全種類に広げた 2026-11-27): an ask may allow a longer answer with limit=N (N up to 4000).
    if (f.limit !== undefined) {
      if (!/^[1-9][0-9]{0,3}$/.test(f.limit) || Number(f.limit) > 4000) return "limit= は 1〜4000 の数です";
    }
    if (keys.replace(",limit", "") !== "id,lane,op,round,status") return "[MONE-ASK] には id lane op round status の全欄が必要です";
    if (f.lane !== "chat") return "lane は chat だけです";
    if (!chatOps().has(f.op)) return `op=${f.op} は chat レーンで許されていません`;
    if (f.round !== "1") return "[MONE-ASK] の round は 1 だけです(追加の返事は [MONE-REPLY])";
    if (f.status !== "open") return "[MONE-ASK] の status は open か cancel です";
    return null;
  }
  return `知らない種類 [${tag}] です`;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.log("使い方: node scripts/check-ask.js <ファイル>"); process.exit(1); }
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (_) { console.log("ファイルを読めません"); process.exit(1); }
  const err = checkAsk(text);
  console.log(err || "OK");
  process.exit(err ? 1 : 0);
}

module.exports = { checkAsk };
