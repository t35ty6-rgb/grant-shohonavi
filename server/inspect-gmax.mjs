/**
 * G-MAX ページ構造 inspector
 * 用途: Chrome起動_デバッグモード.command で起動したChromeに接続し、
 *       現在開いてるG-MAXページのHTML・フォーム構造を解析する
 *
 * 実行: node inspect-gmax.mjs [URL]
 *       URL省略時 は 現在Chromeで開いてるタブを対象
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = join(__dir, '..', 'inspect-dumps');

async function main() {
  const targetUrl = process.argv[2];

  console.log('Chrome (ポート9222) に接続します…');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222').catch(err => {
    console.error('❌ 接続失敗:', err.message);
    console.error('   「Chrome起動_デバッグモード.command」が起動しているか確認してください');
    process.exit(1);
  });

  const ctxs = browser.contexts();
  if (!ctxs.length) {
    console.error('❌ Chromeにコンテキストがありません');
    process.exit(1);
  }

  const ctx = ctxs[0];
  const pages = ctx.pages();
  console.log(`現在開いてるタブ数: ${pages.length}`);
  pages.forEach((p, i) => console.log(`  [${i}] ${p.url()}`));

  // ARGUMENTS 付き (ログイン済み) の granteones タブを優先
  let page = pages.find(p => /granteones.*ARGUMENTS=/.test(p.url()))
          || pages.find(p => p.url().includes('granteones'))
          || pages[0];
  if (!page) {
    console.error('❌ granteones のタブが見つかりません');
    process.exit(1);
  }
  console.log(`→ 対象タブ: ${page.url().slice(0, 100)}`);

  if (targetUrl) {
    // ARGUMENTS がURLに無ければ現在のタブから抽出して付与
    let navTarget = targetUrl;
    if (!/ARGUMENTS=/.test(navTarget)) {
      const curUrl = page.url();
      const m = curUrl.match(/ARGUMENTS=([^&]+)/);
      if (m) {
        navTarget += (navTarget.includes('?') ? '&' : '?') + 'ARGUMENTS=' + m[1];
        console.log(`→ ARGUMENTS 継承: ${m[1]}`);
      }
    }
    await page.goto(navTarget, { waitUntil: 'domcontentloaded' });
  }

  console.log(`\n対象: ${page.url()}`);
  console.log(`タイトル: ${await page.title()}`);

  const ts = Date.now();
  await import('fs').then(fs => fs.promises.mkdir(DUMP_DIR, { recursive: true }));

  // HTML dump
  const htmlPath = join(DUMP_DIR, `page-${ts}.html`);
  writeFileSync(htmlPath, await page.content(), 'utf8');
  console.log(`📄 HTML保存: ${htmlPath}`);

  // Screenshot
  const shotPath = join(DUMP_DIR, `page-${ts}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log(`📸 Screenshot: ${shotPath}`);

  // フォーム構造解析
  const fields = await page.$$eval('input, select, textarea, button', els => els.map(el => {
    const label = el.closest('tr,label,div')?.querySelector('label,td:first-child,.label')?.textContent?.trim() || '';
    return {
      tag: el.tagName,
      type: el.type || '',
      name: el.name || '',
      id: el.id || '',
      value: (el.value || '').slice(0, 40),
      placeholder: el.placeholder || '',
      text: (el.innerText || el.textContent || '').trim().slice(0, 40),
      labelHint: label.slice(0, 40),
      options: el.tagName === 'SELECT' ? Array.from(el.options).slice(0,5).map(o => o.text) : null,
    };
  }));

  console.log(`\n🔍 検出フィールド/ボタン: ${fields.length}`);
  fields.forEach((f, i) => {
    const parts = [`[${i}]`, f.tag + (f.type ? `[${f.type}]` : '')];
    if (f.name) parts.push(`name="${f.name}"`);
    if (f.id) parts.push(`id="${f.id}"`);
    if (f.text) parts.push(`text="${f.text}"`);
    if (f.placeholder) parts.push(`ph="${f.placeholder}"`);
    if (f.labelHint) parts.push(`label~"${f.labelHint}"`);
    if (f.options) parts.push(`options=${JSON.stringify(f.options)}`);
    console.log('  ' + parts.join(' '));
  });

  // Form構造も吐く
  const forms = await page.$$eval('form', fs => fs.map(f => ({
    action: f.action, method: f.method, name: f.name, id: f.id,
  })));
  if (forms.length) {
    console.log(`\n📋 Form数: ${forms.length}`);
    forms.forEach((f, i) => console.log(`  [${i}] action="${f.action}" method="${f.method}" name="${f.name}" id="${f.id}"`));
  }

  // JSONでも保存 (後で解析しやすい)
  const jsonPath = join(DUMP_DIR, `page-${ts}.json`);
  writeFileSync(jsonPath, JSON.stringify({
    url: page.url(),
    title: await page.title(),
    forms,
    fields,
  }, null, 2));
  console.log(`\n💾 構造JSON: ${jsonPath}`);

  await browser.close().catch(() => {}); // CDPはdisconnectのみ、Chromeは閉じない
  console.log('\n✓ 完了');
}

main().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
