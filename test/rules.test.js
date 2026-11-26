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
  for (const w of ["お金", "秘密", "回避しない", "やり直さない", "できた", "5,000字", "4,500字", "800字", "500字", "返事が来たら、その見回りの予約はすぐ止める", "時刻は日本時間だけ", "事後報告", "scripts/diagnose.js", "post.js", "consultPrNumber", "subscribe_pr_activity", "ChatGPT に聞く", "日本語だけ", "コピーできる枠", "選べる返事", "scripts/mail-send.js send", "1分ごと", "**15分** で打ち切る"]) {
    assert.ok(t.includes(w), `CLAUDE.md must mention ${w}`);
  }
});
test("the numbers in CLAUDE.md are the ones the code and tests enforce", () => {
  assert.match(read("scripts/post.js"), /const MAX_READ_CHARS = 8000;/);
  assert.ok(!/MAX_THREAD_CHARS/.test(read("scripts/post.js")));
  assert.ok(read("CLAUDE.md").includes("スレッド全体の字数には上限を置かない"));
  assert.ok(read("CLAUDE.md").includes("**4,000字まで**") && /Number\(f\.limit\) > 4000/.test(read("scripts/check-ask.js")));
  assert.ok(read("CLAUDE.md").includes("8,000字まで"));
  assert.match(read("test/instructions.test.js"), /const MAX_INSTRUCTION_CHARS = 4500;/);
  assert.match(read("test/instructions.test.js"), /const MAX_LAUNCH_CHARS = 500;/);
  assert.match(read("docs/amu-chat-instructions.md"), /800字以内/);
});
