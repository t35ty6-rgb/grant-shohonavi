/**
 * G-MAX 自動化 本体
 *
 * フロー:
 *   1. Chrome CDP (--remote-debugging-port=9222) に attach
 *      (オーナーが「Chrome起動_デバッグモード.command」で起動 + G-MAXログイン済み)
 *   2. 招待ページ (PRGNAME=invitation_mail_input) に遷移
 *   3. mailAddress + UserType=2 (愛用者会員) + MailSelect=1 (紹介者) で招待送信
 *   4. Gmail から届いた招待URLを取得する部分は呼び出し元で処理 (将来)
 *   5. お客様が登録URLから進んだ後、Step 2 (紹介者情報) にアシスタント情報を入力
 *
 * 現状 Phase 1:
 *   - CDP attach + 招待送信 + (任意で) 送信済み確認
 *   - アシスタント情報は signup URL が返ってから使う
 *
 * 必要: ~/Applications/Google Chrome を --remote-debugging-port=9222 で起動
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.screenshots');
mkdirSync(SHOT_DIR, { recursive: true });

const CDP_URL = 'http://127.0.0.1:9222';
const GMAX_INVITE_PRGNAME = 'invitation_mail_input';

async function connectChrome(log) {
  // Chrome debug port が応答しなければ Chrome を起動
  let needLaunch = false;
  try {
    const r = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(2000) });
    if (!r.ok) needLaunch = true;
  } catch { needLaunch = true; }

  if (needLaunch) {
    log('Chrome(debug) が応答しないので起動します');
    const { spawn } = await import('child_process');
    const PROFILE_DIR = `${process.env.HOME}/.skeleton-granteones-dev-profile`;
    spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--remote-debugging-port=9222',
      `--user-data-dir=${PROFILE_DIR}`,
      'https://sslgw.jns-asp.jp/granteones/',
    ], { detached: true, stdio: 'ignore' }).unref();
    // 起動待ち (最大10秒)
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const r = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(1000) });
        if (r.ok) { log('✓ Chrome 起動完了'); break; }
      } catch {}
    }
  } else {
    // Chrome 動いてるがタブ0ならG-MAX開く
    try {
      const r = await fetch('http://127.0.0.1:9222/json/list', { signal: AbortSignal.timeout(2000) });
      const tabs = r.ok ? await r.json() : [];
      if (!tabs.length) {
        log('Chrome(debug) にタブが無いので G-MAX を開きます');
        const { exec } = await import('child_process');
        exec(`open -a "Google Chrome" --args --user-data-dir="${process.env.HOME}/.skeleton-granteones-dev-profile" "https://sslgw.jns-asp.jp/granteones/"`);
        await new Promise(r => setTimeout(r, 2500));
      }
    } catch {}
  }

  try {
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 10000 });
    log('Chrome (CDP) に接続しました');
    return browser;
  } catch (err) {
    throw new Error(`Chromeに接続できません。「サーバー起動.command」をもう一度ダブルクリックしてください。(${err.message})`);
  }
}

function pickLoggedInPage(ctx) {
  const pages = ctx.pages();
  return pages.find(p => /granteones.*ARGUMENTS=/.test(p.url()))
      || pages.find(p => p.url().includes('granteones'))
      || pages[0];
}

function extractArguments(url) {
  const m = url.match(/ARGUMENTS=([^&]+)/);
  return m ? m[1] : null;
}

/**
 * 招待メール送信 (owner → customer)
 * 戻り値: { ok, args, customerEmail }
 */
