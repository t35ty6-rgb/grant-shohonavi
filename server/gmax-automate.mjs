/**
 * G-MAX 招待→登録→カート自動投入 Playwright スクリプト
 *
 * 動作フロー:
 *  1. G-MAXログイン画面をブラウザで開く（スタイリストが手動ログイン）
 *  2. ログイン検知後、招待メールを送信して招待URLを取得
 *  3. 招待URLを開いてお客様情報を登録
 *  4. 商品選択画面 (ステップ⑰) に到達したら各商品をカートに追加
 *  5. 進捗を onProgress コールバックで随時通知
 */

import { chromium } from 'playwright';

// -----------------------------------------------------------
// sendInviteAndAutomate — ブラウザを開いてスタイリストが手動ログイン後、
// 招待メールを送信して招待URLを取得し、カート自動設定まで行う
// -----------------------------------------------------------
export async function sendInviteAndAutomate({ loginUrl, customerEmail, customer, items, onProgress }) {
  const log = (msg) => { onProgress?.({ time: new Date().toISOString(), msg }); };

  log('G-MAXのログイン画面を開いています…');
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
  const page = await ctx.newPage();

  try {
    // ブラウザ閉じられた時のハンドラ
    let closed = false;
    page.on('close', () => { closed = true; });
    browser.on('disconnected', () => { closed = true; });

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log('G-MAXが開きました。ログインだけしてください。');
    log('ログイン後、画面右上のピンクのボタンを押すと招待送信を自動化します。');

    // ログインオーバーレイ (手動確認)
    await waitForManualLogin(page, loginUrl, log);
    if (closed) return { ok: false, error: 'ブラウザが閉じられた' };

    // 招待ページへ遷移
    log('招待ページを探しています…');
    const invitePagePatterns = [
      loginUrl + '?PRGNAME=INVITE', loginUrl + '?PRGNAME=MEMBER_INVITE',
      loginUrl + 'invite', loginUrl + 'member/invite', loginUrl + 'customer/new',
    ];
    let foundInvite = false;
    for (const url of invitePagePatterns) {
      if (closed) return { ok: false, error: 'ブラウザが閉じられた' };
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        const txt = await page.innerText('body').catch(() => '');
        if (txt.includes('招待') || txt.includes('メール送信') || txt.includes('新規会員')) {
          log(`✓ 招待ページ発見: ${url}`);
          foundInvite = true;
          break;
        }
      } catch {}
    }

    if (!foundInvite) {
      log('⚠ 招待ページのURLパターンが見つかりません。G-MAXのトップから手動で招待画面を開いてください。');
      log('→ 画面右上に「招待画面に来た→」ボタン出します');
      await page.evaluate(() => {
        if (document.getElementById('__jobs_at_invite')) return;
        const d = document.createElement('div');
        d.id = '__jobs_at_invite';
        d.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#2f5bd3;color:#fff;padding:14px 18px;border-radius:12px;font:14px -apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:300px';
        d.innerHTML = '<div style="font-weight:700;margin-bottom:8px">招待画面を開いて</div><button id="__jobs_at_invite_btn" style="width:100%;background:#fff;color:#2f5bd3;border:none;padding:10px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px">招待画面に来た →</button>';
        document.body.appendChild(d);
        document.getElementById('__jobs_at_invite_btn').onclick = () => { window.__jobs_at_invite = true; d.remove(); };
      }).catch(() => {});
      const s2 = Date.now();
      while (Date.now() - s2 < 300000 && !closed) {
        await page.waitForTimeout(1500).catch(() => {});
        const ok = await page.evaluate(() => window.__jobs_at_invite === true).catch(() => false);
        if (ok) break;
      }
    }
    if (closed) return { ok: false, error: 'ブラウザが閉じられた' };

    // 招待ページのダンプ + フィールド検出
    const ts = Date.now();
    const htmlPath = `/tmp/gmax-invite-${ts}.html`;
    const shotPath = `/tmp/gmax-invite-${ts}.png`;
    try {
      const fs = await import('fs');
      await fs.promises.writeFile(htmlPath, await page.content(), 'utf8');
      await page.screenshot({ path: shotPath, fullPage: true });
      log(`📸 招待ページ ダンプ: ${shotPath}`);
      log(`📄 招待ページ HTML: ${htmlPath}`);
    } catch (e) {
      log(`⚠ ダンプ失敗: ${e.message}`);
    }

    try {
      const fields = await page.$$eval('input, select, textarea, button', els => els.map(el => ({
        tag: el.tagName, type: el.type || '', name: el.name || '', id: el.id || '',
        value: (el.value || '').slice(0, 20), placeholder: el.placeholder || '',
        text: (el.innerText || el.textContent || '').trim().slice(0, 30),
      })));
      log(`🔍 検出フィールド/ボタン数: ${fields.length}`);
      fields.slice(0, 60).forEach((f, i) => log(`  [${i}] ${f.tag}${f.type?'['+f.type+']':''} name="${f.name}" id="${f.id}" text="${f.text}" ph="${f.placeholder}"`));
    } catch {}

    log('');
    log('✓ Phase 1 完了。ダンプファイルを送ってください（Jobsが読んでフォーム自動入力コードを書きます）:');
    log(`   ${htmlPath}`);
    log('ℹ ブラウザは開いたままにしておきます (手動で招待送信してください)');

    return { ok: true, phase: 1, note: '招待ページ ダンプ取得完了', dumpPath: htmlPath, screenshotPath: shotPath };

  } catch (err) {
    log(`エラー: ${err.message}`);
    const screenshotPath = `/tmp/gmax-invite-error-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    await browser.close();
    return { ok: false, error: err.message, screenshotPath };
  }
}

// ログイン完了を手動で確認するまで待機（最大300秒）
// Playwrightのブラウザ内に「ログイン完了」ボタンを浮かせる → ユーザーが押したら進む
async function waitForManualLogin(page, loginUrl, log, timeoutMs = 300000) {
  // ページ内に浮かぶ確認オーバーレイを注入
  const injectOverlay = async () => {
    await page.evaluate(() => {
      if (document.getElementById('__jobs_login_overlay')) return;
      const d = document.createElement('div');
      d.id = '__jobs_login_overlay';
      d.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#e2477a;color:#fff;padding:14px 18px;border-radius:12px;font:14px -apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:280px;line-height:1.5';
      d.innerHTML = '<div style="font-weight:700;margin-bottom:6px">G-MAXにログインしてください</div><div style="font-size:12px;opacity:.9;margin-bottom:10px">ログインが完了したら下のボタンを押してください</div><button id="__jobs_login_done" style="width:100%;background:#fff;color:#e2477a;border:none;padding:10px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px">ログイン完了 →</button>';
      document.body.appendChild(d);
      document.getElementById('__jobs_login_done').onclick = () => { window.__jobs_login_done = true; d.remove(); };
    }).catch(() => {});
  };

  await injectOverlay();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await page.waitForTimeout(1500);

    // ユーザーがボタンを押したか確認
    const done = await page.evaluate(() => window.__jobs_login_done === true).catch(() => false);
    if (done) {
      log('ログイン完了を確認しました。処理を続行します…');
      return;
    }

    // ページが遷移したら再注入
    await injectOverlay();

    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed > 0 && elapsed % 30 === 0) {
      log(`ログイン待機中… (${elapsed}秒経過、残り${Math.round((timeoutMs-Date.now()+start)/1000)}秒)`);
    }
  }
  throw new Error('ログインタイムアウト (5分)。ブラウザ内の「ログイン完了」ボタンを押してください。');
}

async function sendInvitationEmail(page, customerEmail, baseUrl, log) {
  const invitePagePatterns = [
    baseUrl + '?PRGNAME=INVITE',
    baseUrl + '?PRGNAME=MEMBER_INVITE',
    baseUrl + 'invite',
    baseUrl + 'member/invite',
    baseUrl + 'customer/new',
  ];

  for (const url of invitePagePatterns) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      const txt = await page.innerText('body').catch(() => '');
      if (txt.includes('招待') || txt.includes('メール') || txt.includes('会員')) {
        log(`招待ページ発見: ${url}`);
        break;
      }
    } catch {}
  }

  // ページ構造をダンプ (次回セレクタ特定のため)
  const ts = Date.now();
  const htmlPath = `/tmp/gmax-invite-${ts}.html`;
  const shotPath = `/tmp/gmax-invite-${ts}.png`;
  try {
    const fs = await import('fs');
    const html = await page.content();
    await fs.promises.writeFile(htmlPath, html, 'utf8');
    await page.screenshot({ path: shotPath, fullPage: true });
    log(`📸 招待ページ ダンプ: ${shotPath}`);
    log(`📄 招待ページ HTML: ${htmlPath}`);
  } catch (e) {
    log(`⚠ ダンプ失敗: ${e.message}`);
  }

  // ページ内の全フィールドをログに吐く (セレクタ発見用)
  try {
    const fields = await page.$$eval('input, select, textarea', els => els.map(el => ({
      tag: el.tagName,
      type: el.type || '',
      name: el.name || '',
      id: el.id || '',
      placeholder: el.placeholder || '',
    })));
    log(`🔍 検出フィールド数: ${fields.length}`);
    fields.slice(0, 30).forEach((f, i) => log(`  [${i}] ${f.tag}${f.type?'['+f.type+']':''} name=${f.name} id=${f.id} ph="${f.placeholder}"`));
  } catch {}

  log('⏸ 招待ページで一時停止。ブラウザ内で手動で招待メール送信してください。');
  log('⏸ 送信完了後、画面右上の青いボタンを押すと処理が続行されます。');

  // 「次へ」オーバーレイを表示
  await page.evaluate(() => {
    if (document.getElementById('__jobs_proceed_overlay')) return;
    const d = document.createElement('div');
    d.id = '__jobs_proceed_overlay';
    d.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#2f5bd3;color:#fff;padding:14px 18px;border-radius:12px;font:14px -apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:300px;line-height:1.5';
    d.innerHTML = '<div style="font-weight:700;margin-bottom:6px">招待メール送信してください</div><div style="font-size:12px;opacity:.9;margin-bottom:10px">このG-MAX画面で招待メールの操作をしてください。終わったら下のボタン。</div><button id="__jobs_proceed_done" style="width:100%;background:#fff;color:#2f5bd3;border:none;padding:10px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px">次へ →</button>';
    document.body.appendChild(d);
    document.getElementById('__jobs_proceed_done').onclick = () => { window.__jobs_proceed_done = true; d.remove(); };
  }).catch(() => {});

  // 最大5分待機
  const start = Date.now();
  while (Date.now() - start < 300000) {
    await page.waitForTimeout(1500);
    const done = await page.evaluate(() => window.__jobs_proceed_done === true).catch(() => false);
    if (done) {
      log('✓ 招待送信完了を確認');
      return 'MANUAL_INVITE_SENT';
    }
  }

  return null;
}

// -----------------------------------------------------------
// セレクタ設定 (G-MAXの実際のDOMに合わせて調整)
// -----------------------------------------------------------
const SEL = {
  // 登録フォーム各フィールド (name属性 or input type で探す)
  lastName:   'input[name*="sei"], input[name*="lastname"], input[placeholder*="姓"]',
  firstName:  'input[name*="mei"], input[name*="firstname"], input[placeholder*="名"]',
  phone:      'input[name*="tel"], input[name*="phone"], input[type="tel"]',
  password:   'input[name*="pass"], input[type="password"]',
  passwordConf: 'input[name*="pass2"], input[name*="passconf"], input[type="password"]:nth-of-type(2)',
  email:      'input[name*="mail"], input[type="email"]',

  // 商品検索 (ステップ⑰: 商品コード入力)
  searchInput: 'input[name*="srch"], input[name*="search"], input[name*="hinban"], input[placeholder*="商品コード"], input[placeholder*="コード"]',
  searchBtn:   'input[type="submit"][value*="検索"], button:has-text("検索"), input[name*="btn"][value*="検索"]',

  // カートに追加
  addToCart:   'input[type="submit"][value*="カート"], button:has-text("カートに入れる"), input[value*="カートに入れる"]',

  // 「次へ」「確認」系ボタン
  nextBtn:     'input[type="submit"][value*="次"], input[type="submit"][value*="登録"], button:has-text("次へ"), button:has-text("登録")',

  // ページ判定用キーワード
  step17Hint:  ['商品選択', '初回商品', 'カートに追加', '商品コード'],
  registrationHint: ['会員登録', '新規登録', 'お客様情報', 'ご登録'],
  completionHint:   ['登録完了', 'マイページ', 'ホーム'],
};

// -----------------------------------------------------------
// メイン処理
// -----------------------------------------------------------
export async function automateGmax({ invitationUrl, customer, items, onProgress, headless = false }) {
  const log = (msg, data = null) => {
    const entry = { time: new Date().toISOString(), msg, ...(data ? { data } : {}) };
    onProgress?.(entry);
  };

  log('Playwright 起動中…');

  const browser = await chromium.launch({
    headless,
    args: ['--no-sandbox'],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'ja-JP',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  });

  const page = await ctx.newPage();

  try {
    // ステップ1: 招待URLを開く
    log('招待URLを開いています…', { url: invitationUrl });
    await page.goto(invitationUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const title1 = await page.title();
    log('ページ読み込み完了', { title: title1 });

    // ステップ2: 登録フォームを検出・入力
    const pageText = await page.innerText('body').catch(() => '');
    const isRegistration = SEL.registrationHint.some(kw => pageText.includes(kw));

    if (isRegistration && customer) {
      log('登録フォームを検出。お客様情報を入力します…');
      await fillRegistrationForm(page, customer, log);
    } else if (!isRegistration) {
      log('登録フォームが見つかりません。商品選択画面を探します…');
    }

    // ステップ3: 商品選択画面 (ステップ⑰) まで待機
    log('商品選択画面への遷移を待っています…');
    await waitForStep17(page, log);

    // ステップ4: 各商品をカートに投入
    log(`${items.length} 点の商品をカートに追加します…`);
    const results = [];
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      log(`[${idx + 1}/${items.length}] ${item.name} (${item.code}) を追加中…`);
      const ok = await addItemToCart(page, item, log);
      results.push({ ...item, ok });
      if (!ok) {
        log(`⚠ ${item.name} の追加に失敗しました。スキップして次の商品に進みます。`);
      }
      await page.waitForTimeout(800);
    }

    const succeeded = results.filter(r => r.ok).length;
    log(`完了: ${succeeded}/${items.length} 点をカートに追加しました。`, { results });

    const finalUrl = page.url();
    return { ok: true, results, finalUrl };

  } catch (err) {
    log(`エラーが発生しました: ${err.message}`);
    const screenshotPath = `/tmp/gmax-error-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    return { ok: false, error: err.message, screenshotPath };
  } finally {
    await browser.close();
  }
}

