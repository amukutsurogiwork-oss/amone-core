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
  assert.strictEqual(r.wake.waitSeconds, 90);
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
