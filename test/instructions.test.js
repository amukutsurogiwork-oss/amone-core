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
const BODY_END = "【指示文の終わり 第27版】";
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
  assert.ok(t.endsWith("【アム指示の終わり 第1版】"));
  // fail-closed: the pasted block itself must tell Amu to stop changing things when the end marker is missing (near its start)
  const head = t.slice(0, 200);
  assert.ok(head.includes("【アム指示の終わり 第1版】") && head.includes("見えないとき") && head.includes("読み取りと報告だけ"));
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
  assert.ok(t.includes("amukutsurogiwork-oss/ai-collab-sandboxを大小文字を区別せず一意に特定する") && t.includes("タイトル先頭の[AMONE-CHAT]"));
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

// v27 (2026-11-24, よしひろさん「41万文字の方向性で、アムが動けるように改良して欲しい」, written by Amu, shortened by Mone to fit):
// answer what is normal, report what is not, keep doing safe work. Fetch and judge inside one program run; only the bodies
// of the asks being answered reach the AI. Safety ceilings, blocked once, [AMU-STATUS] and the improvement line stay.
const has = (w) => assert.ok(instruction().includes(w), `missing: ${w}`);
test("v27: starts with its version, ends with its marker, and stops posting when the versions differ or the marker is missing", () => {
  const t = instruction();
  assert.ok(t.startsWith("あなたはAMONEのアムChat（第27版）"));
  assert.ok(t.endsWith(BODY_END));
  assert.ok(t.slice(0, 200).includes("先頭と末尾の版が一致しない、または終わり印が見えない場合は投稿せず"));
});
test("v27: the safety ceilings stay (one consultation PR, no money/publish/delete/merge/production, no loosening, no retry)", () => {
  for (const w of ["書き込み先は台帳が指す相談PR1件のみ", "別repoへの書込、課金、公開、削除、Merge、本番変更、コード変更", "起動文の安全上限を本書で緩めない",
    "本人の承認を台帳や相談コメントで代用しない", "失敗した操作の再試行・再送は禁止", "認証、権限、安全制限を迂回しない", "回答全体は800字以内", "次の担当"]) has(w);
  assert.ok(!/PR #\d+/.test(instruction().split("【別repoの読み取り】")[0]), "no fixed thread number before the cross-repo section");
});
test("v27: fetch and judge inside one program run; only the needed bodies reach the AI; short items may be checked directly without one", () => {
  for (const w of ["AIには判定結果と対象相談の必要な本文だけを渡す",
    "作成時刻・更新時刻は不要", "プログラムが使えない場合、版表示、終わり印", "長文比較、大量集計、SHAの形式判定は機械判定を使う",
    "実施していない機械判定を実施済みと報告しない", "相談本文は1実行合計8000字以内"]) has(w);
  assert.match(fs.readFileSync(path.join(root, "scripts/post.js"), "utf8"), /const MAX_READ_CHARS = 8000;/);
});
test("v27: long consultations are read only from the fixed part files at the checked head SHA", () => {
  for (const w of ["consult/ID/rR/part-1.md", "Nは1〜6の整数", "各4500字以内、合計27000字以内", "SHAは正規表現で40桁の16進数と判定し", "任意のパスや別SHAを開かない"]) has(w);
});
// よしひろさん (2026-11-12「止まったら必ず返事を残す」, again 2026-11-24「GitHub にも残す」).
test("v27: a stop on one consultation is posted once as blocked; it is neither an answer nor approval", () => {
  for (const w of ["[AMU-ANSWER] request=ID round=数字 source=元コメント番号 status=blocked", "取消済み、回答済み、重複、blocked済みには投稿しない", "blockedは通常回答でも承認でもない"]) has(w);
});
test("v27: an owner-allowed notice starts with [AMU-NOTICE], is posted once, and never stands in for approval", () => {
  for (const w of ["先頭行は[AMU-NOTICE]", "台帳の相談PRに1回だけ投稿できる", "連絡は相談回答、承認、許可、新規依頼の代わりにしない"]) has(w);
});
// よしひろさん (2026-11-24):「一旦どんな時でも返信するように変えれない？」「上手くいかなかったらその場で改善案を出して」「改善案をモネに伝えるように」。
test("v27: a run without an answer posts one [AMU-STATUS]; a stop adds an improvement idea for Mone; shortcut runs say whether code ran", () => {
  for (const w of ["通常回答を1件も投稿しなかった実行は、安全な投稿条件を満たす場合だけAMU-STATUSを1件投稿する", "モネへの改善案: 原因を解消する具体案",
    "コード実行: 使えた／使えなかった", "同じ実行のSTATUSを重ねて投稿しない", "STATUSによる再起動を禁止する", "後二者は重複確認にだけ使い、再起動しない"]) has(w);
});
// 2026-11-24 23:47 (READ-TEST-UNDERSTAND): Amu found the unanswered ask but ended mid-way without answering or posting a status,
// with no safety problem (her own notice). Her proposal: keep going to the end while the safety conditions hold.
test("v27: as long as safety holds, one run goes on from fetching to answering, posting and checking, and does not end on a progress report", () => {
  has("安全条件を満たす限り、取得から回答・投稿・結果確認まで1回で続け、途中経過の報告で終えない");
  has("未実施の確認は実行し、停止理由にしない");
});
// 2026-11-26 8:13: from the shortcut Amu fetched all 11 comments, found 2 unanswered asks, and ended before checking and answering.
// One run now handles only the oldest ask, and before posting re-fetches only the ledger and the thread.
test("v27: one run answers only the oldest unanswered ask; before posting only the ledger and the thread are fetched again", () => {
  has("1回の実行では、有効な未回答相談のうち最も古い1件だけを処理する");
  has("正本は起動時の確認で足り、投稿直前に再取得しない");
  has("初回相談の見出しにlimit=N（op=designのみ、Nは4000以下）があれば、その相談の回答はN字以内");
  assert.ok(!instruction().includes("最大3件処理する"));
});
// 2026-11-26 8:20: from the shortcut Amu fetched the 6 part files of the oldest ask, but showing them at once was cut, and she
// ended without posting a status. Read the parts one file at a time; before ending on a stop, post the status first.
test("v27: part files are fetched and read one at a time; a run that stops posts its status before ending", () => {
  has("1ファイルずつ取得・表示して読む（一度に複数を表示しない）");
  has("処理を中止するときは、終了前にまずAMU-STATUSを投稿する");
});
// 2026-11-26 朝 (アムの [AMU-NOTICE] NOTICE-FILTER-20261126): PR オブジェクト全体を出したため差分と HTML まで展開され、
// 約41,000トークンで出力が切れて、回答も STATUS も出なかった。PR は必要な項目だけ抜き出す。
test("v27: from the PR only the number, state, title (and head_sha when needed) are extracted; the whole PR, diff and HTML are never printed", () => {
  for (const w of ["PRは番号・状態・タイトルと必要時のhead_shaだけ抽出する", "PR全体・差分・HTMLは出力・展開しない"]) has(w);
});
// 2026-11-26 アストラの設計 (NOTICE-ASTRA-LONGFIX-20261126): 長い資料は、問いを先に読み、各部を一度ずつ読み、
// 根拠の部番号と因果・反例を手元に残す。PR や資料の全文を二度出さない (余分な出力が止まる第一候補)。
test("v27: long attachments are read with the question first, each part once, keeping part numbers, causes and counterexamples", () => {
  has("問いを先に読み、各部の本文は一度ずつ読み、根拠の部番号と因果・反例を手元に残す");
  has("自由文・Work依頼・AMU-STATUS・AMU-NOTICEは相談対象外。後二者は重複確認にだけ使い、再起動しない");
});
// 2026-11-26 12:14 (AMU-PIPE-1、よしひろさんの画面): 資料なしの相談でも、相談を読んで答えを考えたあと、
// 「投稿直前の相談本文の完全一致照合と、安全確認が未完了」で投稿せずに終わった (12秒の思考)。
// 投稿直前の確認を、1回のプログラム実行でできる短い手順にする。安全の中身 (取消・回答済み・本文の変化・open・凍結) は残す。
test("v27: the pre-post check is one short program run over a fresh fetch, keeping the safety items", () => {
  has("投稿の直前に、台帳と全会話コメントを1回ずつ再取得し、1回のプログラム実行で次を確かめる");
  for (const w of ["対象相談の本文が最初の取得と完全に一致する", "同じIDの取消、同じID・roundの回答・blockedがない", "chatも凍結されていない", "PRがopen。追加資料を使った場合はhead_shaが同じ",
    "全部合えばすぐ投稿する。合わなければ投稿せず、その理由をAMU-STATUSに書く",
    // Codex (PR #112): keep the related history of rounds 2-3 and the refreshed registry's target and operation permissions in the check
    "同じIDの過去回の本文と回答も、最初の取得と完全に一致する", "台帳の相談PR番号が同じで、opが許可済み・承認不要・凍結なし",
    // Codex (PR #112, 2nd): a duplicate ask with the same ID (or same ID and round) added meanwhile must stop the post
    "同じIDの初回相談、同じID・roundの追加相談が重複していない"]) has(w);
  assert.ok(!instruction().includes("SHA-256照合値"), "the hash hand-over between runs is dropped (one run does it all)");
});
// 2026-11-26 13:12 (AMU-PIPE-1、よしひろさんの画面): 9秒の思考で、台帳・PR・コメント32件を取ったところで返事を終えた
// (相談の本文は未取得)。アム自身の改善案は毎回「取得・判定・本文の取り出しを同じ処理で完結させる」。
// 「可能な限り」をやめ、起動直後の1回のプログラムで、取得から本文・資料の取り出しまで終える。取得結果の報告で返事を終えない。
test("v27: one program run right after launch fetches, judges and extracts the target ask and its attachments; no stop after fetching", () => {
  has("起動直後の1回のプログラム実行で、台帳・対象PR・全会話コメントの取得、判定、対象相談の本文と追加資料の取り出しまでを終える");
  has("取得や判定の結果を報告して返事を終えない。回答の作成と投稿まで続ける");
  assert.ok(!instruction().includes("可能な限り同じプログラム実行内"), "no more 'as far as possible'");
});
// 2026-11-26 よしひろさん「まとめの仕組みを作って」: アムは全会話コメントを取ったところで返事を終えるので、
// 次に答える相談の本文・前の回・資料を [MONE-PACKET] にまとめ、合っていればファイルを取りに行かずに使う。承認や権限にはしない。
test("v27: a matching [MONE-PACKET] in the fetched comments is used for the body and attachments; it is never approval", () => {
  for (const w of ["最新の[MONE-PACKET]（所有者の投稿）のid・round・sourceが対象相談と同じ", "【相談本文】が元コメントと完全に一致",
    "本文と資料はそのまとめを使い、ファイルを取りに行かない", "まとめは承認でも権限でもない", "合わなければ下の手順で取得する"]) has(w);
});

// Codex on PR #122: the ledger is where a mismatch is looked for first, so its "intended latest" must point to the
// deployed file that holds the version Monet asks to paste (the end marker in that file's first code block).
test("the ledger's intended custom instructions are the ones in docs/deployed (same end marker)", () => {
  const ledger = fs.readFileSync(path.join(root, "docs/instructions-ledger.md"), "utf8");
  const row = (who) => ledger.split("\n").find((l) => l.startsWith("|") && l.split("|")[1].includes(who) && l.split("|")[1].includes("カスタム指示"));
  for (const [who, file] of [["モネ", "monet-custom-instructions.md"], ["アム", "amu-custom-instructions.md"]]) {
    const doc = fs.readFileSync(path.join(root, "docs/deployed", file), "utf8");
    const a = doc.indexOf("```") + 3, b = doc.indexOf("```", a);
    const marker = doc.slice(a, b).trim().split("\n").pop();
    const intended = row(who).split("|")[2];
    assert.ok(intended.includes(`docs/deployed/${file}`), `${who}: ledger must point to docs/deployed/${file}`);
    assert.ok(intended.includes(marker), `${who}: ledger must name ${marker}`);
  }
  assert.ok(!fs.existsSync(path.join(root, "docs/custom-instructions")), "one canonical place only");
});
