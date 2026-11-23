"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { judge } = require("../scripts/iphone-check.cjs");
test("horizontal overflow and small tap targets are found; hidden ones are ignored", () => {
  const r = judge({ viewportWidth: 390, scrollWidth: 420, targets: [{ label: "a", w: 30, h: 30, visible: true }, { label: "b", w: 50, h: 50, visible: true }, { label: "c", w: 10, h: 10, visible: false }] });
  assert.strictEqual(r.overflow, true);
  assert.deepStrictEqual(r.small.map((t) => t.label), ["a"]);
  assert.strictEqual(judge({ viewportWidth: 390, scrollWidth: 390, targets: [] }).overflow, false);
});
// Codex P2 on #92: wide content can stretch window.innerWidth, so the baseline must be the configured device width.
test("overflow is judged against the configured device width, not the stretched window width", () => {
  const { judge, DEVICE } = require("../scripts/iphone-check.cjs");
  assert.strictEqual(typeof DEVICE.viewport.width, "number");
  const r = judge({ viewportWidth: DEVICE.viewport.width, scrollWidth: 800, targets: [] });
  assert.strictEqual(r.overflow, true);
});
