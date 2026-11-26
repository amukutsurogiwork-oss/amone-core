"use strict";
// 2026-11-26: アムChat は毎回、全会話コメントを取ったところで返事を終える (相談の本文や資料を取りに行く前)。
// よしひろさん「まとめの仕組みを作って」。次に答える相談の本文・前の回・資料を、1つのコメント [MONE-PACKET] にまとめておく。
const test = require("node:test");
const assert = require("node:assert");
const { buildPacket, packetComment } = require("../scripts/packet.js");

const c = (id, body) => ({ id, body });

test("the packet holds the oldest waiting ask, verbatim, with its source number", () => {
  const comments = [
    c(1, "[MONE-ASK] id=A lane=chat op=design round=1 status=open\n本文A"),
    c(2, "[AMU-ANSWER] request=A round=1 source=1\n答えA"),
    c(3, "[MONE-ASK] id=B lane=chat op=design round=1 status=open\n本文B"),
    c(4, "[MONE-ASK] id=C lane=chat op=design round=1 status=open\n本文C"),
  ];
  const p = buildPacket(comments, () => { throw new Error("no files"); });
  assert.match(p, /^\[MONE-PACKET\] id=B round=1 source=3 files=0\n/);
  assert.ok(p.includes("【相談本文 source=3】\n[MONE-ASK] id=B lane=chat op=design round=1 status=open\n本文B\n"));
  assert.ok(!p.includes("本文C") && !p.includes("本文A"));
  assert.ok(p.trimEnd().endsWith("【まとめの終わり id=B round=1】"));
});

test("cancelled asks are skipped; nothing waiting gives id=none", () => {
  const comments = [c(1, "[MONE-ASK] id=A lane=chat op=design round=1 status=open\nx"), c(2, "[MONE-ASK] id=A status=cancel")];
  const p = buildPacket(comments, () => "");
  assert.match(p, /^\[MONE-PACKET\] id=none\n/);
  assert.ok(p.trimEnd().endsWith("【まとめの終わり id=none】"));
});

test("a later round carries the earlier rounds of the same id (asks and answers)", () => {
  const comments = [
    c(1, "[MONE-ASK] id=A lane=chat op=design round=1 status=open\n一回目"),
    c(2, "[AMU-ANSWER] request=A round=1 source=1\n答え1"),
    c(3, "[MONE-REPLY] id=A round=2\n二回目"),
  ];
  const p = buildPacket(comments, () => "");
  assert.match(p, /^\[MONE-PACKET\] id=A round=2 source=3 files=0\n/);
  assert.ok(p.includes("【前の回 comment=1】\n[MONE-ASK] id=A lane=chat op=design round=1 status=open\n一回目"));
  assert.ok(p.includes("【前の回 comment=2】\n[AMU-ANSWER] request=A round=1 source=1\n答え1"));
});

test("attachments are read at the pinned sha, part by part, and put in whole", () => {
  const sha = "a".repeat(40);
  const comments = [c(7, `[MONE-ASK] id=L lane=chat op=review round=1 status=open\n長文の相談です。files=2 sha=${sha} path=consult/L/r1/\n問い`)];
  const seen = [];
  const p = buildPacket(comments, (path, ref) => { seen.push(`${path}@${ref}`); return `中身 ${path}`; });
  assert.deepEqual(seen, [`consult/L/r1/part-1.md@${sha}`, `consult/L/r1/part-2.md@${sha}`]);
  assert.match(p, new RegExp(`^\\[MONE-PACKET\\] id=L round=1 source=7 files=2 sha=${sha}\\n`));
  assert.ok(p.includes("【資料 part-1/2】\n中身 consult/L/r1/part-1.md\n") && p.includes("【資料 part-2/2】\n中身 consult/L/r1/part-2.md\n"));
});

test("the packet comment itself is never taken as an ask, and the existing one is found for editing", () => {
  const comments = [c(1, "[MONE-PACKET] id=none\nx"), c(2, "[MONE-ASK] id=A lane=chat op=design round=1 status=open\nq"), c(3, "[MONE-PACKET] id=old\ny")];
  assert.match(buildPacket(comments, () => ""), /^\[MONE-PACKET\] id=A round=1 source=2/);
  assert.equal(packetComment(comments).id, 3);
});

// Codex (PR #114): a [MONE-PACKET] comment by someone else must not be chosen for editing (nor block the owner's packet).
test("only the owner's packet comment is chosen for editing", () => {
  const own = (id, body) => ({ id, body, user: { login: "amukutsurogiwork-oss" } });
  const other = (id, body) => ({ id, body, user: { login: "someone-else" } });
  assert.equal(packetComment([own(1, "[MONE-PACKET] id=none"), other(2, "[MONE-PACKET] id=x")]).id, 1);
  assert.equal(packetComment([other(2, "[MONE-PACKET] id=x")]), null);
});
