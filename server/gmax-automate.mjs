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
export async function automateGmax({ invitationUrl, assistant, customer, items, stylist, onProgress, onNeedSerial, _page }) {
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

    // ------------ タイトル駆動 ページハンドラ ループ ------------
    // 各ページで title を見て適切な処理 → formBunki_next → 次ページ
    const seen = new Set();
    for (let step = 0; step < 30; step++) {
      const title = await page.title().catch(() => '');
      const url = page.url();
      const key = title + '|' + url;
      log(`[Step ${step}] title: ${title}`);
      if (seen.has(key)) {
        log(`  ⚠ 同じページに戻った (ループ検知) → 停止`);
        break;
      }
      seen.add(key);

      let handled = false;
      let shouldStop = false;

      // 1. 利用規約
      if (title.includes('利用規約') || title.includes('注意事項')) {
        log('  → 利用規約: 次へ');
        handled = true;
      }
      // 2. 確認項目 (policy checkbox)
      else if (title.includes('確認項目')) {
        log('  → 確認項目: policy_check7/8 → 次へ');
        await page.check('#policy_check7', { timeout: 2000 }).catch(() => {});
        await page.check('#policy_check8', { timeout: 2000 }).catch(() => {});
        handled = true;
      }
      // 3. シリアル番号確認
      else if (title.includes('シリアル番号')) {
        let serial = customer?.serial;
        if (!serial && typeof onNeedSerial === 'function') {
          log(`  → シリアル番号 必要。処方ナビ側で入力を待ちます (最大5分)`);
          try {
            serial = await Promise.race([
              onNeedSerial(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('タイムアウト')), 300000)),
            ]);
            log(`  → シリアル受信: ${serial}`);
          } catch (e) {
            log(`  ⚠ シリアル待機失敗: ${e.message} → 停止`);
            shouldStop = true;
          }
        }
        if (serial && !shouldStop) {
          log(`  → シリアル番号 入力: ${serial}`);
          await page.fill('input[name="NINSYOU_ID"]', serial, { timeout: 2000 }).catch(e => log(`  ! シリアル入力失敗: ${e.message.slice(0,40)}`));
        } else if (!serial) {
          log(`  ⚠ シリアル番号 未入力 → ここで停止`);
          shouldStop = true;
        }
        handled = true;
      }
      // 4. 覚書テスト (業績会員クイズ)
      else if (title.includes('覚書テスト') || title.includes('会員テスト')) {
        // エラー画面 (前回不合格) → 戻るボタン or リンク で 再受験
        if (title.includes('エラー') || title.includes('合格していません')) {
          log('  → 覚書テスト エラー画面 (前回不合格): 戻るクリックで再受験');
          const backLink = await page.$('a:has-text("戻る"), button:has-text("戻る")').catch(() => null);
          if (backLink) {
            await backLink.click({ timeout: 2000 }).catch(e => log(`  ! 戻るクリック失敗: ${e.message.slice(0,40)}`));
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(1500);
            log(`  → 戻った後 title: ${await page.title().catch(() => '?')}`);
          } else {
            // formBunki_back を試す
            await page.evaluate(() => { if (typeof formBunki_back === 'function') formBunki_back(); }).catch(() => {});
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(1500);
          }
          continue;
        }
        if (title.includes('テスト結果') || title.includes('結果')) {
          // テスト結果ページ: 「次へ進む」リンクをクリック (ページ内の全リンク dump → 判定)
          log('  → テスト結果: 次へ進むリンクを探す');
          const links = await page.$$eval('a', as => as.map(a => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 40) })));
          log(`  リンク数: ${links.length}`);
          links.slice(0, 20).forEach((l, i) => log(`    [${i}] "${l.text}" → ${l.href.slice(0, 80)}`));
          // 「次へ進む」というテキストのリンクを優先
          const nextLink = links.find(l => l.text.includes('次へ進む')) || links.find(l => l.text.includes('次へ'));
          if (nextLink && nextLink.href && !nextLink.href.startsWith('javascript:')) {
            log(`  → クリック: "${nextLink.text}" → ${nextLink.href.slice(0, 80)}`);
            await page.goto(nextLink.href, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(1500);
            continue;
          } else if (nextLink && nextLink.href.startsWith('javascript:')) {
            log(`  → JS関数 実行: ${nextLink.href}`);
            await page.click(`a:has-text("${nextLink.text}")`).catch(e => log(`    click失敗: ${e.message.slice(0,40)}`));
            await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(1500);
            continue;
          }
          log('  ⚠ 次へ進むリンクが見つからない → 停止');
          shouldStop = true;
        } else {
          log('  → 覚書テスト: 問題文 読取 → キーワード 判定 → 解答');
          // キーワード → 正答 (1=はい, 2=いいえ) マップ
          // "はい" = コンプライアンス 遵守事項 / "いいえ" = 禁止/違反事項
          const answerRules = [
            { kw: ['クーリングオフ', '説得'], ans: '2' },     // 説得は妨害 = いいえ
            { kw: ['在庫を持った方がよい'], ans: '2' },        // 在庫NG = いいえ
            { kw: ['他社商品', '持ち込んではならない'], ans: '1' }, // 禁止事項が正しい = はい
            { kw: ['他社商品', '宗教'], ans: '1' },
            { kw: ['広告', 'チラシ', '自作'], ans: '2' },     // 自作NG = いいえ
            { kw: ['75才以上', '学生', '登録はできない'], ans: '1' }, // 制限は正しい = はい
            { kw: ['クーリングオフの説明', '絶対'], ans: '1' }, // 法律で必要 = はい
            { kw: ['概要書面', '渡さなくてもよい'], ans: '2' }, // 書面交付必要 = いいえ
            { kw: ['断られても', '契約するまで'], ans: '2' },   // 何度も勧誘NG = いいえ
            { kw: ['SNS', '名称を出さなければ'], ans: '2' },   // SNS全部NG = いいえ
            { kw: ['昇格', '過剰', '認められている'], ans: '2' }, // 過量販売NG = いいえ
            { kw: ['特定商取引法', '薬機法', '学ぶ必要'], ans: '1' }, // 継続学習必要 = はい
            { kw: ['勧誘開始前', '氏名', '商品名', '勧誘目的'], ans: '1' }, // 法律で必要 = はい
            { kw: ['個人情報', '他の目的', '使用してはならない'], ans: '1' }, // プライバシー = はい
            { kw: ['個人情報', 'グラント以外'], ans: '1' },
            { kw: ['ビジネス活動', '継続的'], ans: '1' },
          ];
          // 全質問の text を 取る (G-MAX 構造: div.questionbox > p.p-question > 問題文)
          const quizData = await page.$$eval('input[name^="question"][type="radio"]', radios => {
            const map = {};
            for (const r of radios) {
              const qname = r.name;
              if (map[qname]) continue;
              // 1. 近い questionbox を探す → その中の p.p-question の text
              const qbox = r.closest('.questionbox, div, fieldset, tr');
              let text = '';
              if (qbox) {
                const pQ = qbox.querySelector('.p-question, p');
                if (pQ) text = (pQ.textContent || '').trim();
              }
              // 2. 見つからなければ 親を 上に辿る
              if (text.length < 10) {
                let el = r.parentElement;
                for (let i = 0; i < 6 && el; i++) {
                  const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                  if (t.length > 20 && (t.includes('問') || t.includes('。'))) { text = t; break; }
                  el = el.parentElement;
                }
              }
              map[qname] = text.slice(0, 300);
            }
            return map;
          });
          log(`  検出質問数: ${Object.keys(quizData).length}`);
          let answered = 0;
          for (const [qname, qtext] of Object.entries(quizData)) {
            let answer = null;
            for (const rule of answerRules) {
              if (rule.kw.every(kw => qtext.includes(kw))) { answer = rule.ans; break; }
            }
            if (!answer) {
              log(`  ! ${qname}: 判定不能 → "${qtext.slice(0, 80)}..."`);
              continue;
            }
            try {
              await page.check(`input[name="${qname}"][value="${answer}"]`, { timeout: 1500 });
              answered++;
              log(`  ✓ ${qname}=${answer === '1' ? 'はい' : 'いいえ'} (${qtext.slice(0, 40)}...)`);
            } catch (e) {
              log(`  ! ${qname} 選択失敗: ${e.message.slice(0, 40)}`);
            }
          }
          log(`  → ${answered} 問 解答完了`);
          log('  → scoring() 実行');
          await page.evaluate(() => { if (typeof scoring === 'function') scoring(); }).catch(() => {});
          await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(2000);
          continue;
        }
      }
      // 5. 紹介者情報
      else if (title.includes('紹介者')) {
        log(`  → 紹介者情報: アシスタント ${assistant.name} 入力`);
        await page.check('input[name="BNR_SELECT"]', { timeout: 1000 }).catch(() => {});
        const fillMap = {
          BNR_ID: assistant.id, BNR_NAME: assistant.name,
          BNR_add1p1: assistant.zip1, BNR_add1p2: assistant.zip2,
          BNR_add2: assistant.pref, BNR_add3: assistant.city,
          BNR_add4: assistant.addr, BNR_add5: assistant.bldg || '', BNR_TEL: assistant.tel,
        };
        for (const [n, v] of Object.entries(fillMap)) {
          if (!v) continue;
          try {
            const el = await page.$(`input[name="${n}"]`);
            if (el) { await el.fill(String(v), { timeout: 1500 }); log(`    ✓ ${n}`); }
          } catch {}
        }
        handled = true;
      }
      // 6. お客様情報 (個人情報入力)
      else if (title.includes('個人情報') || title.includes('会員登録') || title.includes('基本情報') || await page.$('input[name="P_NAME_D_F_SEI"]')) {
        log('  → お客様情報入力');
        if (customer) {
          const telD = (customer.phone || '').replace(/[^0-9]/g, '');
          const custMap = {
            P_NAME_D_F_SEI: customer.lastName, P_NAME_D_F_MEI: customer.firstName,
            P_NAME_D_K_SEI: customer.lastNameKana, P_NAME_D_K_MEI: customer.firstNameKana,
            P_POST_3: customer.zip1, P_POST_4: customer.zip2,
            P_SHI_ADD2: customer.city, P_CHOU_ADD3: customer.addr, P_BILL_ADD4: customer.bldg || '',
            P_TEL1: telD.slice(0,3), P_TEL2: telD.slice(3,7), P_TEL3: telD.slice(7,11),
            P_MYNUMBER_C: customer.serial || '',
          };
          let filled = 0;
          for (const [n, v] of Object.entries(custMap)) {
            if (!v) continue;
            try {
              const el = await page.$(`input[name="${n}"]`);
              if (el && (await el.getAttribute('type')) !== 'hidden') {
                await el.fill(String(v), { timeout: 1000 }); filled++; log(`    ✓ ${n}`);
              }
            } catch {}
          }
          if (customer.birth) {
            const [y, m, d] = customer.birth.split('-');
            for (const [n, v] of [['P_BIRTH_YEAR', y], ['P_BIRTH_MONTH', String(+m)], ['P_BIRTH_DAY', String(+d)]]) {
              try { const s = await page.$(`select[name="${n}"]`); if (s) { await s.selectOption(v, { timeout: 1000 }); filled++; } } catch {}
            }
          }
          if (customer.pref) {
            try { const s = await page.$('select[name="P_KEN_ADD1"]'); if (s) { await s.selectOption({ label: customer.pref }, { timeout: 1000 }); filled++; } } catch {}
          }
          if (customer.sex) {
            await page.check(`input[name="P_SEX"][value="${customer.sex}"]`, { timeout: 1000 }).catch(() => {});
          }
          log(`  → ${filled} 項目入力`);
        }
        handled = true;
      }
      // 7. 商品選択 (⑰ カート) → とりあえず次へ (カート実装は後)
      else if (title.includes('商品') || title.includes('カート') || title.includes('注文')) {
        log(`  → 商品選択ページ: ${items?.length || 0} 点 (カート自動投入は未実装、スキップして次へ)`);
        handled = true;
      }
      // 8. 未知のページ → dump → formBunki_next で次へ試行
      else {
        log(`  → 未知のページ: dumpして次へ試行`);
        handled = true;
      }

      // 最終送信ボタン検知 (登録確定/本登録/完了送信 など 不可逆アクション 直前 = STOP)
      const finalBtnText = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn'));
        const texts = btns.map(b => (b.textContent || b.value || '').trim()).filter(Boolean);
        // 「送信」単独ではなく、「本登録」「登録確定」「申込完了」「登録を完了」等の 不可逆 wording
        const dangerPatterns = [/本登録(する|送信|完了)/, /登録(を)?確定/, /申込(を)?完了/, /登録(を)?完了/, /注文(を)?確定/, /購入(を)?確定/, /支払/, /決済/];
        for (const t of texts) {
          for (const p of dangerPatterns) if (p.test(t)) return t;
        }
        return null;
      }).catch(() => null);

      // ページ dump (全step 常に)
      try {
        const ts = Date.now();
        const dp = join(SHOT_DIR, `step-${step}-${ts}.html`);
        const sp = join(SHOT_DIR, `step-${step}-${ts}.png`);
        const fs = await import('fs');
        await fs.promises.writeFile(dp, await page.content(), 'utf8');
        await page.screenshot({ path: sp, fullPage: true });
        log(`  📸 /screenshots/step-${step}-${ts}.png`);
      } catch {}

      if (finalBtnText) {
        log(`  🛑 最終確定ボタン検知: "${finalBtnText}" → ここで停止 (テストモード)`);
        break;
      }
      if (shouldStop) break;
      if (!handled) break;

      // 次へ (formBunki_next)
      log('  → formBunki_next');
      await page.evaluate(() => { if (typeof formBunki_next === 'function') formBunki_next(); }).catch(() => {});
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    log('⚠ テストモード: 最終送信ボタンは押しません');
    try {
      const fname = `signup-final-${Date.now()}.png`;
      await page.screenshot({ path: join(SHOT_DIR, fname), fullPage: true });
      log(`📸 最終スクリーンショット: /screenshots/${fname}`);
    } catch {}
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return { ok: true, phase: 2, testMode: true, note: 'テストモード: 自動入力ループ 完走' };
  } catch (err) {
    log(`エラー: ${err.message}`);
    return { ok: false, error: err.message };
  } finally {
    if (context) {
      try { await context.close(); } catch {}
    }
  }
}
