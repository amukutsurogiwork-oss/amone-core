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

// Regression (Codex review on PR #56): the quiet section said "only step 1 is omitted", which left steps 2 and 3
// (open PR #23, report its state and comment count) in force while the same section forbids opening PR #23.
// A compliant Work run would stop on that conflict. The quiet section must replace steps 1-3 explicitly.
test("quiet screen-check replaces steps 1-3 explicitly and does not keep the PR #23 steps", () => {
  const doc = fs.readFileSync(path.join(__dirname, "..", "docs/work-ops/screen-check.md"), "utf8");
  const quiet = doc.slice(doc.indexOf("### 静かな読み取り試験"));
  assert.ok(quiet.length > 100, "quiet section missing");
  assert.ok(quiet.includes("手順1〜3の代わりに"), "quiet section must say it replaces steps 1-3");
  assert.ok(!quiet.includes("省くのは**手順1"), "quiet section still says only step 1 is omitted");
});
