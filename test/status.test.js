"use strict";
// よしひろさん OK (2026-11-23, 毎朝の提案③): one list showing how far each consultation has gone.
const test = require("node:test");
const assert = require("node:assert");
const { statusRows } = require("../scripts/status");

const c = (id, body, at) => ({ id, body, created_at: at });
const T = (m) => `2026-11-23T08:${String(m).padStart(2, "0")}:00Z`;

test("each consultation shows its stage: waiting, answered, blocked, cancelled", () => {
  const rows = statusRows([
    c(1, "[MONE-ASK] id=A lane=chat op=review round=1 status=open\nx", T(1)),
    c(2, "[AMU-ANSWER] request=A round=1 source=1\nok", T(2)),
    c(3, "[MONE-ASK] id=B lane=chat op=review round=1 status=open\nx", T(3)),
    c(4, "[MONE-ASK] id=C lane=chat op=review round=1 status=open\nx", T(4)),
    c(5, "[AMU-ANSWER] request=C round=1 source=4 status=blocked\n欠落", T(5)),
    c(6, "[MONE-ASK] id=D lane=chat op=review round=1 status=open\nx", T(6)),
    c(7, "[MONE-ASK] id=D status=cancel\n取消", T(7)),
  ]);
  const by = Object.fromEntries(rows.map((r) => [r.id, r.stage]));
  assert.deepStrictEqual(by, { A: "モネの判断待ち", B: "答え待ち", C: "止まった報告", D: "取り消し" });
});
test("the latest round is shown, and an answer counts only with the matching source", () => {
  const rows = statusRows([
    c(1, "[MONE-ASK] id=A lane=chat op=review round=1 status=open\nx", T(1)),
    c(2, "[AMU-ANSWER] request=A round=1 source=1\nok", T(2)),
    c(3, "[MONE-REPLY] id=A round=2\n続き", T(3)),
    c(4, "[AMU-ANSWER] request=A round=2 source=99\nok", T(4)),
  ]);
  assert.strictEqual(rows[0].round, 2);
  assert.strictEqual(rows[0].stage, "答え待ち");
});
test("a long consultation shows how many files it has", () => {
  const rows = statusRows([c(1, `[MONE-ASK] id=L lane=chat op=review round=1 status=open\n長文の相談です。files=3 sha=${"a".repeat(40)} path=consult/L/r1/`, T(1))]);
  assert.match(rows[0].detail, /ファイル3つ/);
});
// アムの設計 (2026-11-25/26, Astra): after Amu answers it is Mone's turn; a consultation is over only when Mone leaves a
// closing note that names the answer she judged: [MONE-NOTE] id=ID status=closed answer=<answer comment number>.
test("after an answer it is Mone's turn, and only a closing note naming that answer ends the consultation", () => {
  const base = [
    c(1, "[MONE-ASK] id=A lane=chat op=design round=1 status=open\nx", T(1)),
    c(2, "[AMU-ANSWER] request=A round=1 source=1\n反論", T(2)),
  ];
  assert.strictEqual(statusRows(base)[0].stage, "モネの判断待ち");
  assert.strictEqual(statusRows([...base, c(3, "[MONE-NOTE] id=A status=closed answer=99\n判断と理由", T(3))])[0].stage, "モネの判断待ち");
  assert.strictEqual(statusRows([...base, c(3, "[MONE-NOTE] id=A\n読みました", T(3))])[0].stage, "モネの判断待ち");
  assert.strictEqual(statusRows([...base, c(3, "[MONE-NOTE] id=A status=closed answer=2\n採った指摘と理由", T(3))])[0].stage, "おしまい");
});
