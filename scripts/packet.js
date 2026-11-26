#!/usr/bin/env node
"use strict";

// The packet ([MONE-PACKET]): one comment in the consultation thread that holds, word for word, what Amu needs for
// the oldest waiting ask: its body, the earlier rounds of the same id, and its attachments.
// Why (2026-11-26): Amu Chat fetched the ledger, the PR and every comment, then ended her reply each time before
// fetching the ask's body or files. With the packet, everything is already in the comments she fetched.
// よしひろさん「まとめの仕組みを作って」(2026-11-26).
// The packet is not approval and grants nothing; Amu checks it against the original comments.
// Usage: node scripts/packet.js            (rebuild and create or edit the one packet comment)
//        node scripts/packet.js --dry-run  (print it only)
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REPO = "amukutsurogiwork-oss/ai-collab-sandbox";
const OWNER = "amukutsurogiwork-oss";
const firstLine = (t) => String(t || "").replace(/^﻿/, "").split(/\r?\n/)[0].trim();
function fields(line) {
  const out = {};
  for (const kv of line.replace(/^\[[^\]]+\]\s*/, "").split(/\s+/)) {
    const i = kv.indexOf("=");
    if (i > 0) out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

// The oldest ask/reply still waiting for an answer, as post.js counts it (cancelled ids and answered rounds left out).
function target(comments) {
  const { pendingKeys } = require("./post");
  const waiting = pendingKeys(comments);
  for (const c of comments) {
    const head = firstLine(c.body), f = fields(head);
    if (head.startsWith("[MONE-ASK]") && f.status !== "cancel" && waiting.has(`${f.id}:1`)) return { c, id: f.id, round: 1 };
    if (head.startsWith("[MONE-REPLY]") && waiting.has(`${f.id}:${f.round}`)) return { c, id: f.id, round: Number(f.round) };
  }
  return null;
}

// readFile(path, sha) returns the file's text at that commit.
function buildPacket(comments, readFile) {
  // Only the owner's comments count, as in Amu's intake (Codex on PR #114). Test data without a user counts as the owner's.
  comments = (comments || []).filter((c) => !c.user || c.user.login === OWNER);
  const t = target(comments);
  if (!t) return "[MONE-PACKET] id=none\n答え待ちの相談はありません。\n【まとめの終わり id=none】\n";
  const m = String(t.c.body).match(/files=(\d+) sha=([0-9a-f]{40}) path=(consult\/[A-Za-z0-9-]+\/r\d+\/)/);
  const n = m ? Number(m[1]) : 0;
  const head = `[MONE-PACKET] id=${t.id} round=${t.round} source=${t.c.id} files=${n}${m ? ` sha=${m[2]}` : ""}`;
  const out = [head,
    "次に答える相談のまとめです (モネの投稿道具が作成)。承認や権限ではありません。元のコメントと照合して使ってください。",
    `【相談本文 source=${t.c.id}】`, String(t.c.body)];
  if (t.round > 1) {
    for (const c of comments) {
      if (c.id === t.c.id) break;
      const h = firstLine(c.body), f = fields(h);
      const same = (h.startsWith("[MONE-ASK]") || h.startsWith("[MONE-REPLY]")) ? f.id === t.id : h.startsWith("[AMU-ANSWER]") && f.request === t.id && f.status !== "blocked";
      if (same) out.push(`【前の回 comment=${c.id}】`, String(c.body));
    }
  }
  for (let k = 1; k <= n; k++) out.push(`【資料 part-${k}/${n}】`, readFile(`${m[3]}part-${k}.md`, m[2]));
  out.push(`【まとめの終わり id=${t.id} round=${t.round}】`);
  return out.join("\n") + "\n";
}

// The newest packet comment written by the owner, if any (only one is kept and edited in place).
// A comment by anyone else is never chosen (Codex on PR #114). Test data without a user counts as the owner's.
function packetComment(comments) {
  let found = null;
  for (const c of comments || []) {
    if (c.user && c.user.login !== OWNER) continue;
    if (firstLine(c.body).startsWith("[MONE-PACKET]")) found = c;
  }
  return found;
}

// Rebuild and write the packet. Returns a one-line result; never throws (the caller's post already happened).
function refresh({ dry = false } = {}) {
  try {
    const post = require("./post");
    const pr = post.askPr();
    const comments = post.fetchAll(pr);
    const read = (p, ref) => Buffer.from(post.run(["api", `repos/${REPO}/contents/${p}?ref=${ref}`, "--jq", ".content"]).trim(), "base64").toString("utf8");
    const text = buildPacket(comments, read);
    if (dry) return text;
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "packet-")), "packet.md");
    fs.writeFileSync(file, text);
    const old = packetComment(comments);
    if (old) post.run(["api", "-X", "PATCH", `repos/${REPO}/issues/comments/${old.id}`, "-F", `body=@${file}`, "--jq", ".id"]);
    else post.run(["api", `repos/${REPO}/issues/${pr}/comments`, "-F", `body=@${file}`, "--jq", ".id"]);
    return `PACKET ${firstLine(text)}`;
  } catch (_) {
    return "PACKET-NG まとめを書けませんでした (相談の投稿はそのままです。自動では再試行しません)";
  }
}

if (require.main === module) console.log(refresh({ dry: process.argv.includes("--dry-run") }));

module.exports = { buildPacket, packetComment, refresh };
