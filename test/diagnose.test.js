"use strict";
// 2026-11-22 よしひろさん:「15分返事がなかったら何が悪いかチェックして改善する機能をつけたい」.
// diagnose() looks at everything Mone can see and says whose side the problem is on.
const test = require("node:test");
const assert = require("node:assert");
const { diagnose } = require("../scripts/diagnose");

const NOW = new Date("2026-11-22T12:50:00Z");
const SHA = "a".repeat(40);
const pr = { state: "open", title: "[AMONE-CHAT] AMONE 相談スレッド4", headSha: SHA };
const ask = (id, extra = "") => ({ body: `[MONE-ASK] id=${id} lane=chat op=review round=1 status=open\n${extra}`, created_at: "2026-11-22T12:30:00Z" });
const base = (over = {}) => ({ id: "X1", round: 1, comments: [ask("X1")], pr, wakeSentAt: "2026-11-22T12:35:00Z", now: NOW, ...over });
const ng = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);

test("an answer means nothing to fix", () => {
  const r = diagnose(base({ comments: [ask("X1"), { body: "[AMU-ANSWER] request=X1 round=1 source=1\nok", created_at: "2026-11-22T12:40:00Z" }] }));
  assert.strictEqual(r.side, "none");
});
test("a blocked report is Amu's stop: read the reason", () => {
  const r = diagnose(base({ comments: [ask("X1"), { body: "[AMU-ANSWER] request=X1 round=1 source=1 status=blocked\n欠落", created_at: "2026-11-22T12:40:00Z" }] }));
  assert.strictEqual(r.side, "amu-blocked");
  assert.match(r.action, /理由/);
});
test("Mone-side problems are found: missing post, over budget, closed thread, stale long-ask sha, no wake mail, wake too soon", () => {
  assert.deepStrictEqual(ng(diagnose(base({ comments: [] }))), ["相談の書き込み"]);
  assert.ok(ng(diagnose(base({ comments: [ask("X1", "x".repeat(4600))] }))).includes("文字数"));
  assert.ok(ng(diagnose(base({ pr: { ...pr, state: "closed" } }))).includes("相談の場所"));
  assert.ok(ng(diagnose(base({ pr: { ...pr, title: "other" } }))).includes("相談の場所"));
  assert.ok(ng(diagnose(base({ comments: [ask("X1", `files=2 sha=${"b".repeat(40)} path=consult/X1/r1/`)] }))).includes("長文の版"));
  assert.ok(ng(diagnose(base({ wakeSentAt: null }))).includes("起こしメール"));
  const soon = base({ comments: [{ body: "[AMU-ANSWER] request=OLD round=1 source=9\nok", created_at: "2026-11-22T12:33:00Z" }, ask("X1")] });
  assert.ok(ng(diagnose(soon)).includes("起こしメール"));
  for (const r of [diagnose(base({ comments: [] })), diagnose(base({ wakeSentAt: null }))]) {
    assert.strictEqual(r.side, "mone");
    assert.match(r.action, /1回だけ/);
  }
});
test("when everything on Mone's side is fine, it is Amu's or the shortcut's side: ask to look at the screen", () => {
  const r = diagnose(base());
  assert.deepStrictEqual(ng(r), []);
  assert.strictEqual(r.side, "amu");
  assert.match(r.action, /画面/);
});
