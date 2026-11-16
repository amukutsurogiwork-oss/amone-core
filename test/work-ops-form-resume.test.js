"use strict";
// The Work `form-resume` procedure (finish the half-made inquiry form, 2026-11-16) must never create a new form,
// keep read/verify claim-free and approval-free, keep the claim step for change stages, and never auto re-run.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const doc = fs.readFileSync(path.join(__dirname, "..", "docs/work-ops/form-resume.md"), "utf8");
const section = (start, end) => {
  const i = doc.indexOf(start);
  assert.ok(i >= 0, `missing ${start}`);
  const j = end ? doc.indexOf(end, i + start.length) : doc.length;
  return doc.slice(i, j < 0 ? doc.length : j);
};

test("form-resume has exactly the four stages", () => {
  for (const s of ["stage=read", "stage=questions", "stage=settings", "stage=verify"]) assert.ok(doc.includes(s), s);
  const found = new Set(doc.match(/stage=[a-z]+/g));
  assert.deepEqual([...found].sort(), ["stage=questions", "stage=read", "stage=settings", "stage=verify"]);
});

test("form-resume never creates a new form", () => {
  assert.ok(doc.includes("新しいフォームを作らない"));
});

test("read and verify stages are read-only and claim-free", () => {
  const read = section("### stage=read", "### stage=questions");
  const verify = section("### stage=verify", "## 報告");
  for (const s of [read, verify]) {
    assert.ok(s.includes("`[AMU-CLAIM]` は書かない"));
    assert.ok(s.includes("何も変更しない"));
  }
});

test("questions and settings keep the claim step", () => {
  const q = section("### stage=questions", "### stage=settings");
  const st = section("### stage=settings", "### stage=verify");
  assert.ok(q.includes("`[AMU-CLAIM] request=<ID>` を**1回**書く"));
  assert.ok(q.includes("先の予約があれば"));
  assert.ok(st.includes("`[AMU-CLAIM]` の手順は"));
});

test("read/verify request template carries no approval record; change stages do", () => {
  const tpl = section("```\n[MONE-REQUEST] id=<ID> lane=work op=form-resume stage=<read|verify>", "`stage=questions` と `stage=settings` の依頼");
  assert.ok(!tpl.includes("承認の記録"), "read/verify template must not carry an approval field");
  const chg = section("`stage=questions` と `stage=settings` の依頼", "**承認の記録について**");
  assert.ok(chg.includes("承認の記録:"));
  assert.ok(doc.includes("`read` と `verify` の依頼には、承認の記録の欄を書かない"));
});

test("no automatic re-run; next request starts from stage=read", () => {
  assert.ok(doc.includes("自動で再実行しない"));
  assert.ok(doc.includes("必ず `stage=read` から"));
});

test("doc never contains the forbidden mention string", () => {
  assert.ok(!doc.includes("@" + "codex"));
  assert.ok(!/https?:\/\//.test(doc));
});
