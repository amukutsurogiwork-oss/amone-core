"use strict";
// Regression: the Chat instruction pasted into the iPhone shortcut was cut (observed twice on 2026-11-15: the delivered text
// ended mid-sentence), so the safety rules at the end never reached the AI.
// Measured on 2026-11-15 with a numbered test text: the delivered text is cut at exactly 5,000 characters (newlines, spaces
// and symbols all count). The working limit is 90% of that: 4,500 characters. The instruction must also end with a marker
// so that the AI (and this test) can tell when it was cut.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const MAX_INSTRUCTION_CHARS = 4500;   // 90% of the measured 5,000-character limit
const INSTRUCTION_END = "【指示文の終わり 第14版】";

function instruction() {
  const doc = fs.readFileSync(path.join(root, "docs/shortcut-amu-launch.md"), "utf8");
  const a = doc.indexOf("```") + 3;
  const b = doc.indexOf("```", a);
  assert.ok(a > 2 && b > a, "instruction code block not found");
  return doc.slice(a, b).trim();
}

test("the Chat instruction is short enough to be delivered whole", () => {
  assert.ok([...instruction()].length <= MAX_INSTRUCTION_CHARS, `instruction is ${[...instruction()].length} chars`);
});
test("the Chat instruction ends with the end marker", () => {
  assert.ok(instruction().endsWith(INSTRUCTION_END));
});
test("the Chat instruction mentions the end marker rule near its start", () => {
  assert.ok(instruction().slice(0, 400).includes(INSTRUCTION_END));
});

// The ChatGPT custom instruction for Amu (docs/deployed/amu-custom-instructions.md): short and ends with a marker.
test("the Amu custom instruction is short and ends with its end marker", () => {
  const doc = fs.readFileSync(path.join(root, "docs/deployed/amu-custom-instructions.md"), "utf8");
  const a = doc.indexOf("```") + 3;
  const b = doc.indexOf("```", a);
  assert.ok(a > 2 && b > a);
  const t = doc.slice(a, b).trim();
  assert.ok([...t].length <= MAX_INSTRUCTION_CHARS, `custom instruction is ${[...t].length} chars`);
  assert.ok(t.endsWith("【カスタム指示の終わり 第2版】"));
  // fail-closed: the pasted block itself must tell Amu to stop when the end marker is missing (near its start)
  const head = t.slice(0, 200);
  assert.ok(head.includes("【カスタム指示の終わり 第2版】") && head.includes("見えないとき") && head.includes("止まる"));
});
