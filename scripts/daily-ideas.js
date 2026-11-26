#!/usr/bin/env node
"use strict";

// Read-only: list the headings of Amu's past daily ideas (PR #23), so a new morning's idea does not repeat.
// Usage: node scripts/daily-ideas.js [--days 14]
const { fetchAll, run } = require("./post");

// Past consultation threads (moved on 2026-11-22) plus the current one from the registry, so old ideas are not repeated.
const PAST_ASK_PRS = [23, 32, 33, 34, 35];
const ID_RE = /^DAILY-IDEA-(\d{4})(\d{2})(\d{2})$/;

function firstLine(text) {
  return String(text).replace(/^﻿/, "").split(/\r?\n/)[0].trim();
}

function fields(line) {
  const out = {};
  for (const kv of line.replace(/^\[[^\]]+\]\s*/, "").split(/\s+/).filter(Boolean)) {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

function dateOf(id) {
  const m = ID_RE.exec(id || "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const toHalf = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

// Numbered lines ("1. ", "2) ", "３．", "**1.**") are the headings of the ideas.
function headingsOf(body) {
  const out = [];
  for (const raw of String(body).split(/\r?\n/).slice(1)) {
    const m = /^\s*(?:\*\*)?([0-9０-９]+)\s*[.．)）、](?:\*\*)?\s*(.+)$/.exec(raw);
    if (!m) continue;
    const text = toHalf(m[2]).replace(/\*\*/g, "").trim();
    if (text) out.push(text);
  }
  return out;
}

function collectIdeas(comments, { days = 14, now = new Date() } = {}) {
  const limit = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const byDate = new Map();
  const get = (date) => {
    if (!byDate.has(date)) byDate.set(date, { date, asked: false, answered: false, headings: [] });
    return byDate.get(date);
  };
  for (const c of comments || []) {
    if (!c || typeof c.body !== "string") continue;
    const head = firstLine(c.body);
    const f = fields(head);
    if (head.startsWith("[MONE-ASK]")) {
      const date = dateOf(f.id);
      if (date && date >= limit) get(date).asked = true;
    } else if (head.startsWith("[AMU-ANSWER]") || head.startsWith("[MONE-RECORD]")) {
      const date = dateOf(f.request);
      if (!date || date < limit || f.status === "blocked") continue;
      const d = get(date);
      d.answered = true;
      (d.rounds = d.rounds || []).push({ round: Number(f.round) || 0, order: d.rounds.length, list: headingsOf(c.body) });
    }
  }
  // Gather headings from every answer of the day in round order; the same heading counts once.
  for (const d of byDate.values()) {
    const seen = new Set();
    for (const r of (d.rounds || []).sort((a, b) => a.round - b.round || a.order - b.order)) {
      for (const h of r.list) if (!seen.has(h)) { seen.add(h); d.headings.push(h); }
    }
    delete d.rounds;
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

function formatIdeas(list) {
  if (!list.length) return "(この期間の毎朝の提案はありません)";
  const lines = [];
  for (const d of list) {
    if (!d.answered) { lines.push(`${d.date}  (アムの返事なし)`); continue; }
    if (!d.headings.length) { lines.push(`${d.date}  (見出しが読み取れません)`); continue; }
    d.headings.forEach((h, i) => lines.push(`${i === 0 ? d.date : "          "}  ${i + 1}. ${h}`));
  }
  return lines.join("\n");
}

function readIdeas({ days, now, runner } = {}) {
  const gh = runner || run;
  return formatIdeas(collectIdeas([...new Set([...PAST_ASK_PRS, require("./post").askPr()])].flatMap((pr) => fetchAll(pr, gh)), { days, now }));
}

function parseArgs(argv) {
  let days = 14;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--days") return { error: `知らない引数: ${argv[i]}` };
    const n = Number(argv[++i]);
    if (!Number.isInteger(n) || n < 1 || n > 365) return { error: "--days は 1〜365 の整数です" };
    days = n;
  }
  return { days };
}

function main(argv) {
  const a = parseArgs(argv);
  if (a.error) { console.log("使い方: node scripts/daily-ideas.js [--days 14]\n" + a.error); return 1; }
  try { console.log(readIdeas({ days: a.days })); } catch (_) {
    console.log("NG: GitHub から情報を取れませんでした");
    return 1;
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { collectIdeas, formatIdeas, readIdeas, parseArgs, headingsOf };
