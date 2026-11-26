"use strict";
// 2026-11-26 メール連携 (アストラの正式化案 ③): 届いた答えのメール本文を、そのまま機械で照合する。
// 試験②の答え (4,815字、534行) は HTML だけで届き、行は <br/> でつながっていた。
// fixtures/mail-long-reply.html はその形 (期待全文の各行を <br/> でつないだもの) を写したもの。
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { normalizeReply, compareText } = require("../scripts/mail-reply.js");

const fx = (f) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const expected = fx("mail-long-expected.txt");
const html = fx("mail-long-reply.html");

test("the 4,815-character reply of test 2 matches its expected text exactly", () => {
  const r = normalizeReply(html, "html");
  assert.equal(r.ok, true);
  assert.equal([...r.text].length, 4815);
  assert.equal(r.text.split("\n").length, 534);
  assert.deepEqual(compareText(expected, r.text), { ok: true, lines: 534 });
});

test("one missing character is found, with its line", () => {
  const broken = html.replace("棚札300は青。", "棚札300は青");
  const c = compareText(expected, normalizeReply(broken, "html").text);
  assert.equal(c.ok, false);
  assert.equal(c.line, 303); // 1行目「9」、2行目は最初の資料行、棚札001〜264、「足した」の行のあと
  assert.equal(c.kind, "changed");
});

test("two swapped lines, an extra line and a missing line are found", () => {
  const lines = expected.split("\n");
  const swapped = [...lines]; [swapped[10], swapped[11]] = [swapped[11], swapped[10]];
  assert.deepEqual(compareText(expected, swapped.join("\n")), { ok: false, line: 11, kind: "changed", expected: lines[10], actual: lines[11] });
  const extra = [...lines]; extra.splice(5, 0, "余分な行");
  assert.equal(compareText(expected, extra.join("\n")).kind, "changed");
  assert.equal(compareText(expected, lines.slice(0, -1).join("\n")).kind, "missing");
  assert.equal(compareText(expected, [...lines, "余分"].join("\n")).kind, "extra");
});

test("plain text: CRLF and CR become LF; nothing else is trimmed", () => {
  assert.equal(normalizeReply("a\r\nb\rc  \n", "text").text, "a\nb\nc  \n");
});

test("html: br forms and character references are restored; other markup is held, not guessed", () => {
  assert.deepEqual(normalizeReply("A&amp;B<br>C&lt;D&gt;<br />E&quot;F&#39;G&nbsp;H&#12354;", "html"), { ok: true, text: "A&B\nC<D>\nE\"F'G Hあ" });
  const held = normalizeReply("<p>本文</p>", "html");
  assert.equal(held.ok, false);
  assert.match(held.reason, /判定できない/);
});

// Codex (PR #115): an HTML reference we do not decode (&copy; &mdash; &hellip; ...) must not be reported as a content
// difference. Hold it instead of guessing.
test("html: an unknown named character reference is held, not compared", () => {
  const r = normalizeReply("&copy; 2026 &mdash; done&hellip;", "html");
  assert.equal(r.ok, false);
  assert.match(r.reason, /読めない文字参照/);
});
