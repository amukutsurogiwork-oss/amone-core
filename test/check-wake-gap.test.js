"use strict";

// The wake mail must wait 2 minutes after Amu's last [AMU-ANSWER].
// Real case 2026-11-16: answer 04:31:48Z, wake sent 04:32:30Z (42s), Amu did not wake.
const test = require("node:test");
const assert = require("node:assert/strict");
const { wakeAllowed } = require("../scripts/check-wake-gap");

const ans = (t, body = "[AMU-ANSWER] x") => ({ body, created_at: t });

test("42 seconds after the answer is too early (tonight's case)", () => {
  const r = wakeAllowed([ans("2026-11-16T04:31:48Z")], new Date("2026-11-16T04:32:30Z"));
  assert.deepEqual(r, { ok: false, waitSeconds: 78 });
});

test("exactly 120 seconds and later is allowed", () => {
  const c = [ans("2026-11-16T04:31:48Z")];
  assert.deepEqual(wakeAllowed(c, new Date("2026-11-16T04:33:47Z")), { ok: false, waitSeconds: 1 });
  assert.equal(wakeAllowed(c, new Date("2026-11-16T04:33:48Z")).ok, true);
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