// -----------------------------------------------------------
// 登録フォーム入力
// -----------------------------------------------------------
async function fillRegistrationForm(page, customer, log) {
  const fill = async (sel, val, label) => {
    if (!val) return;
    try {
      const el = await page.$(sel);
      if (el) {
        await el.fill(val);
        log(`  入力: ${label} = ${label.includes('パス') ? '****' : val}`);
        return true;
      }
    } catch (_) {}
    // フォールバック: placeholder/aria-label などで探す
    return false;
  };

  await fill(SEL.lastName,    customer.lastName,    '姓');
  await fill(SEL.firstName,   customer.firstName,   '名');
  await fill(SEL.phone,       customer.phone,       '電話番号');
  await fill(SEL.email,       customer.email,       'メール');
  await fill(SEL.password,    customer.password,    'パスワード');
  await fill(SEL.passwordConf,customer.password,    'パスワード確認');

  // ラジオボタン・チェックボックスがあれば性別を選択
  if (customer.gender === 'female') {
    await page.$('input[value*="女"][type="radio"]').then(el => el?.click()).catch(() => {});
    await page.$('input[value="2"][type="radio"]').then(el => el?.click()).catch(() => {});
  }

  // 生年月日 select
  if (customer.birthYear) {
    await selectByValue(page, 'select[name*="year"], select[name*="nen"]', customer.birthYear).catch(() => {});
    await selectByValue(page, 'select[name*="month"], select[name*="tsuki"]', customer.birthMonth).catch(() => {});
    await selectByValue(page, 'select[name*="day"], select[name*="nichi"]', customer.birthDay).catch(() => {});
  }

  log('登録フォーム入力完了。送信します…');
  await page.waitForTimeout(500);

  // 「次へ」「登録」ボタンをクリック
  const submitted = await clickFirst(page, SEL.nextBtn);
  if (!submitted) {
    // フォームをsubmit
    await page.$('form').then(f => f?.evaluate(el => el.submit())).catch(() => {});
  }

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);

  // 確認ページがあればもう1回submit
  const confirmText = await page.innerText('body').catch(() => '');
  if (confirmText.includes('確認') && (confirmText.includes('登録') || confirmText.includes('送信'))) {
    log('確認ページを検出。確定送信します…');
    await clickFirst(page, SEL.nextBtn);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
  }
}

