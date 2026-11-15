"use strict";
// "No result" watcher (pure logic). A Work request that was routed (or claimed) but has no
// [AMU-RESULT] after a while gets ONE visible notice: [AMONE-NORESULT] request=<ID>.
// It never re-sends, never restarts Work, never changes anything else.

const NOTICE = "[AMONE-NORESULT]";
const DEFAULT_MINUTES = 15;
const MAX_NOTICES_PER_RUN = 3;

const RE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function headOf(body) {
  const first = String(body || "").split("\n", 1)[0];
  return first;
}
function field(head, name) {
  const m = new RegExp(`(?:^|\\s)${name}=([^\\s]+)`).exec(head);
  return m ? m[1] : null;
}
function reqId(head, name) {
  const v = field(head, name);
  return v && RE_ID.test(v) ? v : null;
}

/**
 * comments: GitHub issue comments (oldest first). nowMs: current time in ms.
 * Returns the request IDs that need ONE "no result" notice.
 */
function findNoResult(comments, nowMs, minutes = DEFAULT_MINUTES) {
  if (!Array.isArray(comments) || !Number.isFinite(nowMs)) return [];
  const limit = minutes * 60 * 1000;
  const seen = new Map(); // id -> { last, done, notified }
  const get = (id) => { if (!seen.has(id)) seen.set(id, { last: 0, done: false, notified: false }); return seen.get(id); };
  for (const c of comments) {
    if (!c || typeof c.body !== "string") continue;
    const t = Date.parse(c.created_at);
    if (!Number.isFinite(t)) continue;
    const head = headOf(c.body);
    const login = c.user && c.user.login;
    if (head.startsWith("[AMONE-ROUTED]") && login === "github-actions[bot]") {
      const id = reqId(head, "request"); if (id) { const e = get(id); e.last = Math.max(e.last, t); }
    } else if (head.startsWith("[AMU-CLAIM]")) {
      const id = reqId(head, "request"); if (id) { const e = get(id); e.last = Math.max(e.last, t); }
    } else if (head.startsWith("[AMU-RESULT]")) {
      const id = reqId(head, "request"); if (id) get(id).done = true;
    } else if (head.startsWith("[AMONE-CANCELLED]") && login === "github-actions[bot]") {
      const id = reqId(head, "request"); if (id) get(id).done = true;
    } else if (head.startsWith(NOTICE) && login === "github-actions[bot]") {
      const id = reqId(head, "request"); if (id) get(id).notified = true;
    }
  }
  const out = [];
  for (const [id, e] of seen) {
    if (e.done || e.notified || e.last === 0) continue;
    if (nowMs - e.last >= limit) out.push(id);
  }
  return out.slice(0, MAX_NOTICES_PER_RUN);
}

function noticeBody(id, minutes = DEFAULT_MINUTES) {
  return `${NOTICE} request=${id}\n受付から ${minutes} 分以上たちましたが、Work の結果 ([AMU-RESULT]) がありません。原因は不明です (実行が途中で止まった可能性があります)。再投稿・再起動はしていません。次の担当: モネ (よしひろさんに報告)。`;
}

module.exports = { findNoResult, noticeBody, NOTICE, DEFAULT_MINUTES, MAX_NOTICES_PER_RUN };
