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
  for (const w of ["お金", "秘密", "回避しない", "やり直さない", "できた", "5,000字", "4,500字", "800字", "500字", "返事が来たら、その見回りの予約はすぐ止める", "時刻は日本時間だけ", "事後報告", "scripts/diagnose.js", "post.js", "consultPrNumber", "subscribe_pr_activity", "ChatGPT に聞く", "日本語だけ", "コピーできる枠", "選べる返事", "scripts/mail-send.js send", "1分ごと", "**15分** で打ち切る", "一覧の表示だけで決めない", "get_thread で直接開き"]) {
    assert.ok(t.includes(w), `CLAUDE.md must mention ${w}`);
  }
});
test("CLAUDE.md names the old-route documents so a new window does not pick them up (2026-11-28)", () => {
  const t = read("CLAUDE.md");
  for (const w of ["古い道の文書は使わない", "docs/amu-chat-instructions.md", "docs/shortcut-amu-launch.md", "docs/deployed/amu-custom-instructions.md", "スキル", "CLAUDE.md と `docs/AMONE.md` が正"]) {
    assert.ok(t.includes(w), `CLAUDE.md must mention ${w}`);
  }
});
test("the numbers in CLAUDE.md are the ones the code and tests enforce", () => {
  assert.match(read("scripts/post.js"), /const MAX_READ_CHARS = 8000;/);
  assert.ok(!/MAX_THREAD_CHARS/.test(read("scripts/post.js")));
  // 2026-11-28: no read budget and no mail-length cap any more (mail route)
  assert.ok(!/overBudget|answerReserve/.test(read("scripts/post.js")));
  assert.ok(!/MAX_MAIL_CHARS/.test(read("scripts/mail-send.js")));
  assert.ok(read("CLAUDE.md").includes("全文を読む分の上限 (8,000字) と、相談メールの本文の上限 (4,500字) は、なくした"));
  assert.ok(read("CLAUDE.md").includes("**4,000字まで**") && /Number\(f\.limit\) > 4000/.test(read("scripts/check-ask.js")));
  assert.match(read("test/instructions.test.js"), /const MAX_INSTRUCTION_CHARS = 4500;/);
  assert.match(read("test/instructions.test.js"), /const MAX_LAUNCH_CHARS = 500;/);
  assert.match(read("docs/amu-chat-instructions.md"), /800字以内/);
});
