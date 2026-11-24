"use strict";
// Long consultations are split into numbered files that Amu reads one by one (SLOTS-20261122, Amu's design):
// every file is at most 4,500 characters, carries id/round/part k of N on its first line and an end marker on its last,
// the parts joined back give the original body exactly, and the number of parts has a ceiling.
const test = require("node:test");
const assert = require("node:assert");
const { splitParts, partPath, markerComment, MAX_PARTS, MAX_PART_CHARS } = require("../scripts/post-long");
const len = (s) => [...s].length;
// the exact text between the first line (label) and the last line (end marker)
const inner = (p) => p.slice(p.indexOf("\n") + 1, p.lastIndexOf("\n"));
const body = (n) => Array.from({ length: n }, (_, i) => `${i + 1}行目 ` + "あ".repeat(80)).join("\n");

test("each part is at most 4,500 characters and is labelled k of N with an end marker", () => {
  const parts = splitParts("ID1", 1, body(150));
  assert.ok(parts.length >= 3);
  parts.forEach((p, i) => {
    assert.ok(len(p) <= MAX_PART_CHARS, `part ${i + 1} is ${len(p)} chars`);
    const lines = p.split("\n");
    assert.strictEqual(lines[0], `[MONE-PART] id=ID1 round=1 part=${i + 1}/${parts.length}`);
    assert.strictEqual(lines[lines.length - 1], `【MONE-PART 終わり id=ID1 round=1 part=${i + 1}/${parts.length}】`);
  });
});
test("joining the parts gives back the original body exactly", () => {
  const b = body(150);
  assert.strictEqual(splitParts("ID1", 1, b).map(inner).join(""), b);
});
test("a very long line is cut inside the line, still within the limit", () => {
  const b = "い".repeat(10000);
  const parts = splitParts("ID2", 2, b);
  assert.ok(parts.every((p) => len(p) <= MAX_PART_CHARS));
  assert.strictEqual(parts.map(inner).join(""), b);
});
test("too many parts is refused instead of posting", () => {
  assert.strictEqual(MAX_PARTS, 6);
  assert.throws(() => splitParts("ID3", 1, "う".repeat(4400 * 7)), /6/);
});
test("files live at a fixed path and the comment names the count and the commit", () => {
  assert.strictEqual(partPath("ID1", 2, 3), "consult/ID1/r2/part-3.md");
  const c = markerComment("[MONE-ASK] id=ID1 lane=chat op=design round=1 status=open", "ID1", 1, 3, "abc1234def", "要約");
  const lines = c.split("\n");
  assert.strictEqual(lines[0], "[MONE-ASK] id=ID1 lane=chat op=design round=1 status=open");
  assert.match(c, /files=3 sha=abc1234def path=consult\/ID1\/r1\//);
  assert.ok(len(c) <= 800);
});
// SLOTS-20261122 round 2 (Amu): the path is built from the ask's ID and round, so the ID must use only safe characters.
test("the consultation ID must use only letters, digits and hyphens", () => {
  assert.throws(() => splitParts("../x", 1, "a"), /ID/);
  assert.throws(() => splitParts("a/b", 1, "a"), /ID/);
  assert.ok(splitParts("BOOTH-D1B-20261122", 1, "a").length === 1);
});

// Codex P2 on #87: the written file must itself stay within 4,500 characters (no extra trailing newline).
test("the files to write are within 4,500 characters exactly as written", () => {
  const { partFiles } = require("../scripts/post-long");
  const files = partFiles("ID4", 1, "い".repeat(10000));
  assert.ok(files.length >= 3);
  for (const f of files) assert.ok(len(f.content) <= MAX_PART_CHARS, `${f.path} is ${len(f.content)} chars`);
  assert.deepStrictEqual(files.map((f) => f.path), files.map((_, i) => `consult/ID4/r1/part-${i + 1}.md`));
});

// Codex P2 on #87: format, duplicate and budget checks run before anything is pushed,
// and a new long ask is refused while an earlier long ask is unanswered (pushing would change the head it names).
test("a long ask is checked before pushing: bad header, duplicate, budget, and a pending long ask all stop it", () => {
  const { planLong } = require("../scripts/post-long");
  const NOW = new Date("2026-11-22T07:00:00Z");
  const ok = "[MONE-ASK] id=L1 lane=chat op=design round=1 status=open\n" + "本文\n".repeat(2000);
  assert.strictEqual(planLong(ok, [], NOW).ok, true);
  assert.strictEqual(planLong("hello\n本文", [], NOW).ok, false);
  assert.strictEqual(planLong(ok, [{ body: "[MONE-ASK] id=L1 lane=chat op=design round=1 status=open\nx" }], NOW).ok, false);
  assert.match(planLong(ok, [{ body: "[MONE-ASK] id=L9 lane=chat op=design round=1 status=open\n" + "x".repeat(7800) }], NOW).reason, /8000/);
  const pendingLong = [{ body: "[MONE-ASK] id=L0 lane=chat op=design round=1 status=open\n長文の相談です。files=2 sha=" + "a".repeat(40) + " path=consult/L0/r1/" }];
  const r = planLong(ok, pendingLong, NOW);
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /L0/);
  const answered = pendingLong.concat([{ body: "[AMU-ANSWER] request=L0 round=1 source=1\nok" }]);
  assert.strictEqual(planLong(ok, answered, NOW).ok, true);
});

// TRIAL2-20261122 (Amu): Mone reads back what was pushed and checks the head before posting the marker.
test("read-back check: every file must come back exactly, and the thread head must be the pushed commit", () => {
  const { verifyPushed } = require("../scripts/post-long");
  const files = [{ path: "consult/A/r1/part-1.md", content: "x" }, { path: "consult/A/r1/part-2.md", content: "y" }];
  const sha = "a".repeat(40);
  assert.strictEqual(verifyPushed(files, { "consult/A/r1/part-1.md": "x", "consult/A/r1/part-2.md": "y" }, sha, sha).ok, true);
  assert.match(verifyPushed(files, { "consult/A/r1/part-1.md": "x" }, sha, sha).reason, /part-2/);
  assert.match(verifyPushed(files, { "consult/A/r1/part-1.md": "x", "consult/A/r1/part-2.md": "z" }, sha, sha).reason, /part-2/);
  assert.match(verifyPushed(files, { "consult/A/r1/part-1.md": "x", "consult/A/r1/part-2.md": "y" }, sha, "b".repeat(40)).reason, /head/);
});
