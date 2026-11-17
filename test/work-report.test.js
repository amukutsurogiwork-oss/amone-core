"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReport } = require("../scripts/work-report");

const bot = { login: "github-actions[bot]" };
const owner = { login: "owner" };
const c = (t, body, user = owner) => ({ created_at: t, body, user });

// JST = UTC+9. now = 2026-11-17 12:00 JST
const now = new Date("2026-11-17T03:00:00Z");
const comments = [
  c("2026-11-17T01:00:00Z", "[MONE-REQUEST] id=A1 lane=work"),
  c("2026-11-17T01:00:30Z", "[AMONE-ROUTED] request=A1", bot),
  c("2026-11-17T01:20:00Z", "[AMU-RESULT] request=A1\n停止理由: 手順書が見つからない"),
  c("2026-11-17T02:00:00Z", "[MONE-REQUEST] id=B2 lane=work"),
  c("2026-11-17T02:00:30Z", "[AMONE-ROUTED] request=B2", bot),
  c("2026-11-17T02:10:00Z", "[MONE-REQUEST] id=B2 status=cancel"),
  c("2026-11-17T02:30:00Z", "bot note", bot),
];

test("report counts and times", () => {
  const r = buildReport(comments, now, 48);
  assert.match(r, /依頼の数: 2/);
  assert.match(r, /結果の数: 1/);
  assert.match(r, /結果なし: 1/);
  assert.match(r, /中央値\): 20/);
  assert.match(r, /最大\): 20/);
  assert.match(r, /起きたかもしれない回数: 7/);
  assert.match(r, /依頼で起きた回数: 2/);
  assert.match(r, /むだに起きたかもしれない回数: 5/);
  assert.match(r, /依頼 A1: 依頼 10:00 \/ 受付 10:00 \/ 結果 10:20 \/ 20分 \/ 手順書が見つからない/);
  assert.match(r, /依頼 B2: 依頼 11:00 \/ 受付 11:00 \/ 結果なし/);
});

test("window excludes old comments and shows date", () => {
  const old = [c("2026-11-10T01:00:00Z", "[MONE-REQUEST] id=Z9 lane=work")];
  assert.match(buildReport(old, now, 48), /依頼の数: 0/);
  assert.match(buildReport(old, now, 24 * 10), /11\/10 10:00/);
});

// A stop notice names the request comment (comment=<id>), not request=<ID> (FORM-RESUME-1).
test("stop notice matched by comment id counts as intake", () => {
  const { buildReport } = require("../scripts/work-report");
  const now = new Date("2026-11-17T12:00:00Z");
  const c = [
    { id: 55, user: { login: "x" }, created_at: "2026-11-17T10:00:00Z", body: "[MONE-REQUEST] id=S1 lane=work op=read sha=a" },
    { id: 56, user: { login: "github-actions[bot]" }, created_at: "2026-11-17T10:00:20Z", body: "[AMONE-STOPPED] reason=x comment=55" },
  ];
  assert.ok(!/受付 なし/.test(buildReport(c, now, 48)));
});
