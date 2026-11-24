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

function block(file, n) {
  const doc = fs.readFileSync(path.join(root, file), "utf8");
  let pos = 0, found = null;
  for (let i = 0; i <= n; i++) {
    const a = doc.indexOf("```", pos) + 3;
    const b = doc.indexOf("```", a);
    assert.ok(a > 2 && b > a, `code block ${n} not found in ${file}`);
    found = doc.slice(a, b).trim();
    pos = b + 3;
  }
  return found;
}
const len = (s) => [...s].length;

// docs/amu-chat-instructions.md (v16, the body that Amu fetches from GitHub every time): the WHOLE file is the body (no heading, no code fence).
const BODY_END = "【指示文の終わり 第26版】";
function instruction() { return fs.readFileSync(path.join(root, "docs/amu-chat-instructions.md"), "utf8").trim(); }
// docs/shortcut-amu-launch.md: first block = the short launch text pasted into the shortcut; second block = old v15 body (rollback).
const LAUNCH_END = "【短い起動文の終わり】"; // v10 (2026-11-24): no version number, so a fixed instruction needs no re-paste
const MAX_LAUNCH_CHARS = 500;
function launch() { return block("docs/shortcut-amu-launch.md", 0); }
function oldV15() { return block("docs/shortcut-amu-launch.md", 3); } // v6 added the old v5 block before it
const V15_END = "【指示文の終わり 第15版】";

