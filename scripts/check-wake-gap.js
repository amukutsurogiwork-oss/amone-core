#!/usr/bin/env node
"use strict";

// Checks that 2+ minutes passed since Amu's last [AMU-ANSWER] before sending the wake mail.
// Usage: node scripts/check-wake-gap.js <comments.json>   (output of `gh api .../issues/23/comments --paginate`)
const fs = require("node:fs");

const GAP_SECONDS = 120;

function wakeAllowed(comments, now = new Date()) {
  let last = null;
  for (const c of comments || []) {
    if (typeof c.body !== "string" || !c.body.startsWith("[AMU-ANSWER]")) continue;
    const t = Date.parse(c.created_at);
    if (Number.isNaN(t)) continue;
    if (last === null || t > last) last = t;
  }
  if (last === null) return { ok: true };
  const elapsed = (now.getTime() - last) / 1000;
  if (elapsed >= GAP_SECONDS) return { ok: true };
  return { ok: false, waitSeconds: Math.ceil(GAP_SECONDS - elapsed) };
}

// `gh api --paginate` may print several arrays back to back ("][" ); join them.
function parseComments(text) {
  return JSON.parse(text.replace(/\]\s*\[/g, ","));
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.log("使い方: node scripts/check-wake-gap.js <コメントのJSONファイル>"); process.exit(1); }
  let comments;
  try { comments = parseComments(fs.readFileSync(file, "utf8")); } catch (_) { console.log("ファイルを読めません"); process.exit(1); }
  const r = wakeAllowed(comments, new Date());
  console.log(r.ok ? "OK" : `あと ${r.waitSeconds} 秒待つ`);
  process.exit(r.ok ? 0 : 1);
}

module.exports = { wakeAllowed };
