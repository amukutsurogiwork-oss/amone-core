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

module.exports = { DEFAULTS, CHAT_DEFAULTS, expandRegistry, chatLaunchTargets };
