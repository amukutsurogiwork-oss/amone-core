#!/usr/bin/env node
"use strict";

// Read-only report: how many requests woke Work on sandbox PR #25, and how many wakes were wasted.
// Reads GitHub only. Posts nothing.
const { fetchAll } = require("./post");

const REQUEST_PR = 25;
const BOT = "github-actions[bot]";

function first(c) {
  return String((c && c.body) || "").replace(/^﻿/, "").split(/\r?\n/)[0].trim();
}

function field(line, key) {
  const m = line.match(new RegExp(`(?:^|\\s)${key}=(\\S+)`));
  return m ? m[1] : null;
}

function jst(date) {
  return new Date(date.getTime() + 9 * 3600 * 1000);
}

function fmt(iso, now) {
  const d = jst(new Date(iso));
  const n = jst(now);
  const p = (x) => String(x).padStart(2, "0");
  const hm = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  const same = d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
  return same ? hm : `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${hm}`;
}

function reason(body) {
  const lines = String(body || "").split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean);
  const hit = lines.find((l) => l.includes("停止理由"));
  const line = (hit || lines[0] || "").replace(/^[-・*\s]+/, "").replace(/^停止理由\s*[:：]?\s*/, "");
  return Array.from(line).slice(0, 40).join("");
}

function buildReport(comments, now, hours = 48) {
  const from = now.getTime() - hours * 3600 * 1000;
  const t = (c) => new Date(c.created_at).getTime();
  const inWin = comments.filter((c) => t(c) >= from && t(c) <= now.getTime());
  const reqs = inWin.filter((c) => /^\[MONE-REQUEST\] id=\S+/.test(first(c)) && field(first(c), "status") !== "cancel");
  const out = [`Work 起動の報告 (直近 ${hours} 時間)`];
  const mins = [];
  for (const r of reqs) {
    const id = field(first(r), "id");
    const after = (c) => t(c) >= t(r);
    const routed = comments.find((c) => after(c) && c.user && c.user.login === BOT && /^\[AMONE-(ROUTED|STOPPED)\]/.test(first(c)) && (field(first(c), "request") === id || (r.id != null && field(first(c), "comment") === String(r.id))));
    const result = comments.find((c) => after(c) && /^\[AMU-RESULT\]/.test(first(c)) && field(first(c), "request") === id);
    let line = `- 依頼 ${id}: 依頼 ${fmt(r.created_at, now)}`;
    line += routed ? ` / 受付 ${fmt(routed.created_at, now)}` : " / 受付 なし";
    if (result) {
      const m = Math.round((t(result) - t(r)) / 60000);
      mins.push(m);
      line += ` / 結果 ${fmt(result.created_at, now)} / ${m}分 / ${reason(result.body)}`;
    } else {
      line += " / 結果なし";
    }
    out.push(line);
  }
  if (!reqs.length) out.push("- 依頼なし");
  mins.sort((a, b) => a - b);
  const mid = mins.length ? (mins.length % 2 ? mins[(mins.length - 1) / 2] : (mins[mins.length / 2 - 1] + mins[mins.length / 2]) / 2) : null;
  const wake = inWin.length;
  out.push("");
  out.push(`依頼の数: ${reqs.length}`);
  out.push(`結果の数: ${mins.length}`);
  out.push(`結果なし: ${reqs.length - mins.length}`);
  out.push(`結果までの分 (中央値): ${mid === null ? "なし" : mid}`);
  out.push(`結果までの分 (最大): ${mins.length ? mins[mins.length - 1] : "なし"}`);
  out.push(`Work が起きたかもしれない回数: ${wake}`);
  out.push(`依頼で起きた回数: ${reqs.length}`);
  out.push(`むだに起きたかもしれない回数: ${wake - reqs.length}`);
  return out.join("\n");
}

function main(argv) {
  let hours = 48;
  const i = argv.indexOf("--hours");
  if (i >= 0) {
    hours = Number(argv[i + 1]);
    if (!(hours > 0)) {
      console.error("NG: --hours には 0 より大きい数を指定してください");
      return 1;
    }
  }
  console.log(buildReport(fetchAll(REQUEST_PR), new Date(), hours));
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { buildReport };
