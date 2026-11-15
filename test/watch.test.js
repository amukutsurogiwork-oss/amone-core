"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { findNoResult, noticeBody } = require("../src/watch");

const BOT = { login: "github-actions[bot]", type: "Bot" };
const OWNER = { login: "amukutsurogiwork-oss", id: 7 };
const OPT = { ownerId: 7 };
const at = (min) => new Date(Date.UTC(2026, 10, 15, 0, min, 0)).toISOString();
const now = Date.UTC(2026, 10, 15, 0, 60, 0);
let seq = 100;
const c = (body, min, user = OWNER) => ({ id: ++seq, body, created_at: at(min), user, author_association: user === OWNER ? "OWNER" : "NONE" });

test("routed 30 min ago with no result gets one notice", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work op=x", 30, BOT)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), ["R1"]);
});
test("a result stops the notice", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 30, BOT), c("[AMU-RESULT] request=R1", 40)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), []);
});
test("too early: no notice", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 50, BOT)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), []);
});
test("claim after routed resets the clock", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[AMU-CLAIM] request=R1 許可ID=S", 50)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), []);
});
test("cancelled request is not flagged", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[AMONE-CANCELLED] request=R1 lane=work", 12, BOT)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), []);
});
test("an existing notice prevents a second one", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[WATCH-NORESULT] request=R1", 30, BOT)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), []);
});
test("forged markers from a non-bot are ignored for routed/cancelled/notice", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[AMONE-CANCELLED] request=R1", 12, OWNER), c("[WATCH-NORESULT] request=R1", 13, OWNER)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), ["R1"]);
});
test("bad ids, bad dates and non-arrays are ignored safely", () => {
  assert.deepEqual(findNoResult(null, now), []);
  assert.deepEqual(findNoResult([c("[AMONE-ROUTED] request=!!bad!! lane=work", 1, BOT)], now), []);
  assert.deepEqual(findNoResult([{ body: "[AMONE-ROUTED] request=R1", created_at: "x", user: BOT }], now), []);
});
test("at most three notices per run, and the body carries no secrets", () => {
  const cs = ["A", "B", "C", "D"].map((id) => c(`[AMONE-ROUTED] request=${id} lane=work`, 1, BOT));
  assert.equal(findNoResult(cs, now, 15, OPT).length, 3);
  assert.match(noticeBody("A"), /^\[WATCH-NORESULT\] request=A\n/);
});

test("a claim or result from someone who is not the owner is ignored", () => {
  const stranger = { login: "someone", id: 99 };
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[AMU-RESULT] request=R1", 20, stranger)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), ["R1"]);
  const fake = [c("[AMU-CLAIM] request=GHOST", 10, stranger)];
  assert.deepEqual(findNoResult(fake, now, 15, OPT), []);   // a claim alone never creates a notice
});
test("only Work-lane requests are watched, and ids use the intake's format", () => {
  const cs = [c("[AMONE-ROUTED] request=C1 lane=chat op=design", 1, BOT), c("[AMONE-ROUTED] request=R.1 lane=work op=x", 1, BOT), c("[AMONE-ROUTED] request=_R2 lane=work op=x", 1, BOT)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT).sort(), ["R.1", "_R2"]);
});
test("the notice never starts with [AMONE- (the intake would treat it as a broken record)", () => {
  const { NOTICE, noticeBody } = require("../src/watch");
  assert.ok(!NOTICE.startsWith("[AMONE-"));
  assert.ok(!noticeBody("A").startsWith("[AMONE-"));
});

test("the intake reader accepts the notice as a bot comment that is not its own (no halt)", () => {
  const { stateFromComments } = require("../src/intake");
  const { noticeBody } = require("../src/watch");
  const cs = [{ id: 1, body: noticeBody("R1"), user: { login: "github-actions[bot]", type: "Bot", id: 41898282 } }];
  assert.equal(stateFromComments(cs, "o/r#25#").broken, false);
});

test("a result posted BEFORE the routed record does not count as done", () => {
  const cs = [c("[AMU-RESULT] request=R1", 5), c("[AMONE-ROUTED] request=R1 lane=work", 30, BOT)];
  assert.deepEqual(findNoResult(cs, now, 15, OPT), ["R1"]);
});
