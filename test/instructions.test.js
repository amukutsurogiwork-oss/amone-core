"use strict";
// Regression: the Chat instruction pasted into the iPhone shortcut was cut at about 5,080 characters
// (observed twice on 2026-11-15: the delivered text ended mid-sentence), so the safety rules at the end never reached the AI.
// The instruction must stay short and end with a marker; each procedure file must also be short and end with a marker.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const MAX_INSTRUCTION_CHARS = 3500;   // well below the ~5,080 cut point observed
const MAX_PROCEDURE_CHARS = 3500;
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
test("each procedure file is short and ends with its marker", () => {
  const files = ["1-target-and-answer", "2-safety-and-review", "3-blocked-report"];
  files.forEach((f, i) => {
    const t = fs.readFileSync(path.join(root, "docs/amu-chat", `${f}.md`), "utf8").trim();
    assert.ok([...t].length <= MAX_PROCEDURE_CHARS, `${f} is ${[...t].length} chars`);
    assert.ok(t.endsWith(`【手順書の終わり ${i + 1}/3】`), `${f} end marker`);
  });
});
test("the instruction names all three procedure files", () => {
  const t = instruction();
  for (const f of ["1-target-and-answer", "2-safety-and-review", "3-blocked-report"]) assert.ok(t.includes(`docs/amu-chat/${f}.md`), f);
});
