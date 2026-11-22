"use strict";
// Runner for .github/workflows/collab-watch.yml (scheduled).
// Lists open PRs that carry the Work label, reads their comments, and posts at most
// MAX_NOTICES_PER_RUN "no result" notices. Failures exit non-zero and are NOT retried.
// Logs carry fixed codes only: never comment text, tokens or URLs.

const { findNoResult, noticeBody, DEFAULT_MINUTES, MAX_NOTICES_PER_RUN } = require("../src/watch");

const LABEL = "amone-work";
const MAX_PAGES = 5;

async function api(base, token, method, url, body) {
  let res;
  try {
    res = await fetch(`${base}${url}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("E_NETWORK"); }
  if (!res.ok) throw new Error(`E_API_${method}_${res.status}`);
  try { return await res.json(); } catch { throw new Error("E_API_BAD_RESPONSE"); }
}

async function listAll(base, token, url) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const sep = url.includes("?") ? "&" : "?";
    const chunk = await api(base, token, "GET", `${url}${sep}per_page=100&page=${page}`);
    if (!Array.isArray(chunk)) throw new Error("E_API_BAD_RESPONSE");
    out.push(...chunk);
    if (chunk.length < 100) return out;
  }
  throw new Error("E_TOO_MANY_PAGES");
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const base = process.env.GITHUB_API_URL || "https://api.github.com";
  const minutes = Number(process.env.WATCH_MINUTES || DEFAULT_MINUTES);
  if (!repo || !token || !Number.isFinite(minutes) || minutes < 5) throw new Error("E_CONFIG");
  // The calling workflow MUST serialize runs (concurrency group, no cancel): see templates/collab-watch.yml.
  const info = await api(base, token, "GET", `/repos/${repo}`);
  const ownerId = info && info.owner && Number.isSafeInteger(info.owner.id) ? info.owner.id : null;
  if (ownerId === null) throw new Error("E_NO_OWNER");
  const issues = await listAll(base, token, `/repos/${repo}/issues?state=open&labels=${LABEL}`);
  let posted = 0;   // one budget for the whole run
  for (const issue of issues) {
    if (posted >= MAX_NOTICES_PER_RUN) break;
    if (!issue || !Number.isSafeInteger(issue.number)) continue;
    const comments = await listAll(base, token, `/repos/${repo}/issues/${issue.number}/comments`);
    for (const id of findNoResult(comments, Date.now(), minutes, { ownerId })) {
      if (posted >= MAX_NOTICES_PER_RUN) break;
      // Re-read right before posting: skip if a result or a notice appeared meanwhile.
      const fresh = await listAll(base, token, `/repos/${repo}/issues/${issue.number}/comments`);
      if (!findNoResult(fresh, Date.now(), minutes, { ownerId }).includes(id)) continue;
      await api(base, token, "POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: noticeBody(id, minutes) });
      posted++;
    }
  }
  console.log(`WATCH_OK posted=${posted}`);
}

main().catch((e) => { console.error(`WATCH_FAIL ${e && e.message ? e.message : "E_UNKNOWN"}`); process.exit(1); });
