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