async function sendInvite({ page, customerEmail, userType = '2', log }) {
  const curUrl = page.url();
  const args = extractArguments(curUrl);
  if (!args) {
    throw new Error('G-MAXにログインしていません。Chromeで一度ログインしてください。');
  }

  const inviteUrl = `https://sslgw.jns-asp.jp/granteones/Magic94Scripts/mgrqispi94.dll?APPNAME=granteones&PRGNAME=${GMAX_INVITE_PRGNAME}&ARGUMENTS=${args}`;
  log(`招待ページに遷移します`);
  await page.goto(inviteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(1200);

  // タイトル確認
  const title = await page.title();
  if (!title.includes('招待')) {
    throw new Error(`招待ページを開けませんでした (title="${title}")`);
  }

  log(`お客様メールアドレスを入力: ${customerEmail}`);
  await page.fill('input[name="mailAddress"]', customerEmail);

  const userTypeLabel = userType === '1' ? 'ビジネス会員' : '愛用者会員';
  log(`UserType=${userTypeLabel} (value=${userType}) + MailSelect=紹介者 を選択`);
  await page.click(`input[name="UserType"][value="${userType}"]`);
  await page.click('input[name="MailSelect"][value="1"]');
  await page.waitForTimeout(300);

  log('送信ボタンをクリック');
  await page.click('button[name="submitBtn"]');
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  await page.waitForTimeout(2000);

  const bodyText = await page.innerText('body').catch(() => '');
  const sent = bodyText.includes('送信しました')
            || bodyText.includes('完了')
            || bodyText.includes('招待メールを送信');
  if (!sent) {
    log('⚠ 送信完了テキストが検出できませんでした (G-MAX側で確認してください)');
    log(`応答抜粋: ${bodyText.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  log('招待メールの送信リクエストを完了');
  return { ok: true, args };
}

/**
 * メイン: 招待送信のみを行う (Phase 1)
 *
 * Phase 2 以降 (お客様登録ページでのアシスタント情報自動入力 + カート投入) は
 * 招待URL を オーナーがアプリに貼り付けた後に別エンドポイントで走る (automateGmax 側)。
 */
/**
 * スタイリストごとの Chrome プロファイルで G-MAX にログイン・自動入力
 * 各スタイリストに専用プロファイル (~/.skeleton-granteones-stylist-{id})
 * 2回目以降はセッションcookie保持で自動ログイン
 */
async function launchStylistBrowser(stylist, log) {
  const profileDir = `${process.env.HOME}/.skeleton-granteones-stylist-${stylist.id}`;
  log(`スタイリスト「${stylist.name}」用のChromeを起動`);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: 'ja-JP',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  });
  return context;
}

async function ensureLoggedIn(page, stylist, log) {
  log('G-MAX トップページを開きます');
  try {
    await page.goto('https://sslgw.jns-asp.jp/granteones/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (e) {
    log(`❌ G-MAX トップ読み込み失敗: ${e.message}`);
    return false;
  }
  await page.waitForTimeout(1500);
  log(`現在のURL: ${page.url()}`);
  log(`ページタイトル: ${await page.title().catch(() => '?')}`);

  if (extractArguments(page.url())) {
    log('✓ 既存セッションで G-MAX ログイン済み');
    return true;
  }

  log(`G-MAX ログイン: ID=${stylist.gmaxId.slice(0, 3)}***`);
  try {
    const idField = await page.waitForSelector('input[name="sendid"]', { timeout: 5000 }).catch(() => null);
    if (!idField) {
      // dump失敗時ページ
      const shotPath = join(SHOT_DIR, `login-fail-${Date.now()}.png`);
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
      log(`❌ ログインフォームが見つかりません (sendid 無し)`);
      log(`📸 失敗時スクリーンショット: ${shotPath}`);
      return false;
    }
    await page.fill('input[name="sendid"]', stylist.gmaxId);
    log('  ID 入力完了');
    await page.fill('input[name="sendpass"]', stylist.gmaxPass);
    log('  PW 入力完了');

    await page.click('#LoginSubmit');
    log('  ログインボタン click');
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    log(`送信後URL: ${page.url()}`);

    if (extractArguments(page.url())) {
      log('✓ ログイン成功');
      return true;
    }
    const errText = await page.innerText('body').catch(() => '');
    const shotPath = join(SHOT_DIR, `login-fail-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
    log(`📸 失敗時スクリーンショット: ${shotPath}`);
    log(`応答抜粋: ${errText.replace(/\s+/g, ' ').slice(0, 200)}`);
    return false;
  } catch (err) {
    log(`❌ ログイン処理エラー: ${err.message}`);
    return false;
  }
}

export async function sendInviteAndAutomate({ customerEmail, assistant, stylist, items, userType, onProgress }) {
  const log = (msg) => { onProgress?.({ time: new Date().toISOString(), msg }); };

  log('G-MAX自動化を開始します');
  let context;
  try {
    context = await launchStylistBrowser(stylist, log);
  } catch (err) {
    return { ok: false, error: `Chrome起動エラー: ${err.message}` };
  }

  const page = await context.newPage();
  try {
    const loggedIn = await ensureLoggedIn(page, stylist, log);
    if (!loggedIn) {
      return { ok: false, error: `G-MAX ログインに失敗しました。スタイリスト管理で「${stylist.name}」の G-MAX ID/パスワードを確認してください。` };
    }

    const result = await sendInvite({ page, customerEmail, userType, log });
    log(`✓ 招待メール送信完了 → ${customerEmail}`);
    log(`アシスタント: ${assistant.name} (ID: ${assistant.id})`);
    log(`商品: ${items.length}点 の自動投入予定`);
    log('ℹ 現在 Phase 1 (招待送信) のみ稼働中。Phase 2 (お客様登録フォーム自動入力) は 次バージョンで対応');
    return { ok: true, phase: 1, customerEmail, args: result.args, note: '招待送信完了' };
  } catch (err) {
    log(`エラー: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    try { await context.close(); } catch {}
  }
}

/**
 * Phase 2: 招待URLを受け取って、お客様登録フォームを自動入力
 *   - Step 0 (利用規約) → formBunki_next()
 *   - Step 1 (確認項目 checkbox) → policy_check7/8 → formBunki_next()
 *   - Step 2 (紹介者情報) → アシスタント情報を BNR_* に入力 → formBunki_next()
 *   - 以降 Step 3+ はお客様入力 (姓名/メール/生年月日/住所/電話/PW) を一部プリフィル
 *   - 商品選択ページ (⑰) で items を順にカートに追加
 */
export async function automateGmax({ invitationUrl, assistant, customer, items, stylist, onProgress, _page }) {
  const log = (msg) => { onProgress?.({ time: new Date().toISOString(), msg }); };

  let context = null;
  let page = _page;
  if (!page) {
    if (!stylist?.id) return { ok: false, error: 'スタイリスト情報が必要です' };
    try {
      context = await launchStylistBrowser(stylist, log);
    } catch (err) {
      return { ok: false, error: `Chrome起動エラー: ${err.message}` };
    }
    page = await context.newPage();
  }

  try {
    log(`招待URLを開きます: ${invitationUrl.slice(0, 80)}...`);
    await page.goto(invitationUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1500);

    // Step 0: 利用規約 → formBunki_next
    log('Step 0: 利用規約ページ → 次へ');
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.evaluate(() => { if (typeof formBunki_next === 'function') formBunki_next(); }),
    ]);
    await page.waitForTimeout(1500);

    // Step 1: 確認項目 (チェックボックス2つ)
    log(`Step 1: 確認項目にチェック (title: ${await page.title().catch(() => '?')})`);
    await page.check('#policy_check7', { timeout: 3000 }).then(() => log('  ✓ policy_check7')).catch(e => log(`  - policy_check7 skip: ${e.message.slice(0,40)}`));
    await page.check('#policy_check8', { timeout: 3000 }).then(() => log('  ✓ policy_check8')).catch(e => log(`  - policy_check8 skip: ${e.message.slice(0,40)}`));
    await page.waitForTimeout(300);
    log('  formBunki_next 呼び出し');
    await page.evaluate(() => { if (typeof formBunki_next === 'function') formBunki_next(); }).catch(e => log(`  ! formBunki_next error: ${e.message.slice(0,40)}`));
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => log('  (domcontentloaded timeout)'));
    await page.waitForTimeout(1500);
    log(`  → 次ページ到達 (title: ${await page.title().catch(() => '?')})`);

    // ビジネス覚書テスト ページ判定 (ビジネス会員のみ)
    const title2 = await page.title().catch(() => '');
    if (title2.includes('覚書テスト') || title2.includes('会員テスト')) {
      log('Step 2a: ビジネス覚書テスト (13問) を自動解答');
      const quizAnswers = {
        1: '1', 2: '2', 3: '2', 4: '2', 5: '1', 6: '1', 7: '2',
        8: '1', 9: '1', 10: '2', 11: '2', 12: '2', 13: '1',
      };
      for (const [q, v] of Object.entries(quizAnswers)) {
        try {
          await page.check(`input[name="question${q}"][value="${v}"]`, { timeout: 1500 });
          log(`  Q${q}=${v === '1' ? 'はい' : 'いいえ'}`);
        } catch (e) {
          log(`  ! Q${q} 選択失敗`);
        }
      }
      // 覚書テスト は scoring() 関数 で 採点 → テスト結果 ページ
      await Promise.all([
        page.waitForLoadState('domcontentloaded'),
        page.evaluate(() => { if (typeof scoring === 'function') scoring(); }),
      ]);
      await page.waitForTimeout(2500);
      log(`→ テスト結果 (title: ${await page.title().catch(() => '?')})`);
      // テスト結果ページ → 「次へ進む」リンクをクリック
      try {
        const nextHref = await page.$eval('a[href*="signup_class_check"], a:has-text("次へ進む")', a => a.href).catch(() => null);
        if (nextHref) {
          log(`→ 次へ進む: ${nextHref.slice(0, 80)}...`);
          await page.goto(nextHref, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1500);
        }
      } catch (e) {
        log(`⚠ 次へ進むリンク失敗: ${e.message.slice(0, 80)}`);
      }
      log(`覚書テスト完了 → 次 (title: ${await page.title().catch(() => '?')})`);
    }

    // Step 2: 紹介者情報 → アシスタント情報を入力
    log(`Step 2: アシスタント情報を入力 (${assistant.name})`);
    await page.check('input[name="BNR_SELECT"]', { timeout: 1000 }).catch(() => {});
    const fillMap = {
      BNR_ID: assistant.id,
      BNR_NAME: assistant.name,
      BNR_add1p1: assistant.zip1,
      BNR_add1p2: assistant.zip2,
      BNR_add2: assistant.pref,
      BNR_add3: assistant.city,
      BNR_add4: assistant.addr,
      BNR_add5: assistant.bldg || '',
      BNR_TEL: assistant.tel,
    };
    for (const [name, value] of Object.entries(fillMap)) {
      if (value === undefined || value === null) continue;
      try {
        const el = await page.$(`input[name="${name}"]`);
        if (!el) { log(`  - ${name} field なし (skip)`); continue; }
        await el.fill(String(value), { timeout: 1500 });
        log(`  ${name} = ${value}`);
      } catch (e) {
        log(`  ! ${name} 入力失敗: ${e.message.slice(0, 60)}`);
      }
    }

    log('Step 2 完了 → 次へ');
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.evaluate(() => { if (typeof formBunki_next === 'function') formBunki_next(); }),
    ]);
    await page.waitForTimeout(1500);

    // Step 3 到達確認 + ページ構造 dump
    log(`Step 3 URL: ${page.url()}`);
    log(`Step 3 Title: ${await page.title().catch(() => '?')}`);
    try {
      const step3Fields = await page.$$eval('input, select, textarea', els => els.slice(0, 60).map(el => ({
        tag: el.tagName, type: el.type || '', name: el.name || '', id: el.id || '',
        placeholder: el.placeholder || '', required: el.required || false,
      })));
      log(`Step 3 検出フィールド: ${step3Fields.length}`);
      step3Fields.forEach((f, i) => log(`  [${i}] ${f.tag}${f.type?'['+f.type+']':''} name="${f.name}" id="${f.id}" ph="${f.placeholder}"${f.required?' REQ':''}`));
      const ts = Date.now();
      const dumpPath = join(SHOT_DIR, `step3-${ts}.html`);
      const shotPath = join(SHOT_DIR, `step3-${ts}.png`);
      const fs = await import('fs');
      await fs.promises.writeFile(dumpPath, await page.content(), 'utf8');
      await page.screenshot({ path: shotPath, fullPage: true });
      log(`📸 Step 3 dump: ${shotPath}`);
      log(`📄 Step 3 HTML: ${dumpPath}`);
    } catch (e) {
      log(`⚠ Step 3 dump エラー: ${e.message}`);
    }

    // Step 3+: お客様情報を可能な限り入力
    //   具体的なフィールド名は実機 inspect 済み次第、更新する
    //   ここでは name 属性で広めに candidate を試す
    if (customer) {
      log('Step 3+: お客様情報を自動入力');
      // 電話番号を 3-4-4 分割 (ハイフンなし 11桁想定)
      const telDigits = (customer.phone || '').replace(/[^0-9]/g, '');
      const tel1 = telDigits.slice(0, 3), tel2 = telDigits.slice(3, 7), tel3 = telDigits.slice(7, 11);
      const custMap = {
        // 姓名 (漢字)
        P_NAME_D_F_SEI: customer.lastName, P_NAME_D_F_MEI: customer.firstName,
        // 姓名 (カナ)
        P_NAME_D_K_SEI: customer.lastNameKana, P_NAME_D_K_MEI: customer.firstNameKana,
        // 郵便番号
        P_POST_3: customer.zip1, P_POST_4: customer.zip2,
        // 住所
        P_SHI_ADD2: customer.city,
        P_CHOU_ADD3: customer.addr,
        P_BILL_ADD4: customer.bldg || '',
        // 電話番号
        P_TEL1: tel1, P_TEL2: tel2, P_TEL3: tel3,
        // シリアル番号 (QRコード)
        P_MYNUMBER_C: customer.serial || '',
      };
      // 生年月日 (select)
      if (customer.birth) {
        const [y, m, d] = customer.birth.split('-');
        Object.assign(custMap, {
          P_BIRTH_YEAR: y, P_BIRTH_MONTH: String(+m), P_BIRTH_DAY: String(+d),
        });
      }
      let filled = 0;
      for (const [name, value] of Object.entries(custMap)) {
        if (value === undefined || value === null || value === '') continue;
        try {
          const el = await page.$(`input[name="${name}"]`);
          if (!el) continue;
          const type = await el.getAttribute('type').catch(() => 'text');
          if (type === 'hidden') continue;
          await el.fill(String(value), { timeout: 1000 });
          filled++;
          log(`  ✓ ${name}=${String(value).slice(0, 30)}`);
        } catch {}
      }
      // 生年月日 select (P_BIRTH_YEAR/MONTH/DAY)
      if (customer.birth) {
        const [y, m, d] = customer.birth.split('-');
        for (const [name, val] of [['P_BIRTH_YEAR', y], ['P_BIRTH_MONTH', String(+m)], ['P_BIRTH_DAY', String(+d)]]) {
          try {
            const sel = await page.$(`select[name="${name}"]`);
            if (!sel) continue;
            await sel.selectOption(val, { timeout: 1000 });
            filled++;
            log(`  ✓ ${name}=${val}`);
          } catch {}
        }
      }
      // 都道府県 select (P_KEN_ADD1)
      if (customer.pref) {
        try {
          const sel = await page.$('select[name="P_KEN_ADD1"]');
          if (sel) {
            await sel.selectOption({ label: customer.pref }, { timeout: 1000 });
            filled++;
            log(`  ✓ P_KEN_ADD1=${customer.pref}`);
          }
        } catch {}
      }
      // 性別 radio (P_SEX: 1=男, 2=女)
      if (customer.sex) {
        try {
          await page.check(`input[name="P_SEX"][value="${customer.sex}"]`, { timeout: 1000 });
          filled++;
          log(`  ✓ P_SEX=${customer.sex}`);
        } catch {}
      }
      log(`  → 合計 ${filled} 項目入力しました`);
    }

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('✓ お客様情報まで自動入力完了');
    log('⚠ テストモード: 最終送信ボタンは押しません');
    try {
      const fname = `signup-${Date.now()}.png`;
      await page.screenshot({ path: join(SHOT_DIR, fname), fullPage: true });
      log(`📸 スクリーンショット: /screenshots/${fname}`);
      log(`   ブラウザで確認: ${process.env.API_BASE || 'http://localhost:3333'}/screenshots/${fname}`);
    } catch {}
    log('  Chromeを確認して、問題なければ手動で「次へ」「送信」を押してください');
    log('  残: 商品選択(⑰) → 内容確認 → 本登録送信');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return { ok: true, phase: 2, testMode: true, note: 'テストモード: アシスタント+お客様情報まで入力して停止' };
  } catch (err) {
    log(`エラー: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    if (context) {
      try { await context.close(); } catch {}
    }
  }
}
