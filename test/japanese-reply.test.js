'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { isMostlyEnglish } = require('../scripts/hooks/japanese-reply.js');

test('英語ばかりの返事は止める', () => {
  assert.equal(isMostlyEnglish('PR #108 is waiting on Codex. CI passed. I will merge it after the review.'), true);
});
test('日本語の返事は通す (英語の名前やコード枠が混ざっても)', () => {
  assert.equal(isMostlyEnglish('PR #108 は Codex のレビュー待ちです。\n```\nnode scripts/post.js ask file.md --dry-run\n```\n次にすること: 待つ'), false);
});
test('短い英語だけ (OK など) は止めない', () => {
  assert.equal(isMostlyEnglish('OK'), false);
});
