"use strict";
// 2026-11-26 メール連携 (アストラの正式化案 ②⑤): iPhone に出す答え待ちのメールは、全案件で1通だけ。
// 送る前に [MONE-SEND] を相談PRに残し、答えを受け取ったら [MONE-RECORD] で記録して枠を空ける。
// 照合札そのものは公開しない (相談PRには札の SHA-256 の先頭16字 = tag だけを書く)。
const test = require("node:test");
const assert = require("node:assert");
const { tagOf, openSend, planSend, planRecord, recordBody, isAnswerHead } = require("../scripts/mail-route.js");

const c = (id, body) => ({ id, body });
const ask = c(10, "[MONE-ASK] id=A lane=chat op=design round=1 status=open\n問い");

test("the tag is the first 16 hex characters of the token's SHA-256, and never the token itself", () => {
  const t = tagOf("abc");
  assert.match(t, /^[0-9a-f]{16}$/);
  assert.equal(t, "ba7816bf8f01cfea");
});

test("one mail at a time: a send without its record keeps the slot busy; a record or a release frees it", () => {
  assert.equal(openSend([ask]), null);
  assert.equal(planSend([ask]).ok, true);
  assert.equal(planSend([ask]).target.id, "A");
  const sent = c(11, "[MONE-SEND] request=A round=1 source=10 tag=ba7816bf8f01cfea");
  assert.equal(openSend([ask, sent]).tag, "ba7816bf8f01cfea");
  assert.equal(planSend([ask, sent]).ok, false);
  assert.match(planSend([ask, sent]).reason, /答え待ちのメールが1通あります/);
  const rec = c(12, "[MONE-RECORD] request=A round=1 source=10 tag=ba7816bf8f01cfea\n答え");
  assert.equal(openSend([ask, sent, rec]), null);
  const rel = c(12, "[MONE-SEND] request=A round=1 source=10 tag=ba7816bf8f01cfea status=release");
  assert.equal(openSend([ask, sent, rel]), null);
});

test("nothing to send when no ask is waiting", () => {
  const p = planSend([c(1, "[MONE-ASK] id=A lane=chat op=design round=1 status=open\nq"), c(2, "[MONE-ASK] id=A status=cancel")]);
  assert.equal(p.ok, false);
  assert.match(p.reason, /送る相談がありません/);
});

test("a reply is recorded only for the open send with the same tag, and only once", () => {
  const sent = c(11, "[MONE-SEND] request=A round=1 source=10 tag=ba7816bf8f01cfea");
  assert.equal(planRecord([ask, sent], "ba7816bf8f01cfea").ok, true);
  assert.match(planRecord([ask, sent], "0000000000000000").reason, /照合札が合いません/);
  assert.match(planRecord([ask], "ba7816bf8f01cfea").reason, /照合札が合いません/);
  const cancel = c(12, "[MONE-ASK] id=A status=cancel");
  assert.match(planRecord([ask, sent, cancel], "ba7816bf8f01cfea").reason, /取り消されています/);
  const answered = c(12, "[AMU-ANSWER] request=A round=1 source=10\n先の答え");
  assert.match(planRecord([ask, sent, answered], "ba7816bf8f01cfea").reason, /もう答えがあります/);
});

test("the record says it is Monet's receipt of the normal Chat's reply, with the reply whole", () => {
  const b = recordBody({ request: "A", round: 1, source: 10, tag: "ba7816bf8f01cfea" }, "答えの全文\n2行目");
  assert.ok(b.startsWith("[MONE-RECORD] request=A round=1 source=10 tag=ba7816bf8f01cfea\n"));
  assert.ok(b.includes("通常Chatの返答をモネがメールで受領"));
  assert.ok(b.includes("答えの全文\n2行目"));
});

test("a [MONE-RECORD] counts as an answer everywhere an [AMU-ANSWER] does", () => {
  assert.equal(isAnswerHead("[AMU-ANSWER] request=A round=1 source=10"), true);
  assert.equal(isAnswerHead("[MONE-RECORD] request=A round=1 source=10 tag=x"), true);
  assert.equal(isAnswerHead("[MONE-SEND] request=A round=1 source=10 tag=x"), false);
  const { pendingKeys } = require("../scripts/post.js");
  const rec = c(12, "[MONE-RECORD] request=A round=1 source=10 tag=ba7816bf8f01cfea\n答え");
  assert.equal(pendingKeys([ask]).size, 1);
  assert.equal(pendingKeys([ask, rec]).size, 0);
});
