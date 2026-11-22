"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { planAsk, planRequest } = require("../scripts/post");

const NOW = new Date("2026-11-17T12:00:00Z");
const ASK = "[MONE-ASK] id=T1 lane=chat op=design round=1 status=open\n本文\n";
const SHA = "abc123";
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString();
// deadline in JST: NOW is 21:00 JST on 11-17
const req = (deadline, sha = SHA, id = "R1") =>
  `[MONE-REQUEST] id=${id} lane=work op=review sha=${sha}\n⟦AMONE-WORK⟧\n期限: ${deadline}\n`;

test("ask ok, wake ok when no recent AMU post", () => {
  const r = planAsk(ASK, [], NOW);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.wake.ok, true);
});

test("ask ok, wake wait after a recent AMU post", () => {
  const r = planAsk(ASK, [{ body: "[AMU-REPLY] x", created_at: iso(-30000) }], NOW);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.wake.ok, false);
  assert.strictEqual(r.wake.waitSeconds, 270);
});

test("ask NG on bad header", () => {
  const r = planAsk("hello\n", [], NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /先頭行/);
});

test("request NG on sha mismatch", () => {
  const r = planRequest(req("2026-11-18 12:00"), "zzz999", [], NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /sha/);
});

test("request NG on duplicate id", () => {
  const r = planRequest(req("2026-11-18 12:00"), SHA, [{ body: `[MONE-REQUEST] id=R1 lane=work op=review sha=old\nx` }], NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /二重/);
});

test("request NG when deadline is over 3 days minus 1 hour", () => {
  // 21:00 JST 11-17 + 2d23h30m = 11-20 20:30 JST
  const r = planRequest(req("2026-11-20 20:30"), SHA, [], NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /3日/);
});

test("request ok", () => {
  const r = planRequest(req("2026-11-18 12:00"), SHA, [{ body: "[MONE-REQUEST] id=OTHER lane=work op=review sha=x" }], NOW);
  assert.strictEqual(r.ok, true);
});

// Codex review on PR #76: duplicate consult headers must be rejected (Amu ignores duplicates),
// while follow-up rounds and cancels stay allowed.
test("ask NG on duplicate initial ask or duplicate reply round; follow-ups allowed", () => {
  const prev = [{ body: "[MONE-ASK] id=T1 lane=chat op=design round=1 status=open\nx", created_at: iso(-600000) }];
  assert.strictEqual(planAsk(ASK, prev, NOW).ok, false);
  assert.match(planAsk(ASK, prev, NOW).reason, /二重/);
  const r2 = "[MONE-REPLY] id=T1 round=2\nx";
  assert.strictEqual(planAsk(r2, prev, NOW).ok, true);
  assert.strictEqual(planAsk(r2, [...prev, { body: r2, created_at: iso(-60000) }], NOW).ok, false);
  assert.strictEqual(planAsk("[MONE-ASK] id=T1 status=cancel\n", prev, NOW).ok, true);
});

// Codex review on PR #76 (2nd): duplicates must be checked against the whole history, not only the recent window.
test("fetchAll reads every page (page by page) and stops if there are too many pages", () => {
  const { fetchAll } = require("../scripts/post");
  const pages = { 1: Array(100).fill({ body: "a" }), 2: Array(100).fill({ body: "b" }), 3: [{ body: "[MONE-ASK] id=OLD round=1" }] };
  const runner = (args) => JSON.stringify(pages[Number(/[?&]page=(\d+)/.exec(args[1])[1])] || []);
  assert.strictEqual(fetchAll(23, runner).length, 201);
  assert.throws(() => fetchAll(23, () => JSON.stringify(Array(100).fill({ body: "x" }))), /多すぎ/);
});

