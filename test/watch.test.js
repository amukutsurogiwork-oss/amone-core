"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { findNoResult, noticeBody } = require("../src/watch");

const BOT = { login: "github-actions[bot]" };
const OWNER = { login: "amukutsurogiwork-oss" };
const at = (min) => new Date(Date.UTC(2026, 10, 15, 0, min, 0)).toISOString();
const now = Date.UTC(2026, 10, 15, 0, 60, 0);
const c = (body, min, user = OWNER) => ({ body, created_at: at(min), user });

test("routed 30 min ago with no result gets one notice", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work op=x", 30, BOT)];
  assert.deepEqual(findNoResult(cs, now), ["R1"]);
});
test("a result stops the notice", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 30, BOT), c("[AMU-RESULT] request=R1", 40)];
  assert.deepEqual(findNoResult(cs, now), []);
});
test("too early: no notice", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 50, BOT)];
  assert.deepEqual(findNoResult(cs, now), []);
});
test("claim after routed resets the clock", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[AMU-CLAIM] request=R1 許可ID=S", 50)];
  assert.deepEqual(findNoResult(cs, now), []);
});
test("cancelled request is not flagged", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[AMONE-CANCELLED] request=R1 lane=work", 12, BOT)];
  assert.deepEqual(findNoResult(cs, now), []);
});
test("an existing notice prevents a second one", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[AMONE-NORESULT] request=R1", 30, BOT)];
  assert.deepEqual(findNoResult(cs, now), []);
});
test("forged markers from a non-bot are ignored for routed/cancelled/notice", () => {
  const cs = [c("[AMONE-ROUTED] request=R1 lane=work", 10, BOT), c("[AMONE-CANCELLED] request=R1", 12, OWNER), c("[AMONE-NORESULT] request=R1", 13, OWNER)];
  assert.deepEqual(findNoResult(cs, now), ["R1"]);
});
test("bad ids, bad dates and non-arrays are ignored safely", () => {
  assert.deepEqual(findNoResult(null, now), []);
  assert.deepEqual(findNoResult([c("[AMONE-ROUTED] request=!!bad!! lane=work", 1, BOT)], now), []);
  assert.deepEqual(findNoResult([{ body: "[AMONE-ROUTED] request=R1", created_at: "x", user: BOT }], now), []);
});
test("at most three notices per run, and the body carries no secrets", () => {
  const cs = ["A", "B", "C", "D"].map((id) => c(`[AMONE-ROUTED] request=${id} lane=work`, 1, BOT));
  assert.equal(findNoResult(cs, now).length, 3);
  assert.match(noticeBody("A"), /^\[AMONE-NORESULT\] request=A\n/);
});
