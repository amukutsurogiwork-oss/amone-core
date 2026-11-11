"use strict";

// A3: the registry says, per project, which consult PR (if any) may start Amu Chat automatically.
// Written first (Amu's design, sandbox PR #23 REDESIGN-5 round=2). Defaults are always the safe side.
const test = require("node:test");
const assert = require("node:assert/strict");
const { expandRegistry, chatLaunchTargets } = require("../src/registry");
const { validateProject } = require("../src/router");

const full = (extra = {}) => ({
  repo: "o/full", contact: "mone", allowedLanes: ["chat", "mone"], allowedOperations: ["consult"],
  approvalRequired: [], guiOperations: [], notify: "github-issue", priority: "normal", ...extra,
});

test("short and full entries get the safe defaults (no auto launch, no consult PR)", () => {
  const { projects } = expandRegistry({ projects: [{ repo: "o/short" }, full()] });
  for (const p of projects) {
    assert.equal(p.consultPrNumber, null);
    assert.equal(p.chatAutoLaunchEnabled, false);
    assert.deepEqual(validateProject(p), []);
  }
});

test("expansion does not change the input, and keeps explicit values", () => {
  const input = { projects: [full({ consultPrNumber: 23, chatAutoLaunchEnabled: true })] };
  const before = JSON.stringify(input);
  const { projects } = expandRegistry(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(projects[0].consultPrNumber, 23);
  assert.equal(projects[0].chatAutoLaunchEnabled, true);
});

test("an explicit valid entry is a launch target", () => {
  const r = chatLaunchTargets(expandRegistry({ projects: [full({ consultPrNumber: 23, chatAutoLaunchEnabled: true }), { repo: "o/short" }] }));
  assert.deepEqual(r, { ok: true, targets: [{ repo: "o/full", pr: 23 }] });
});

test("nothing enabled: no targets, still ok", () => {
  assert.deepEqual(chatLaunchTargets(expandRegistry({ projects: [{ repo: "o/a" }, full()] })), { ok: true, targets: [] });
});

for (const [name, extra] of [
  ["zero", { consultPrNumber: 0, chatAutoLaunchEnabled: true }],
  ["negative", { consultPrNumber: -1, chatAutoLaunchEnabled: true }],
  ["fraction", { consultPrNumber: 2.5, chatAutoLaunchEnabled: true }],
  ["string number", { consultPrNumber: "23", chatAutoLaunchEnabled: true }],
  ["string boolean", { consultPrNumber: 23, chatAutoLaunchEnabled: "true" }],
  ["enabled without a PR", { consultPrNumber: null, chatAutoLaunchEnabled: true }],
  ["enabled without the chat lane", { consultPrNumber: 23, chatAutoLaunchEnabled: true, allowedLanes: ["mone"] }],
]) {
  test(`invalid entry (${name}) fails validation and stops the whole launch`, () => {
    const reg = expandRegistry({ projects: [full(extra), full({ repo: "o/ok", consultPrNumber: 5, chatAutoLaunchEnabled: true })] });
    assert.notDeepEqual(validateProject(reg.projects[0]), []);
    const r = chatLaunchTargets(reg);
    assert.equal(r.ok, false);
    assert.deepEqual(r.targets, []);
  });
}

test("a duplicate repo stops the launch (even if one of them is disabled)", () => {
  const r = chatLaunchTargets(expandRegistry({ projects: [full({ consultPrNumber: 23, chatAutoLaunchEnabled: true }), full()] }));
  assert.deepEqual(r, { ok: false, reason: "duplicate repo", targets: [] });
});

test("the same PR number in different repos is not a conflict", () => {
  const r = chatLaunchTargets(expandRegistry({ projects: [
    full({ consultPrNumber: 7, chatAutoLaunchEnabled: true }),
    full({ repo: "o/other", consultPrNumber: 7, chatAutoLaunchEnabled: true })] }));
  assert.equal(r.ok, true);
  assert.equal(r.targets.length, 2);
});

test("a missing or malformed registry stops the launch", () => {
  for (const bad of [null, {}, { projects: "x" }, { projects: [null] }]) {
    const r = chatLaunchTargets(bad);
    assert.equal(r.ok, false);
    assert.deepEqual(r.targets, []);
  }
});

test("a consult PR number without auto launch is allowed (and is not a target)", () => {
  const reg = expandRegistry({ projects: [full({ consultPrNumber: 23 })] });
  assert.deepEqual(validateProject(reg.projects[0]), []);
  assert.deepEqual(chatLaunchTargets(reg), { ok: true, targets: [] });
});

// Codex review (PR #5): repo must be a real string, and duplicates are case-insensitive (GitHub names are).
test("a repo that is not a string stops the launch", () => {
  const r = chatLaunchTargets(expandRegistry({ projects: [full({ repo: ["o/p"], consultPrNumber: 23, chatAutoLaunchEnabled: true })] }));
  assert.deepEqual(r, { ok: false, reason: "invalid project", targets: [] });
  assert.notDeepEqual(validateProject(full({ repo: ["o/p"] })), []);
});

test("the same repo with different letter case is a duplicate", () => {
  const r = chatLaunchTargets(expandRegistry({ projects: [full({ repo: "o/p", consultPrNumber: 23, chatAutoLaunchEnabled: true }), full({ repo: "O/P" })] }));
  assert.deepEqual(r, { ok: false, reason: "duplicate repo", targets: [] });
});