// Regression (2026-11-22): PR #23 reached 360 comments and Amu could not read them all, so she stopped without answering.
// Before the thread gets that long, Mone must stop and move to a new thread instead of posting one more ask.
test("ask is refused when the thread already has 200 comments (move to a new thread)", () => {
  const many = Array.from({ length: 200 }, () => ({ body: "[AMU-ANSWER] x", created_at: iso(-86400000) }));
  const r = planAsk(ASK, many, NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /引っ越/);
  assert.strictEqual(planAsk(ASK, many.slice(1), NOW).ok, true);
});
test("request is refused the same way when its thread has 200 comments", () => {
  const many = Array.from({ length: 200 }, () => ({ body: "[AMU-RESULT] x" }));
  const r = planRequest(req("2026-11-18 12:00"), SHA, many, NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /引っ越/);
});
// Codex P2 on #85: a full thread must still accept cancellations, or a pending request stays actionable.
test("cancellations are still allowed when the thread has 200 comments", () => {
  const many = Array.from({ length: 200 }, () => ({ body: "x" }));
  assert.strictEqual(planAsk("[MONE-ASK] id=T1 status=cancel\n取消\n", many, NOW).ok, true);
  assert.strictEqual(planRequest("[MONE-REQUEST] id=R1 status=cancel\n取消\n", SHA, many, NOW).ok, true);
});

// 2026-11-22: Amu stopped on PR #32 with only 5 comments (about 8,500 characters); 3 comments (about 4,600) worked.
// Amu reads about 5,000 characters at once, so the whole thread is kept within 90% of that: 4,500 characters.
test("ask is refused when the thread plus the new post would exceed 4,500 characters", () => {
  const prev = [{ body: "あ".repeat(3500) }];
  const r = planAsk(ASK + "い".repeat(600), prev, NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /4500/);
  assert.match(r.reason, /引っ越/);
  assert.strictEqual(planAsk(ASK, prev, NOW).ok, true);
});
// The budget is for the Chat thread only: the Work request thread (PR #25) is read by Work, whose limit was not measured.
test("the character budget counts characters (not bytes) and applies to the Chat thread only", () => {
  assert.strictEqual(planAsk(ASK, [{ body: "漢".repeat(3600) }], NOW).ok, true);
  assert.strictEqual(planRequest(req("2026-11-18 12:00"), SHA, [{ body: "x".repeat(9000) }], NOW).ok, true);
});
test("a cancellation is allowed even when the character budget is used up", () => {
  assert.strictEqual(planAsk("[MONE-ASK] id=T1 status=cancel\n取消\n", [{ body: "x".repeat(5000) }], NOW).ok, true);
});
test("the consultation thread comes from the registry (one sandbox entry), so a move is one registry change", () => {
  const { askPr } = require("../scripts/post");
  const reg = (ps) => JSON.stringify({ projects: ps });
  const sb = (n) => ({ repo: "amukutsurogiwork-oss/ai-collab-sandbox", consultPrNumber: n });
  assert.strictEqual(askPr(reg([sb(33), { repo: "x/y" }])), 33);
  assert.throws(() => askPr(reg([{ repo: "x/y" }])), /1件だけ/);
  assert.throws(() => askPr(reg([sb(33), sb(34)])), /1件だけ/);
  assert.throws(() => askPr(reg([sb(0)])), /1件だけ/);
});
// Codex P2 on #86: every ask or reply waits for an answer of up to 800 characters, so the budget must keep room for them.
test("the budget reserves 800 characters for each answer still to come (pending ones and this post's own)", () => {
  // 3,000 used + 200 new + 800 for this post's answer = 4,000: ok
  assert.strictEqual(planAsk(ASK + "x".repeat(150), [{ body: "y".repeat(3000) }], NOW).ok, true);
  // one earlier ask still unanswered: +800 more = 4,800: refused
  const pending = [{ body: "[MONE-ASK] id=OLD lane=chat op=design round=1 status=open\n" + "y".repeat(2940) }];
  const r = planAsk(ASK + "x".repeat(150), pending, NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /回答/);
  // once that ask is answered, its reserve is released
  const answered = [{ body: "[MONE-ASK] id=OLD lane=chat op=design round=1 status=open\n" + "y".repeat(2600) }, { body: "[AMU-ANSWER] request=OLD round=1 source=1\nok" }];
  assert.strictEqual(planAsk(ASK + "x".repeat(150), answered, NOW).ok, true);
});