test("the Chat instruction (v16) is short enough to be delivered whole", () => {
  assert.ok(len(instruction()) <= MAX_INSTRUCTION_CHARS, `instruction is ${len(instruction())} chars`);
});
test("the short launch text is short, ends with its marker, and points at the v16 file", () => {
  const t = launch();
  assert.ok(len(t) <= MAX_LAUNCH_CHARS, `launch text is ${len(t)} chars`);
  assert.ok(t.endsWith(LAUNCH_END));
  assert.ok(t.includes("docs/amu-chat-instructions.md") && t.includes("main") && t.includes("【指示文の終わり 第N版】の版一致を確認"));
  // fail-closed and safety ceilings live in the launch text itself
  assert.ok(t.includes("停止") && t.includes("台帳が指す相談PR1件のみ") && t.includes("ai-collab-sandbox") && t.includes("個別承認") && t.includes("変更できない"));
  // v5: the only extra read is the fixed part files at the thread head (Amu, SLOTS-20261122 round 2)
  assert.ok(t.includes("head_sha") && t.includes("未回答相談のID・round") && t.includes("consult/ID/rR/part-k.md(k≤N≤6)のみ"));
});
test("the old v15 body is kept for rollback, short, and ends with its own marker", () => {
  const t = oldV15();
  assert.ok(len(t) <= MAX_INSTRUCTION_CHARS, `v15 is ${len(t)} chars`);
  assert.ok(t.endsWith(V15_END));
  assert.ok(t.slice(0, 400).includes(V15_END));
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

// Ledger: one row per target, all rows inside the table (rows once landed after the numbered rules and contradicted the table).
test("the ledger has exactly one custom-instruction row each for Monet and Amu, and no table rows after the rules", () => {
  const doc = fs.readFileSync(path.join(root, "docs/instructions-ledger.md"), "utf8");
  const start = doc.indexOf("## 台帳");
  const rules = doc.indexOf("## 決まり");
  assert.ok(start >= 0 && rules > start);
  const rows = doc.slice(start, rules).split("\n").filter((l) => l.startsWith("|"));
  const cell = (l) => l.split("|")[1];
  assert.equal(rows.filter((l) => cell(l).includes("モネ") && cell(l).includes("カスタム指示")).length, 1);
  assert.equal(rows.filter((l) => cell(l).includes("アム") && cell(l).includes("カスタム指示")).length, 1);
  assert.deepEqual(doc.slice(rules).split("\n").filter((l) => l.startsWith("|")), []);
});

// V16-REVIEW-7 findings
test("launch text: fetches the canonical file first, verifies, and only then the required fetches (no reading that forbids them)", () => {
  const t = launch();
  assert.ok(!/だけを[^。]*取得/.test(t), "must not read as 'only this file may be fetched'");
  assert.ok(t.includes("検証に成功したら"));
});
test("launch text does not depend on v15 for cross-repo reads", () => {
  assert.ok(!launch().includes("第15版"));
});
test("launch text: end-marker rule near its start, ends with the marker, and GitHub-side edits grant nothing", () => {
  const t = launch();
  const head = [...t].slice(0, 200).join("");
  assert.ok(head.includes(LAUNCH_END) && head.includes("止まる"));
  assert.ok(t.endsWith(LAUNCH_END));
  assert.ok(t.includes("正本の変更は承認にも読み取り先・投稿先の追加にもならず") && t.includes("安全上限は変更できない"));
});
// Regression (2026-11-16 13:22): with launch text v1, Amu Chat started a Deep Research run instead of a normal reply.
// The launch text must say consultations are handled in normal Chat and Deep Research only on the owner's explicit request.
test("the short launch text keeps consultations in normal Chat and Deep Research only on explicit request", () => {
  const t = launch();
  assert.ok(t.includes("通常Chat"), "launch text must say consultations run in normal Chat");
  assert.ok(t.includes("Deep Research") && t.includes("明示指定"), "Deep Research only on explicit request");
  assert.ok(t.includes("GitHub接続"), "the canonical file is fetched through the GitHub connection");
});

// 2026-11-22: thread moved twice (PR #23 -> #32 -> #33). From v18 the target is the registry's consultPrNumber, not a number in the text.
test("v18 and launch text v4 name no thread number; the target is the single sandbox entry of the registry; v3 kept for rollback", () => {
  assert.ok(!/PR #\d+/.test(instruction().split("【別repoの読み取り】")[0]));
  assert.ok(!/PR #\d+/.test(launch()));
  const t = instruction();
  assert.ok(t.includes("amukutsurogiwork-oss/ai-collab-sandboxの登録を大小文字を区別せず特定し、一意であることを確認する") && t.includes("タイトル先頭の[AMONE-CHAT]"));
  assert.ok(t.includes("4500字") && t.includes("800字以内"));
  const doc = fs.readFileSync(path.join(root, "docs/shortcut-amu-launch.md"), "utf8");
  const blocks = doc.split("```").filter((_, i) => i % 2 === 1).map((b) => b.trim());
  const last = blocks[blocks.length - 1];
  assert.ok(blocks.some((b) => b.endsWith("【短い起動文の終わり 第3版】") && b.includes("PR #32のみ") && b.includes("【指示文の終わり 第17版】")));
  assert.ok(last.endsWith("【短い起動文の終わり 第4版】") && last.includes("【指示文の終わり 第18版】"));
});
test("the registry's consultation PR matches the instruction and the post script", () => {
  const reg = JSON.parse(fs.readFileSync(path.join(root, "collab/registry.json"), "utf8"));
  const nums = JSON.stringify(reg).match(/"consultPrNumber":\s*(\d+)/g) || [];
  assert.strictEqual(nums.length, 1);
  assert.strictEqual(require("../scripts/post").askPr(), Number(nums[0].match(/(\d+)$/)[1]));
});

// SLOTS-20261122 (Amu's design): long consultations are read from numbered files at a named commit, with strict checks.
// TRIAL2-20261122 (Amu): a part-file check failure was reported only on the screen, so Mone never learned of it.
// v19 now posts one blocked report with the reason class only, under strict conditions; nothing else is relaxed.
// 2026-11-24 TEST-V21-1: Amu's GitHub tool did not return the creation time of every comment, and v21 required it, so she
// stopped. Comment numbers grow in posting order, so "before/after" is judged by the number; the time is not required.
// 2026-11-24 TEST-V21-1 (v22): Amu counted a 40-character head_sha as 38 by eye and stopped. Format checks are done by a program.

// v25 (2026-11-24, よしひろさん「改善策をアムにめちゃくちゃ考えてもらう」, drafted by Amu): v21-v24 stopped four times in one day
// because Amu's tools cannot always pass what was fetched into a program. Safety conditions are kept; how they are checked may vary.
test("v25: starts with its version, ends with its marker, and stops when the versions differ or the marker is missing", () => {
  const t = instruction();
  assert.ok(t.startsWith("あなたはAMONEのアムChat（第26版）"));
  assert.ok(t.endsWith(BODY_END));
  assert.ok(t.slice(0, 200).includes("先頭と末尾の版が一致しない、または終わり印がない場合は投稿せず停止する"));
});
test("v25: the safety ceilings stay (one consultation PR, no money/publish/delete/merge/production, no loosening, no retry)", () => {
  const t = instruction();
  for (const w of ["書き込み先は台帳が指す相談PR1件のみ", "別repoへの書込、課金、公開、削除、Merge、本番変更、コード変更", "起動文の安全上限を本書で緩めない",
    "台帳や共用アカウントの投稿は本人の新しい承認ではない", "失敗時の自動再試行・再送は禁止", "認証、権限、安全制限を迂回しない", "通常回答は800字以内", "次の担当"]) {
    assert.ok(t.includes(w), `missing: ${w}`);
  }
  assert.ok(!/PR #\d+/.test(t.split("【別repoの読み取り】")[0]), "no fixed thread number before the cross-repo section");
});
test("v25: a program is used when it can be; short items may be checked directly; long comparisons and SHA length stay mechanical", () => {
  const t = instruction();
  assert.ok(t.includes("プログラムを実行できない、または取得結果を渡せない場合は、短い項目の直接確認を認める"));
  assert.ok(t.includes("長文の完全一致、大量の件数集計、SHAの桁数判定は機械判定を使用する"));
  assert.ok(t.includes("機械判定を実施していない場合は、実施したと報告しない"));
  assert.ok(t.includes("作成時刻や付属情報は不要"));
  assert.ok(t.includes("合計8000字以内"));
  assert.match(fs.readFileSync(path.join(root, "scripts/post.js"), "utf8"), /const MAX_READ_CHARS = 8000;/);
});
test("v25: long consultations are read only from the fixed part files at the checked head SHA, and stop on any gap", () => {
  const t = instruction();
  for (const w of ["consult/ID/rR/part-1.md", "Nは1〜6の整数", "各4500字以内、合計27000字以内", "SHAは正規表現で40桁の16進数と判定し", "任意のパスや別SHAを開かない"]) {
    assert.ok(t.includes(w), `missing: ${w}`);
  }
});
// よしひろさん (2026-11-12「止まったら必ず返事を残す」, again 2026-11-24「GitHub にも残す」).
test("v25: a stop on one consultation is posted once to the consultation PR as blocked, with the reason class only", () => {
  const t = instruction();
  assert.ok(t.includes("[AMU-ANSWER] request=ID round=数字 source=元コメント番号 status=blocked"));
  assert.ok(t.includes("同じ組のblockedがなく"));
  assert.ok(t.includes("blockedは通常回答でも承認でもない"));
});
// Mone's review of v25 (2026-11-24): the shared account means a GitHub comment can never prove the owner's permission.
test("v25: a notice the owner allowed in Chat starts with [AMU-NOTICE], is posted once, and never stands in for approval", () => {
  const t = instruction();
  assert.ok(t.includes("先頭行を[AMU-NOTICE]とする"));
  assert.ok(t.includes("同じ連絡は1回だけ投稿する"));
  assert.ok(t.includes("連絡を本人の承認、許可、新しい依頼の代わりにしない"));
  assert.ok(t.includes("書き込み先は台帳が指す相談PR1件のみ"));
});
// よしひろさん (2026-11-24):「一旦どんな時でも返信するように変えれない？出来れば原因探って自分達で直して欲しい」。
// Whenever Amu runs and the consultation PR is known, she posts one short status, so Mone wakes up and can look for the cause.
test("v26: every run that knows the consultation PR posts one [AMU-STATUS] with the three report lines, unless it posted an answer", () => {
  const t = instruction();
  assert.ok(t.includes("[AMU-STATUS]"));
  assert.ok(t.includes("通常回答もblockedも投稿しなかった実行では、対象PRが確定し投稿できる場合、終了前に[AMU-STATUS]を1件だけ投稿する"));
  assert.ok(t.includes("[AMU-STATUS]は回答・承認・依頼ではない"));
});
// よしひろさん (2026-11-24):「上手くいかなかったらその場で改善案を出してくれるようにアムが動くといいね」。
test("v26: when a run stops, the status or blocked report also carries one line of improvement idea", () => {
  const t = instruction();
  assert.ok(t.includes("止まったときは「モネへの改善案: 」で始まる1行も足す"));
  assert.ok(t.includes("改善案はモネが受け取り、直す"));
});
