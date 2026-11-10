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

/** Expand one-line entries; full entries are returned unchanged. */
function expandRegistry(registry) {
  const projects = Array.isArray(registry && registry.projects) ? registry.projects : [];
  return {
    ...registry,
    projects: projects.map((p) => (isShortEntry(p)
      ? { repo: p.repo, ...DEFAULTS, allowedLanes: [...DEFAULTS.allowedLanes],
          allowedOperations: [...DEFAULTS.allowedOperations], approvalRequired: [], guiOperations: [] }
      : p)),
  };
}

module.exports = { DEFAULTS, expandRegistry };
