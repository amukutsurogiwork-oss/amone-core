"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { expandRegistry } = require("../src/registry");
const { validateProject, decide, parseRequest } = require("../src/router");

const root = path.join(__dirname, "..");

test("a one-line entry expands to a valid, narrow project", () => {
  const { projects } = expandRegistry({ projects: [{ repo: "o/new" }] });
  assert.deepEqual(validateProject(projects[0]), []);
  assert.ok(!projects[0].allowedLanes.includes("work"));
  assert.deepEqual(projects[0].guiOperations, []);
  assert.ok(!projects[0].allowedOperations.includes("deploy"));
});

test("a one-line entry routes chat, and refuses Work and deploy", () => {
  const registry = expandRegistry({ projects: [{ repo: "o/new" }] });
  const go = (text) => decide(parseRequest(text, { repo: "o/new", thread: 1, commentId: 1, trusted: true }), registry);
  assert.equal(go("[MONE-REQUEST] id=A1 lane=chat op=research").action, "route");
  assert.equal(go("[MONE-REQUEST] id=A2 lane=work op=screen-check").reason, "lane not allowed for project");
  assert.equal(go("[MONE-REQUEST] id=A3 lane=chat op=deploy").reason, "operation not allowed for project");
});

test("an unregistered repo is rejected", () => {
  const registry = expandRegistry({ projects: [{ repo: "o/new" }] });
  const d = decide(parseRequest("[MONE-REQUEST] id=A1 lane=chat op=design", { repo: "o/other", thread: 1, commentId: 1, trusted: true }), registry);
  assert.equal(d.reason, "project not registered");
});

test("an entry with extra keys is not treated as short (it must be complete)", () => {
  const { projects } = expandRegistry({ projects: [{ repo: "o/x", allowedLanes: ["work"] }] });
  assert.notDeepEqual(validateProject(projects[0]), []);
});

test("the expanded registry is not shared between entries", () => {
  const { projects } = expandRegistry({ projects: [{ repo: "o/a" }, { repo: "o/b" }] });
  projects[0].allowedLanes.push("work");
  assert.ok(!projects[1].allowedLanes.includes("work"));
});

test("the real registry expands to valid entries, with no duplicate repo", () => {
  const real = expandRegistry(JSON.parse(fs.readFileSync(path.join(root, "collab", "registry.json"), "utf8")));
  for (const p of real.projects) assert.deepEqual(validateProject(p), []);
  const repos = real.projects.map((p) => p.repo);
  assert.equal(new Set(repos).size, repos.length);
});

test("the caller template pins the action to a full commit SHA and keeps the owner filter", () => {
  const t = fs.readFileSync(path.join(root, "templates", "collab-intake.yml"), "utf8");
  assert.match(t, /\/\.github\/actions\/intake@<FULL_COMMIT_SHA>/);
  assert.match(t, /author_association == 'OWNER'/);
  assert.match(t, /cancel-in-progress: false/);
});
