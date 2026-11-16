"use strict";
// The Work `consult` procedure (reading Work's own run history, 2026-11-16) must stay read-only:
// no claim comment (a new PR #25 comment may start another run), exactly one result, no approval field,
// and it must not invent missing history.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("consult procedure is read-only, claim-free, one result, and does not guess missing history", () => {
  const doc = fs.readFileSync(path.join(__dirname, "..", "docs/work-ops/consult.md"), "utf8");
  assert.ok(doc.includes("着手の記録 (`[AMU-CLAIM]`) は**書かない**"));
  assert.ok(doc.includes("**1回だけ**"));
  assert.ok(doc.includes("「承認の記録」の欄は書かない"));
  assert.ok(doc.includes("履歴が読めない"));
  assert.ok(!doc.includes("承認の記録: "), "request template must not carry an approval field");
});
