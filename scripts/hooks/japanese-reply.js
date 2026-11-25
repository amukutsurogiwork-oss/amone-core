#!/usr/bin/env node
// Stop フック: モネの最後の返事が英語ばかりなら、止まらずに日本語で書き直させる。
// よしひろさんの指示 (2026-11-25):「英語で出してしまう前に日本語で回答するように改善してね」
'use strict';
const fs = require('fs');

function lastAssistantText(input) {
  if (typeof input.last_assistant_message === 'string') return input.last_assistant_message;
  const p = input.transcript_path;
  if (!p || !fs.existsSync(p)) return '';
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    const m = e.message || e;
    if (e.type === 'user' && Array.isArray(m.content) && m.content.some(c => c.type !== 'tool_result')) return '';
    if (e.type !== 'assistant' && m.role !== 'assistant') continue;
    const c = m.content;
    const text = typeof c === 'string' ? c
      : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('\n') : '';
    if (text.trim()) return text;
  }
  return '';
}

function isMostlyEnglish(text) {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/https?:\S+/g, ' ');
  const jp = (prose.match(/[぀-ヿ㐀-鿿]/g) || []).length;
  const latin = (prose.match(/[A-Za-z]/g) || []).length;
  if (latin < 40) return false;
  return jp / (jp + latin) < 0.2;
}

function main(raw) {
  let input = {};
  try { input = JSON.parse(raw || '{}'); } catch { return; }
  if (input.stop_hook_active) return; // 書き直しのあとは2回目を止めない
  const text = lastAssistantText(input);
  if (text && isMostlyEnglish(text)) {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: '最後の返事が英語ばかりです。よしひろさんは日本語だけ読みます。同じ内容を、短くやさしい日本語で書き直してください。',
    }));
  }
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', d => { raw += d; });
  process.stdin.on('end', () => main(raw));
}
module.exports = { isMostlyEnglish, lastAssistantText };