// -----------------------------------------------------------
// 商品選択画面まで待機 (最大60秒、5秒ごとに再チェック)
// -----------------------------------------------------------
async function waitForStep17(page, log, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const txt = await page.innerText('body').catch(() => '');
    if (SEL.step17Hint.some(kw => txt.includes(kw))) {
      log('商品選択画面に到達しました。');
      return true;
    }
    // ページが変わっている場合はリロード待機ではなくそのまま
    await page.waitForTimeout(5000);
    const elapsed = Math.round((Date.now() - start) / 1000);
    log(`商品選択画面を待機中… (${elapsed}秒経過)`);
  }
  throw new Error('商品選択画面への到達タイムアウト (60秒)。お客様がまだ登録中か、画面遷移が想定と異なります。');
}

// -----------------------------------------------------------
// 1商品をカートに追加
// -----------------------------------------------------------
async function addItemToCart(page, item, log) {
  try {
    // 商品コード検索
    const searchEl = await page.$(SEL.searchInput);
    if (searchEl) {
      await searchEl.fill('');
      await searchEl.fill(item.code);
      await page.waitForTimeout(300);

      // 検索ボタン押下
      const btnEl = await page.$(SEL.searchBtn);
      if (btnEl) {
        await btnEl.click();
      } else {
        await searchEl.press('Enter');
      }
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
    } else {
      // 商品一覧から商品コードで探す
      const codeEl = await page.$(`[data-code="${item.code}"], [value="${item.code}"]`);
      if (!codeEl) {
        log(`  商品コード ${item.code} の入力フォームが見つかりません`);
        return false;
      }
    }

    // カラー選択
    if (item.color) {
      await selectByText(page, 'select', item.color).catch(() =>
        page.$(`input[value="${item.color}"]`).then(el => el?.click()).catch(() => {}));
    }

    // サイズ選択
    if (item.size) {
      await selectByText(page, 'select', item.size).catch(() =>
        page.$(`input[value="${item.size}"]`).then(el => el?.click()).catch(() => {}));
    }

    // 数量
    if (item.qty > 1) {
      const qtyEl = await page.$('input[name*="qty"], input[name*="suryo"], input[name*="quantity"], input[type="number"]');
      if (qtyEl) await qtyEl.fill(String(item.qty));
    }

    // 「カートに入れる」
    const addBtn = await page.$(SEL.addToCart);
    if (!addBtn) {
      log(`  「カートに入れる」ボタンが見つかりません`);
      return false;
    }

    await addBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);

    // 追加成功確認
    const afterTxt = await page.innerText('body').catch(() => '');
    if (afterTxt.includes('カートに追加') || afterTxt.includes('追加しました')) {
      return true;
    }
    // エラーメッセージがなければ成功とみなす
    if (!afterTxt.includes('エラー') && !afterTxt.includes('失敗')) {
      return true;
    }
    return false;

  } catch (err) {
    log(`  エラー: ${err.message}`);
    return false;
  }
}

// -----------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------
async function selectByValue(page, selector, value) {
  if (!value) return;
  const els = await page.$$(selector);
  for (const el of els) {
    await el.selectOption({ value: String(value) }).catch(() =>
      el.selectOption({ label: String(value) }).catch(() => {}));
  }
}

async function selectByText(page, selector, text) {
  if (!text) return false;
  const els = await page.$$(selector);
  for (const el of els) {
    const options = await el.$$eval('option', opts =>
      opts.map(o => ({ value: o.value, text: o.textContent?.trim() })));
    const match = options.find(o => o.text === text || o.text?.includes(text));
    if (match) {
      await el.selectOption({ value: match.value });
      return true;
    }
  }
  return false;
}

async function clickFirst(page, selector) {
  const el = await page.$(selector).catch(() => null);
  if (el) {
    await el.click();
    return true;
  }
  return false;
}
