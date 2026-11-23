#!/usr/bin/env node
"use strict";
// iPhone で見たときの点検 (毎朝の提案②、よしひろさん OK 2026-11-23)。ページは変えない、見るだけ。
// 横にはみ出す部分 (横スクロール) と、指で押しにくい小さいボタン・リンク (44×44 より小さい) を数える。
// 実行: node scripts/iphone-check.cjs <htmlファイル> [<htmlファイル>...]   (Playwright と Chromium が必要)
const path = require("node:path");

// pure: decide from measured boxes (tested without a browser)
function judge({ viewportWidth, scrollWidth, targets }) {
  const overflow = scrollWidth > viewportWidth + 1;
  const small = targets.filter((t) => t.visible && (t.w < 44 || t.h < 44));
  return { overflow, scrollWidth, small };
}

async function measure(file) {
  const { chromium, devices } = require("playwright");
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  const p = await ctx.newPage();
  await p.goto("file://" + path.resolve(file));
  await p.waitForTimeout(800);
  const m = await p.evaluate(() => {
    const targets = [...document.querySelectorAll("a[href],button,input,select,textarea,[role=button]")].map((el) => {
      // a control inside a label is pressed through the whole label, so measure the label
      const box = el.closest("label") || el;
      const r = box.getBoundingClientRect(), cs = getComputedStyle(el);
      const visible = r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden]");
      return { label: (el.id ? "#" + el.id : el.tagName.toLowerCase()) + " " + (el.textContent || el.value || "").trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height), visible };
    });
    return { viewportWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth, targets };
  });
  await b.close();
  return judge(m);
}

async function main(files) {
  let bad = 0;
  for (const f of files) {
    const r = await measure(f);
    console.log(`\n${f}`);
    console.log(`${r.overflow ? "✗" : "✓"} 横にはみ出さない (ページの幅 ${r.scrollWidth})`);
    console.log(`${r.small.length ? "△" : "✓"} 押しにくい小さいボタン・リンク: ${r.small.length} 個`);
    for (const t of r.small.slice(0, 12)) console.log(`   ${t.label} (${t.w}×${t.h})`);
    if (r.overflow) bad++;
  }
  return bad ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c));

module.exports = { judge };
