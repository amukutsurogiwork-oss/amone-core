"use strict";
// Regression: screen-check.md kept an old instruction to "restore the freeze" after the freeze was abolished
// (docs/approval-policy.md v14). A timeout is now recorded as a stop and reported; nothing is auto-released or re-run.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("screen-check.md does not tell anyone to restore the freeze", () => {
  const doc = fs.readFileSync(path.join(__dirname, "..", "docs/work-ops/screen-check.md"), "utf8");
  assert.ok(!doc.includes("凍結を戻す"), "stale instruction '凍結を戻す' remains");
});
