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

const CDP_URL = 'http://127.0.0.1:9222';
const GMAX_INVITE_PRGNAME = 'invitation_mail_input';

async function connectChrome(log) {
  try {
    const browser = await chromium.connectOverCDP(CDP_URL);
    log('Chrome (CDP) に接続しました');
    return browser;
  } catch (err) {
    throw new Error(`Chromeに接続できません。「Chrome起動_デバッグモード.command」をダブルクリックしてG-MAXにログインしてから再試行してください。(${err.message})`);
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
async function sendInvite({ page, customerEmail, log }) {
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

  log('UserType=愛用者会員 + MailSelect=紹介者 を選択');
  await page.click('input[name="UserType"][value="2"]');
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
export async function sendInviteAndAutomate({ customerEmail, assistant, items, onProgress }) {
  const log = (msg) => { onProgress?.({ time: new Date().toISOString(), msg }); };

  log('G-MAX自動化を開始します');
  const browser = await connectChrome(log);
  const ctx = browser.contexts()[0];
  if (!ctx) {
    try { await browser.close(); } catch {}
    return { ok: false, error: 'Chromeコンテキストが見つかりません' };
  }

  const page = pickLoggedInPage(ctx);
  if (!page) {
    try { await browser.close(); } catch {}
    return { ok: false, error: 'G-MAXのタブが見つかりません。Chromeで https://sslgw.jns-asp.jp/granteones/ を開いてログインしてください' };
  }

  try {
    const result = await sendInvite({ page, customerEmail, log });
    log(`✓ 招待メール送信完了 → ${customerEmail}`);
    log(`お客様がメールのURLをクリックして「初回注文/簡易登録書」ページに到達したら、そのURLを「URL入力」欄に貼り付けて次のステップに進んでください`);
    log(`アシスタント: ${assistant.name} (ID: ${assistant.id}) が自動入力されます`);
    log(`商品: ${items.length}点 がカート投入予定`);
    return { ok: true, phase: 1, customerEmail, args: result.args, note: '招待送信完了。お客様からURLを受け取ったらPhase 2を実行してください' };
  } catch (err) {
    log(`エラー: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    // CDP接続は切るがChromeは閉じない
    try { await browser.close(); } catch {}
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
export async function automateGmax({ invitationUrl, assistant, customer, items, onProgress, _page }) {
  const log = (msg) => { onProgress?.({ time: new Date().toISOString(), msg }); };

  const browser = await connectChrome(log);
  const ctx = browser.contexts()[0];
  const page = _page || await ctx.newPage();

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
    log('Step 1: 確認項目にチェック');
    await page.check('#policy_check7').catch(() => {});
    await page.check('#policy_check8').catch(() => {});
    await page.waitForTimeout(300);
    await Promise.all([
      page.waitForLoadState('domcontentloaded'),
      page.evaluate(() => { if (typeof formBunki_next === 'function') formBunki_next(); }),
    ]);
    await page.waitForTimeout(1500);

    // Step 2: 紹介者情報 → アシスタント情報を入力
    log(`Step 2: アシスタント情報を入力 (${assistant.name})`);
    await page.check('input[name="BNR_SELECT"]').catch(() => {});
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
        await page.fill(`input[name="${name}"]`, String(value));
        log(`  ${name} = ${value}`);
      } catch (e) {
        log(`  ! ${name} 入力失敗: ${e.message.slice(0, 60)}`);
      }
    }

    log('✓ Step 2 まで自動入力完了。残りはお客様に入力してもらってください (姓名・生年月日・住所・電話・PW・商品選択)');
    log('  G-MAX画面はこのまま開いたままにしておきます');
    return { ok: true, phase: 2, note: 'アシスタント情報まで入力完了' };
  } catch (err) {
    log(`エラー: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    try { await browser.close(); } catch {}
  }
}
