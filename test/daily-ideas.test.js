"use strict";

// Mone reads yesterday's ideas before proposing new ones (read only, gh is faked).
const test = require("node:test");
const assert = require("node:assert/strict");
const { collectIdeas, formatIdeas, readIdeas, parseArgs } = require("../scripts/daily-ideas");

const ask = (d) => ({ body: `[MONE-ASK] id=DAILY-IDEA-${d} lane=chat op=design round=1 status=open\n案を出してください`, created_at: "x" });
const ans = (d, text, extra = "", round = 1) => ({ body: `[AMU-ANSWER] request=DAILY-IDEA-${d} round=${round} source=1${extra}\n${text}`, created_at: "x" });
const NOW = new Date("2026-11-20T00:00:00Z");

test("collects asks and answers per day, newest day first", () => {
  const days = collectIdeas([ask("20261118"), ans("20261118", "1. 案A\n説明"), ask("20261119"), ans("20261119", "1. 案B\n2. 案C")], { days: 14, now: NOW });
  assert.deepEqual(days.map((d) => d.date), ["2026-11-19", "2026-11-18"]);
  assert.deepEqual(days[0].headings, ["案B", "案C"]);
  assert.deepEqual(days[1].headings, ["案A"]);
});

test("only days inside the range are kept", () => {
  const days = collectIdeas([ans("20261001", "1. 古い案"), ans("20261110", "1. 新しい案")], { days: 14, now: NOW });
  assert.deepEqual(days.map((d) => d.date), ["2026-11-10"]);
});

test("headings: numbered lines only, bold and number styles stripped", () => {
  const body = "前置き\n1. **案A**: 中身\n  詳細\n2) 案B\n３．案C\n- 箇条書きは対象外";
  const [d] = collectIdeas([ans("20261119", body)], { days: 14, now: NOW });
  assert.deepEqual(d.headings, ["案A: 中身", "案B", "案C"]);
});

test("a day with an ask but no answer is listed as unanswered", () => {
  const [d] = collectIdeas([ask("20261119")], { days: 14, now: NOW });
  assert.equal(d.answered, false);
  assert.deepEqual(d.headings, []);
  assert.match(formatIdeas([d]), /2026-11-19.*返事なし/);
});

test("blocked answers and unrelated comments are not ideas", () => {
  const days = collectIdeas([ask("20261119"), ans("20261119", "1. 理由", " status=blocked"), { body: "[AMU-ANSWER] request=OTHER-20261119\n1. x" }, { body: 5 }, { body: "[MONE-ASK] id=DAILY-IDEA-bad" }], { days: 14, now: NOW });
  assert.deepEqual(days.map((d) => [d.date, d.answered]), [["2026-11-19", false]]);
});

test("a later answer adds new headings to the day; same heading is kept once", () => {
  const [d] = collectIdeas([ans("20261119", "1. 古い"), ans("20261119", "1. 新しい\n2. 古い", "", 2)], { days: 14, now: NOW });
  assert.deepEqual(d.headings, ["古い", "新しい"]);
});

test("a later answer without numbered lines does not erase round 1 headings", () => {
  const [d] = collectIdeas([ans("20261119", "1. 元の案"), ans("20261119", "補足の説明だけ", "", 2)], { days: 14, now: NOW });
  assert.deepEqual(d.headings, ["元の案"]);
  assert.match(formatIdeas([d]), /元の案/);
});

test("headings are gathered in round order even if comments arrive out of order", () => {
  const [d] = collectIdeas([ans("20261119", "1. 三番目", "", 3), ans("20261119", "1. 一番目", "", 1), ans("20261119", "1. 二番目", "", 2)], { days: 14, now: NOW });
  assert.deepEqual(d.headings, ["一番目", "二番目", "三番目"]);
});

test("readIdeas reads through the fake gh runner and writes nothing", () => {
  const calls = [];
  const runner = (args) => { calls.push(args); return JSON.stringify(args[1].includes("page=1") ? [ans("20261119", "1. 案B")] : []); };
  const out = readIdeas({ days: 14, now: NOW, runner });
  assert.match(out, /2026-11-19/);
  assert.match(out, /案B/);
  assert.ok(calls.every((a) => a[0] === "api" && !a.includes("-F") && !a.includes("POST")));
});

test("parseArgs: --days defaults to 14 and rejects nonsense", () => {
  assert.equal(parseArgs([]).days, 14);
  assert.equal(parseArgs(["--days", "3"]).days, 3);
  assert.equal(parseArgs(["--days", "0"]).error !== undefined, true);
});

// Codex (PR #117): an answer received by mail and recorded by Monet ([MONE-RECORD]) counts like [AMU-ANSWER].
test("a mailed answer recorded as [MONE-RECORD] is read for the headings", () => {
  const rec = { body: "[MONE-RECORD] request=DAILY-IDEA-20261119 round=1 source=1 tag=0123456789abcdef\n通常Chatの返答をモネがメールで受領しました。以下は返答の全文です。\n\n1. 案D\n2. 案E", created_at: "x" };
  const days = collectIdeas([ask("20261119"), rec], { days: 14, now: NOW });
  assert.equal(days[0].answered, true);
  assert.deepEqual(days[0].headings, ["案D", "案E"]);
});
