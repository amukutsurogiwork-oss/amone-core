"use strict";

// A project can register with one line: { "repo": "owner/name" }.
// The short form gets the safest defaults: no Work lane, no GUI operations,
// no deploy. Anything wider needs the full entry (reviewed in a PR here).
const DEFAULTS = {
  contact: "mone",
  allowedLanes: ["chat", "codex", "mone"],
  allowedOperations: ["design", "research", "pr-review", "consult"],
  approvalRequired: [],
  guiOperations: [],
  notify: "github-issue",
  priority: "normal",
};

function isShortEntry(p) {
  return Boolean(p) && typeof p === "object" && !Array.isArray(p)
    && Object.keys(p).length === 1 && typeof p.repo === "string";
}

// Automatic start of Amu Chat (A3). Always off unless a reviewed entry turns it on.
const CHAT_DEFAULTS = { consultPrNumber: null, chatAutoLaunchEnabled: false };

const isObject = (p) => Boolean(p) && typeof p === "object" && !Array.isArray(p);

/** Expand one-line entries and add the chat defaults where missing. The input is not changed. */
function expandRegistry(registry) {
  const projects = Array.isArray(registry && registry.projects) ? registry.projects : [];
  const withChat = (p) => (isObject(p)
    ? { ...p, ...Object.fromEntries(Object.entries(CHAT_DEFAULTS).filter(([k]) => !(k in p))) }
    : p);
  return {
    ...registry,
    projects: projects.map((p) => withChat(isShortEntry(p)
      ? { repo: p.repo, ...DEFAULTS, allowedLanes: [...DEFAULTS.allowedLanes],
          allowedOperations: [...DEFAULTS.allowedOperations], approvalRequired: [], guiOperations: [] }
      : p)),
  };
}

/**
 * Which consult PRs may start Amu Chat. Anything unclear stops everything (ok: false, no targets):
 * a missing or malformed registry, any invalid entry, a duplicate repo.
 * Pass the RAW registry (as read from collab/registry.json): its shape is checked first, then it is expanded
 * here, so a malformed file can never turn into "ok, no targets". Passing an already expanded registry is
 * also fine (expansion only fills missing fields). The PR's own state (open, consult PR), the email, the
 * re-check right before posting and concurrent starts are checked by the caller (the launch text), not here.
 */
function chatLaunchTargets(rawRegistry) {
  const stop = (reason) => ({ ok: false, reason, targets: [] });
  if (!isObject(rawRegistry) || !Array.isArray(rawRegistry.projects)) return stop("registry missing or malformed");
  const registry = expandRegistry(rawRegistry);
  const { validateProject } = require("./router");
  const seen = new Set();
  for (const p of registry.projects) {
    if (validateProject(p).length) return stop("invalid project");
    const key = p.repo.toLowerCase();   // GitHub owner/repo names are case-insensitive
    if (seen.has(key)) return stop("duplicate repo");
    seen.add(key);
  }
  const targets = registry.projects.filter((p) => p.chatAutoLaunchEnabled === true)
    .map((p) => ({ repo: p.repo, pr: p.consultPrNumber }));
  return { ok: true, targets };
}

const REVIEW_OPERATIONS = ["review", "consult"];
const REVIEW_KEYS = ["repo", "pr", "readOnly", "operations"];

/**
 * Where Amu Chat may READ a pull request to review it (never to write). This is separate from the consult PR (the place
 * where Amu answers). No `reviewTargets` list = no targets (closed by default). Anything unclear stops everything:
 * a target must name a registered repo, a whole-number PR, readOnly === true, a non-empty list of allowed operations,
 * no extra fields, and no duplicate repo + PR. A line in the registry is not a grant by itself: the caller still checks
 * the owner's approval and that this version of the registry is the merged one.
 */
function chatReviewTargets(rawRegistry) {
  const stop = () => ({ ok: false, reason: "invalid review target", targets: [] });
  if (!isObject(rawRegistry) || !Array.isArray(rawRegistry.projects)) return { ok: false, reason: "registry missing or malformed", targets: [] };
  const list = rawRegistry.reviewTargets;
  if (list === undefined) return { ok: true, targets: [] };
  if (!Array.isArray(list)) return stop();
  const repos = new Set(rawRegistry.projects.filter(isObject).map((p) => String(p.repo).toLowerCase()));
  const seen = new Set();
  const targets = [];
  for (const t of list) {
    if (!isObject(t) || Object.keys(t).some((k) => !REVIEW_KEYS.includes(k))) return stop();
    if (typeof t.repo !== "string" || !repos.has(t.repo.toLowerCase())) return stop();
    if (!Number.isInteger(t.pr) || t.pr < 1) return stop();
    if (t.readOnly !== true) return stop();
    if (!Array.isArray(t.operations) || !t.operations.length || t.operations.some((o) => !REVIEW_OPERATIONS.includes(o))) return stop();
    const key = t.repo.toLowerCase() + "#" + t.pr;
    if (seen.has(key)) return stop();
    seen.add(key);
    targets.push({ repo: t.repo, pr: t.pr, operations: [...t.operations] });
  }
  return { ok: true, targets };
}

module.exports = { DEFAULTS, CHAT_DEFAULTS, expandRegistry, chatLaunchTargets, chatReviewTargets };
