#!/usr/bin/env node
"use strict";

// One list of how far each consultation in the current thread has gone (よしひろさん OK 2026-11-23, 毎朝の提案③).
// Usage: node scripts/status.js
const { execFileSync } = require("node:child_process");

const first = (b) => String(b || "").split(/\r?\n/)[0].trim();
const fields = (line) => Object.fromEntries(line.replace(/^\[[^\]]+\]\s*/, "").split(/\s+/).filter((kv) => kv.includes("=")).map((kv) => kv.split("=")));

function statusRows(comments) {
  const byId = new Map();
  for (const c of comments || []) {
    const h = first(c.body), f = fields(h);
    if (h.startsWith("[MONE-ASK]") || h.startsWith("[MONE-REPLY]")) {
      const id = f.id; if (!id) continue;
      const e = byId.get(id) || { id, posts: [], cancelled: false };
      if (h.startsWith("[MONE-ASK]") && f.status === "cancel") e.cancelled = true;
      else e.posts.push({ c, round: h.startsWith("[MONE-ASK]") ? 1 : Number(f.round) });
      byId.set(id, e);
    }
  }
  const rows = [];
  for (const e of byId.values()) {
    const last = e.posts.sort((a, b) => a.round - b.round).pop();
    if (!last) { rows.push({ id: e.id, round: 0, stage: "取り消し", detail: "" }); continue; }
    const answers = (comments || []).filter((c) => {
      const h = first(c.body), f = fields(h);
      return h.startsWith("[AMU-ANSWER]") && f.request === e.id && Number(f.round) === last.round && (last.c.id === undefined || String(f.source) === String(last.c.id));
    });
    const m = /files=(\d+) sha=/.exec(last.c.body);
    const detail = [m ? `ファイル${m[1]}つ` : "", `投稿 ${last.c.created_at || "?"}`].filter(Boolean).join(" / ");
    const stage = e.cancelled ? "取り消し"
      : answers.some((a) => fields(first(a.body)).status !== "blocked") ? "答えあり"
      : answers.length ? "止まった報告"
      : "答え待ち";
    rows.push({ id: e.id, round: last.round, stage, detail });
  }
  return rows;
}

function main() {
  const post = require("./post");
  const rows = statusRows(post.fetchAll(post.askPr()));
  const jst = (iso) => new Date(Date.parse(iso)).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  for (const r of rows) console.log(`${r.stage}\t${r.id}\tround=${r.round}\t${r.detail.replace(/投稿 (\S+)/, (_, t) => "投稿 " + (t === "?" ? "?" : jst(t)))}`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = { statusRows };
