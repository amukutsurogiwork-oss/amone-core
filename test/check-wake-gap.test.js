"use strict";

// The wake mail must wait 5 minutes after Amu's last [AMU-...] post (2 minutes until 2026-11-22).
// Real case 2026-11-16: answer 04:31:48Z, wake sent 04:32:30Z (42s), Amu did not wake.
const test = require("node:test");
const assert = require("node:assert/strict");
const { wakeAllowed } = require("../scripts/check-wake-gap");

const ans = (t, body = "[AMU-ANSWER] x") => ({ body, created_at: t });

test("42 seconds after the answer is too early (tonight's case)", () => {
  const r = wakeAllowed([ans("2026-11-16T04:31:48Z")], new Date("2026-11-16T04:32:30Z"));
  assert.deepEqual(r, { ok: false, waitSeconds: 258 });
});

test("exactly 300 seconds and later is allowed", () => {
  const c = [ans("2026-11-16T04:31:48Z")];
  assert.deepEqual(wakeAllowed(c, new Date("2026-11-16T04:36:47Z")), { ok: false, waitSeconds: 1 });
  assert.equal(wakeAllowed(c, new Date("2026-11-16T04:36:48Z")).ok, true);
  assert.equal(wakeAllowed(c, new Date("2026-11-16T05:00:00Z")).ok, true);
});

test("uses the newest [AMU-ANSWER] only; other comments are ignored", () => {
  const c = [
    ans("2026-11-16T04:00:00Z"),
    ans("2026-11-16T04:31:48Z"),
    { body: "[MONE-ASK] hello [AMU-ANSWER]", created_at: "2026-11-16T04:32:00Z" },
  ];
  assert.equal(wakeAllowed(c, new Date("2026-11-16T04:32:30Z")).ok, false);
});

test("no [AMU-ANSWER] means ok", () => {
  assert.equal(wakeAllowed([], new Date()).ok, true);
  assert.equal(wakeAllowed([{ body: "hi", created_at: "2026-11-16T04:32:00Z" }], new Date()).ok, true);
});

// Real case 2026-11-16 14:50:48 JST: Amu's last post was [AMU-CONSULT], checker said OK after ~30s.
test("any [AMU-...] post counts, not only [AMU-ANSWER]", () => {
  const now = new Date("2026-11-16T05:51:15Z");
  for (const body of ["[AMU-CONSULT] id=X", "[AMU-REPORT] id=X", "[AMU-RESULT] id=X"]) {
    const r = wakeAllowed([{ body, created_at: "2026-11-16T05:50:45Z" }], now);
    assert.deepEqual(r, { ok: false, waitSeconds: 270 }, body);
  }
});

test("newest [AMU-...] wins over an older [AMU-ANSWER]; [MONE-] posts are ignored", () => {
  const c = [
    ans("2026-11-16T05:00:00Z"),
    { body: "[AMU-CONSULT] id=X", created_at: "2026-11-16T05:50:45Z" },
    { body: "[MONE-ASK] y", created_at: "2026-11-16T05:51:10Z" },
  ];
  assert.equal(wakeAllowed(c, new Date("2026-11-16T05:51:15Z")).ok, false);
  assert.equal(wakeAllowed(c, new Date("2026-11-16T05:55:45Z")).ok, true);
});

// 2026-11-22: a wake mail sent about 2 minutes after Amu's last answer did not start her; one sent 11 minutes later did.
test("the wake mail waits 5 minutes after Amu's last post", () => {
  const { wakeAllowed } = require("../scripts/check-wake-gap");
  const now = new Date("2026-11-22T07:00:00Z");
  const at = (m) => [{ body: "[AMU-ANSWER] x", created_at: new Date(now.getTime() - m * 60000).toISOString() }];
  assert.strictEqual(wakeAllowed(at(3), now).ok, false);
  assert.strictEqual(wakeAllowed(at(5), now).ok, true);
});
