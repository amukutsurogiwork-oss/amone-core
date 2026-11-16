"use strict";
// FORM-RESUME-3/4 (2026-11-16): the deadline was set to "3 days later, a few minutes after posting",
// so Work stopped because it was 1m33s past the 3-day limit. A Work request must be checked before posting.
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkRequest } = require("../scripts/check-request");

const at = (jst) => new Date(jst.replace(" ", "T") + ":00+09:00");
const req = (deadline, extra = "") => `[MONE-REQUEST] id=X1 lane=work op=form-resume stage=read sha=075f7ebebb4cfe550afb0088fa6e165ce598f0ed
⟦AMONE-WORK⟧
期限: ${deadline} (日本時間)
${extra}`;

test("FORM-RESUME-3 case: deadline just past 3 days from posting is rejected", () => {
  assert.match(checkRequest(req("2026-11-19 23:10"), at("2026-11-16 23:08")), /3日/);
});

test("a deadline well inside 3 days passes", () => {
  assert.equal(checkRequest(req("2026-11-19 00:00"), at("2026-11-16 23:08")), null);
});

test("a deadline in the past is rejected", () => {
  assert.match(checkRequest(req("2026-11-16 22:00"), at("2026-11-16 23:08")), /過ぎて/);
});

test("missing deadline, missing mark, bad first line, or a literal codex mention are rejected", () => {
  assert.match(checkRequest(req("").replace(/期限:.*\n/, ""), at("2026-11-16 23:08")), /期限/);
  assert.match(checkRequest(req("2026-11-18 00:00").replace("⟦AMONE-WORK⟧\n", ""), at("2026-11-16 23:08")), /AMONE-WORK/);
  assert.match(checkRequest("hello\n" + req("2026-11-18 00:00"), at("2026-11-16 23:08")), /先頭行/);
  assert.match(checkRequest(req("2026-11-18 00:00", "@" + "codex"), at("2026-11-16 23:08")), /codex/);
});

// Codex review on PR #67: the documented cancel format has no lane/op and must pass.
test("the documented cancellation format passes", () => {
  assert.equal(checkRequest("[MONE-REQUEST] id=X1 status=cancel\n", at("2026-11-16 23:08")), null);
});
