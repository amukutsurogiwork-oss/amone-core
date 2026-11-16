#!/usr/bin/env node
"use strict";

// Checks a Mone Work request before posting. Usage: node scripts/check-request.js <file>
// The deadline must be in the future and at most 3 days after posting, with a 12-hour margin (owner, 2026-11-17),
// because Work compares it with the comment's posting time (FORM-RESUME-3 stopped 1m33s over).
const fs = require("node:fs");

const MARGIN_MS = 12 * 60 * 60 * 1000;
const LIMIT_MS = 3 * 24 * 60 * 60 * 1000;

// Returns null when fine, otherwise a one-line Japanese reason.
function checkRequest(text, now = new Date()) {
  const s = String(text).replace(/^﻿/, "");
  const first = s.split(/\r?\n/)[0].trim();
  if (/@codex/i.test(s)) return "半角の「@codex」が含まれています";
  if (/^\[MONE-REQUEST\] id=\S+ status=cancel\s*$/.test(first)) return null;
  if (!/^\[MONE-REQUEST\] id=\S+ lane=work op=\S+/.test(first)) return "先頭行が [MONE-REQUEST] id=… lane=work op=… ではありません";
  if (!s.includes("⟦AMONE-WORK⟧")) return "⟦AMONE-WORK⟧ の印がありません";
  const m = s.match(/^期限:\s*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/m);
  if (!m) return "期限: YYYY-MM-DD HH:MM (日本時間) がありません";
  const deadline = new Date(`${m[1]}T${m[2]}:00+09:00`);
  if (Number.isNaN(deadline.getTime())) return "期限の日付が読めません";
  if (deadline.getTime() <= now.getTime()) return "期限が、もう過ぎています";
  if (deadline.getTime() > now.getTime() + LIMIT_MS - MARGIN_MS) return "期限が、投稿から3日(余裕12時間)を超えています";
  return null;
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error("usage: node scripts/check-request.js <file>"); process.exit(2); }
  const reason = checkRequest(fs.readFileSync(file, "utf8"));
  if (reason) { console.error("NG: " + reason); process.exit(1); }
  console.log("OK");
}

module.exports = { checkRequest };
