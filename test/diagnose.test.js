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
  assert.ok(ng(diagnose(base({ comments: [ask("X1", "x".repeat(8100))] }))).includes("文字数"));
  // v21: answered asks of other ids are not read in full, so a long thread alone is not a problem
  const old = [{ body: "[MONE-ASK] id=Z9 lane=chat op=design round=1 status=open\n" + "z".repeat(6000), created_at: "2026-11-22T11:00:00Z" }, { body: "[AMU-ANSWER] request=Z9 round=1 source=1\nok", created_at: "2026-11-22T11:01:00Z" }];
  assert.ok(!ng(diagnose(base({ comments: [...old, ask("X1", "x".repeat(4600))] }))).includes("文字数"));
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

// Codex P2 on #90: a cancelled consultation is finished; never blame Amu or resend it.
test("a cancelled consultation ends the diagnosis without resending", () => {
  const r = diagnose(base({ comments: [ask("X1"), { body: "[MONE-ASK] id=X1 status=cancel\n取消", created_at: "2026-11-22T12:31:00Z" }] }));
  assert.strictEqual(r.side, "cancelled");
  assert.doesNotMatch(r.action, /出し直/);
});
// Codex P2 on #90: Amu answers a reply only after exactly one normal answer to the round before it, posted before the reply.
test("a reply without the previous round's answer (or posted before it) is a Mone-side ordering problem", () => {
  const reply = (r, at) => ({ body: `[MONE-REPLY] id=X1 round=${r}\n続き`, created_at: at });
  const ans = (r, at) => ({ body: `[AMU-ANSWER] request=X1 round=${r} source=1\nok`, created_at: at });
  const ok = diagnose(base({ round: 2, comments: [ask("X1"), ans(1, "2026-11-22T12:29:00Z"), reply(2, "2026-11-22T12:29:30Z")] }));
  assert.deepStrictEqual(ng(ok), []);
  const noPrev = diagnose(base({ round: 2, comments: [ask("X1"), reply(2, "2026-11-22T12:29:30Z")] }));
  assert.ok(ng(noPrev).includes("順番"));
  assert.strictEqual(noPrev.side, "mone");
  const early = diagnose(base({ round: 2, comments: [ask("X1"), reply(2, "2026-11-22T12:28:30Z"), ans(1, "2026-11-22T12:29:00Z")] }));
  assert.ok(ng(early).includes("順番"));
  const noAsk = diagnose(base({ round: 2, comments: [ans(1, "2026-11-22T12:29:00Z"), reply(2, "2026-11-22T12:29:30Z")] }));
  assert.ok(ng(noAsk).includes("順番"));
});
// Codex P2 on #90: an answer counts only when its source is the consultation comment's own number.
test("an answer or blocked report with another source does not count as answered", () => {
  const a = { ...ask("X1"), id: 100 };
  const other = diagnose(base({ comments: [a, { id: 101, body: "[AMU-ANSWER] request=X1 round=1 source=99\nok", created_at: "2026-11-22T12:29:00Z" }] }));
  assert.notStrictEqual(other.side, "none");
  const blockedOther = diagnose(base({ comments: [a, { id: 101, body: "[AMU-ANSWER] request=X1 round=1 source=99 status=blocked\nx", created_at: "2026-11-22T12:29:00Z" }] }));
  assert.notStrictEqual(blockedOther.side, "amu-blocked");
  const right = diagnose(base({ comments: [a, { id: 101, body: "[AMU-ANSWER] request=X1 round=1 source=100\nok", created_at: "2026-11-22T12:29:00Z" }] }));
  assert.strictEqual(right.side, "none");
});

// Codex P2 on #90 (deferred, fixed here): a malformed header is a Mone-side problem, not Amu's.
test("a malformed consultation header is reported as a Mone-side format problem", () => {
  const bad = { body: "[MONE-ASK] id=X1 lane=chat op=review round=2 status=open\n本文", created_at: "2026-11-22T12:30:00Z" };
  const r = diagnose(base({ comments: [bad] }));
  assert.ok(ng(r).includes("書式"));
  assert.strictEqual(r.side, "mone");
});
