"use strict";
// The permanent AMONE rules (CLAUDE.md) must exist and their numbers must match what the code enforces.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("CLAUDE.md holds the permanent rules", () => {
  const t = read("CLAUDE.md");
  for (const w of ["お金", "秘密", "回避しない", "やり直さない", "できた", "5,000字", "4,500字", "800字", "500字", "前の起こしメールから 15分", "返事が来たら、その見回りの予約はすぐ止める", "post.js", "consultPrNumber", "subscribe_pr_activity", "ChatGPT に聞く"]) {
    assert.ok(t.includes(w), `CLAUDE.md must mention ${w}`);
  }
});
test("the numbers in CLAUDE.md are the ones the code and tests enforce", () => {
  assert.match(read("scripts/post.js"), /const MAX_THREAD_CHARS = 4500;/);
  assert.match(read("test/instructions.test.js"), /const MAX_INSTRUCTION_CHARS = 4500;/);
  assert.match(read("test/instructions.test.js"), /const MAX_LAUNCH_CHARS = 500;/);
  assert.match(read("docs/amu-chat-instructions.md"), /800字以内/);
});
