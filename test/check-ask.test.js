"use strict";

// Mone's consult comment header must be exact (2026-11-15: round=2 was written as MONE-ASK and Amu could not answer).
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkAsk } = require("../scripts/check-ask");

test("the first ask, a reply (round 2 or 3), a cancel and a NOTE pass", () => {
  assert.equal(checkAsk("[MONE-ASK] id=X lane=chat op=review round=1 status=open\n本文"), null);
  assert.equal(checkAsk("[MONE-REPLY] id=X round=2\n本文"), null);
  assert.equal(checkAsk("[MONE-REPLY] id=X round=3"), null);
  assert.equal(checkAsk("[MONE-ASK] id=X status=cancel"), null);
  assert.equal(checkAsk("[MONE-NOTE] id=X\n連絡です"), null);
});

test("tonight's mistake: MONE-ASK with round=2 is refused", () => {
  assert.notEqual(checkAsk("[MONE-ASK] id=X lane=chat op=review round=2 status=open"), null);
});

test("reply round must be 2 or 3; ask needs every field and a known op", () => {
  assert.notEqual(checkAsk("[MONE-REPLY] id=X round=4"), null);
  assert.notEqual(checkAsk("[MONE-ASK] id=X lane=chat op=review round=1"), null);
  assert.notEqual(checkAsk("[MONE-ASK] id=X lane=chat op=nonsense round=1 status=open"), null);
});

test("half-width @codex in the body is refused, full-width is fine", () => {
  const head = "[MONE-ASK] id=X lane=chat op=design round=1 status=open\n";
  assert.notEqual(checkAsk(head + "説明: @codex"), null);
  assert.equal(checkAsk(head + "説明: ＠codex"), null);
});

test("half-width @codex is refused even in a MONE-NOTE", () => {
  assert.notEqual(checkAsk("[MONE-NOTE] id=X\n連絡です @codex"), null);
  assert.equal(checkAsk("[MONE-NOTE] id=X\n連絡です ＠codex"), null);
});

test("limit=N is allowed on any chat op (1..4000), not only design", () => {
  const h = (op, l) => `[MONE-ASK] id=X lane=chat op=${op} round=1 status=open limit=${l}\n本文`;
  assert.equal(checkAsk(h("review", 1500)), null);
  assert.equal(checkAsk(h("design", 4000)), null);
  assert.notEqual(checkAsk(h("review", 4001)), null);
  assert.notEqual(checkAsk(h("review", 0)), null);
});
