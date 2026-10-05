/**
 * signup flow を 全ステップ 自動walk + dump
 * 各ページ で JavaScript 内 の formBunki_next() を 実行して 次へ
 * フォームにダミー入力して 進める (customer側 シミュレート)
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const INVITE_URL = 'https://sslgw.jns-asp.jp/granteones/Magic94Scripts/mgrqispi94.dll?APPNAME=granteones&PRGNAME=signup_start&ARGUMENTS=%2D%41%31%30%30%30%30%30%30%30%38%31%37%31%70%62%6C%61%32%75';
const DUMP = '/Users/tsukasayoshida/Desktop/Claude/グラント処方ナビ/inspect-dumps';
mkdirSync(DUMP, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
const page = await ctx.newPage();

async function dump(step) {
  const ts = Date.now();
  const base = `${DUMP}/signup-step${String(step).padStart(2,'0')}-${ts}`;
  writeFileSync(`${base}.html`, await page.content(), 'utf8');
  await page.screenshot({ path: `${base}.png`, fullPage: true });

  const title = await page.title();
  const url = page.url();
  console.log(`\n═══ STEP ${step} ═══`);
  console.log(`URL: ${url}`);
  console.log(`Title: ${title}`);
  console.log(`Dump: signup-step${String(step).padStart(2,'0')}-${ts}.html`);

  const fields = await page.$$eval('input, select, textarea, button', els => els.map(el => ({
    tag: el.tagName, type: el.type || '', name: el.name || '', id: el.id || '',
    value: (el.value || '').slice(0, 40), ph: el.placeholder || '',
    text: (el.innerText || el.textContent || '').trim().slice(0, 40),
    required: el.required || false,
    options: el.tagName === 'SELECT' ? Array.from(el.options).slice(0,8).map(o => `${o.value}:${o.text}`) : null,
  })));
  console.log(`Fields: ${fields.length}`);
  fields.slice(0, 50).forEach((f, i) => {
    const parts = [`[${i}]`, f.tag + (f.type ? `[${f.type}]` : '')];
    if (f.name) parts.push(`name="${f.name}"`);
    if (f.id) parts.push(`id="${f.id}"`);
    if (f.value) parts.push(`val="${f.value}"`);
    if (f.text) parts.push(`text="${f.text}"`);
    if (f.ph) parts.push(`ph="${f.ph}"`);
    if (f.required) parts.push('REQUIRED');
    if (f.options) parts.push(`opts=${JSON.stringify(f.options)}`);
    console.log('  ' + parts.join(' '));
  });

  // formBunki_next 系関数が ある か チェック
  const funcs = await page.evaluate(() => {
    const r = [];
    for (const key of Object.keys(window)) {
      if (/^formBunki_|^goNext|^submit[A-Z]/.test(key)) r.push(key);
    }
    return r;
  });
  if (funcs.length) console.log(`JS funcs: ${funcs.join(', ')}`);

  return { url, title, fields, funcs };
}

// Step 0: 利用規約
await page.goto(INVITE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
let info = await dump(0);

if (info.funcs.includes('formBunki_next')) {
  console.log('\n→ formBunki_next() 実行');
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.evaluate(() => formBunki_next()),
  ]);
  await page.waitForTimeout(1500);
  info = await dump(1);
}

// Step 2+: 入力フォーム系。 formBunki_next が ある 限り 繰り返す (max 20)
for (let step = 2; step <= 20; step++) {
  if (!info.funcs.includes('formBunki_next')) {
    console.log('\n(formBunki_next なし — flow 終了 または 入力必須)');
    break;
  }
  console.log(`\n→ step${step} に 進む`);
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.evaluate(() => formBunki_next()),
  ]);
  await page.waitForTimeout(1500);
  info = await dump(step);

  // 必須にダミー入れて次へ (調査用)
  const requiredFields = info.fields.filter(f => f.required && !f.value && ['text','email','tel','password','number'].includes(f.type));
  if (requiredFields.length > 0) {
    console.log(`→ 必須 ${requiredFields.length} 件 に ダミー入力`);
    const DUMMY = {
      BNR_ID: '399125', BNR_NAME: 'テスト アシスタント',
      BNR_add1p1: '910', BNR_add1p2: '0833',
      BNR_add2: '福井県', BNR_add3: '福井市', BNR_add4: 'テスト１－１', BNR_add5: '',
      BNR_TEL: '09000000000',
      Name_SEI: '姓テスト', Name_MEI: '名テスト',
      Kana_SEI: 'セイ', Kana_MEI: 'メイ',
      MAIL: 'test@example.com', TEL: '09000000000', TEL1: '09000000000',
      Birth_year: '1990', Birth_month: '1', Birth_day: '1',
      PASSWORD: 'TestPass123', PASSWORD_CHECK: 'TestPass123',
      add1p1: '910', add1p2: '0833',
      add2: '福井県', add3: '福井市', add4: 'テスト１－１', add5: '',
    };
    for (const f of requiredFields) {
      const val = DUMMY[f.name] || DUMMY[f.id] || (f.type === 'tel' || f.type === 'number' ? '0000000000' : 'test');
      try {
        if (f.name) await page.fill(`input[name="${f.name}"]`, val);
        else if (f.id) await page.fill(`input#${f.id}`, val);
        console.log(`  ${f.name || f.id}[${f.type}] ← ${val}`);
      } catch (e) {
        console.log(`  ! ${f.name || f.id} fill失敗: ${e.message.slice(0,60)}`);
      }
    }
    // select 必須
    try {
      const selOpts = await page.$$eval('select', ss => ss.map(s => ({
        name: s.name, required: s.required,
        opts: Array.from(s.options).map(o => o.value)
      })));
      for (const s of selOpts) {
        if (s.required && s.opts.length > 1 && s.opts[1]) {
          try { await page.selectOption(`select[name="${s.name}"]`, s.opts[1]); console.log(`  select ${s.name} ← ${s.opts[1]}`); } catch {}
        }
      }
    } catch {}
    // checkbox
    try { await page.check('input[name="BNR_SELECT"]'); } catch {}
    try { await page.check('#policy_check7'); } catch {}
    try { await page.check('#policy_check8'); } catch {}
    await page.waitForTimeout(500);
  }
}

await browser.close().catch(()=>{});
console.log('\n完了');
