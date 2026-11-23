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
