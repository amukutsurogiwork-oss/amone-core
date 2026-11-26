#!/usr/bin/env node
"use strict";

// Reads Amu's reply mail (the body as Gmail returns it) and checks it against an expected text, character by character.
// Why (2026-11-26, アストラの正式化案 ③): in the mail route, ChatGPT's answer comes back by mail. To claim "the full text
// arrived", compare the real body, not the preview. Only line breaks are unified and explicit <br> / character
// references restored; spaces and trailing newlines are kept. Any other markup is held (not guessed).
// Usage: node scripts/mail-reply.js <reply-file> <html|text> [expected-file]

const NAMED = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", "#39": "'" };

function decodeRefs(s) {
  return s.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+|#39);/g, (m, r) => {
    if (r[0] === "#" && r !== "#39") {
      const cp = r[1] === "x" || r[1] === "X" ? parseInt(r.slice(2), 16) : parseInt(r.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return Object.hasOwn(NAMED, r) ? NAMED[r] : m;
  });
}

// kind: "html" (Gmail htmlBody) or "text" (plain body). Returns { ok, text } or { ok: false, reason }.
function normalizeReply(raw, kind) {
  let s = String(raw ?? "");
  if (kind === "html") {
    s = s.replace(/<br\s*\/?>/gi, "\n");
    if (/<[a-zA-Z/!][^>]*>/.test(s)) return { ok: false, reason: "判定できない形式です (改行以外のタグがあります)。保留します" };
    // A named reference we do not know is held, not compared as changed text (Codex on PR #115).
    const unknown = (s.match(/&([a-zA-Z]+);/g) || []).find((m) => !Object.hasOwn(NAMED, m.slice(1, -1)))
      // numeric references whose HTML meaning is not the plain code point are held too (Codex on PR #115)
      || (s.match(/&#(x[0-9a-fA-F]+|X[0-9a-fA-F]+|\d+);/g) || []).find((m) => {
        const r = m.slice(2, -1);
        const cp = r[0] === "x" || r[0] === "X" ? parseInt(r.slice(1), 16) : parseInt(r, 10);
        return !(cp > 0 && cp <= 0x10ffff) || (cp >= 0x80 && cp <= 0x9f) || (cp >= 0xd800 && cp <= 0xdfff);
      });
    if (unknown) return { ok: false, reason: `読めない文字参照 (${unknown}) があります。保留します` };
    s = decodeRefs(s);
  }
  return { ok: true, text: s.replace(/\r\n?/g, "\n") };
}

// Line-by-line comparison. Reports the first differing line (1-based) and what kind of difference it is.
function compareText(expected, actual) {
  const e = String(expected).replace(/\r\n?/g, "\n").split("\n");
  const a = String(actual).split("\n");
  const n = Math.min(e.length, a.length);
  for (let i = 0; i < n; i++) {
    if (e[i] !== a[i]) return { ok: false, line: i + 1, kind: "changed", expected: e[i], actual: a[i] };
  }
  if (a.length < e.length) return { ok: false, line: a.length + 1, kind: "missing", expected: e[a.length], actual: undefined };
  if (a.length > e.length) return { ok: false, line: e.length + 1, kind: "extra", expected: undefined, actual: a[e.length] };
  return { ok: true, lines: e.length };
}

if (require.main === module) {
  const fs = require("node:fs");
  const [file, kind, exp] = process.argv.slice(2);
  if (!file || !["html", "text"].includes(kind)) { console.log("使い方: node scripts/mail-reply.js <返信ファイル> <html|text> [期待ファイル]"); process.exit(1); }
  const r = normalizeReply(fs.readFileSync(file, "utf8"), kind);
  if (!r.ok) { console.log("HOLD " + r.reason); process.exit(1); }
  if (!exp) { console.log(`READ ${[...r.text].length}字 ${r.text.split("\n").length}行`); process.exit(0); }
  const c = compareText(fs.readFileSync(exp, "utf8"), r.text);
  console.log(c.ok ? `MATCH ${c.lines}行 ${[...r.text].length}字` : `DIFF ${c.line}行目 ${c.kind}`);
  process.exit(c.ok ? 0 : 1);
}

module.exports = { normalizeReply, compareText };
