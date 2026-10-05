/**
 * G-MAX招待を自動送信 → Gmailから届いたURL取得 → 開いたページを inspect
 * 全部自動
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const DUMP_DIR = join(__dir, '..', 'inspect-dumps');
mkdirSync(DUMP_DIR, { recursive: true });

const CUSTOMER_EMAIL = process.argv[2] || 't3.5ty6@gmail.com';

async function main() {
  console.log('Chrome (9222) に接続…');
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();
  const page = pages.find(p => /granteones.*ARGUMENTS=/.test(p.url())) || pages.find(p => p.url().includes('granteones'));
  if (!page) { console.error('❌ granteonesタブなし'); process.exit(1); }

  // ARGUMENTS 抽出
  const curUrl = page.url();
  const argsMatch = curUrl.match(/ARGUMENTS=([^&]+)/);
  if (!argsMatch) { console.error('❌ ARGUMENTS抽出失敗'); process.exit(1); }
  const args = argsMatch[1];
  console.log(`→ ARGUMENTS: ${args}`);

  // 招待ページに遷移
  const inviteUrl = `https://sslgw.jns-asp.jp/granteones/Magic94Scripts/mgrqispi94.dll?APPNAME=granteones&PRGNAME=invitation_mail_input&ARGUMENTS=${args}`;
  console.log(`→ 招待ページに遷移: ${inviteUrl}`);
  await page.goto(inviteUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  console.log(`→ メアド入力: ${CUSTOMER_EMAIL}`);
  await page.fill('input[name="mailAddress"]', CUSTOMER_EMAIL);

  // ラジオ: UserType=2 (愛用者会員), MailSelect=1 (紹介者)
  console.log('→ UserType=2 (愛用者会員) + MailSelect=1 (紹介者) 選択');
  await page.click('input[name="UserType"][value="2"]');
  await page.click('input[name="MailSelect"][value="1"]');

  await page.waitForTimeout(500);

  // 送信前の状態をdump
  const tsBefore = Date.now();
  writeFileSync(join(DUMP_DIR, `invite-form-filled-${tsBefore}.html`), await page.content(), 'utf8');
  await page.screenshot({ path: join(DUMP_DIR, `invite-form-filled-${tsBefore}.png`), fullPage: true });
  console.log(`📸 送信前: inspect-dumps/invite-form-filled-${tsBefore}.png`);

  console.log('→ 送信ボタンクリック');
  await page.click('button[name="submitBtn"]');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);

  // 送信後ページ
  const tsAfter = Date.now();
  const afterUrl = page.url();
  console.log(`→ 送信後URL: ${afterUrl}`);
  writeFileSync(join(DUMP_DIR, `invite-sent-${tsAfter}.html`), await page.content(), 'utf8');
  await page.screenshot({ path: join(DUMP_DIR, `invite-sent-${tsAfter}.png`), fullPage: true });
  console.log(`📸 送信後: inspect-dumps/invite-sent-${tsAfter}.png`);
  console.log(`📄 送信後HTML: inspect-dumps/invite-sent-${tsAfter}.html`);

  const bodyText = await page.innerText('body').catch(() => '');
  if (bodyText.includes('送信しました') || bodyText.includes('完了') || bodyText.includes('ありがとう')) {
    console.log('✓ 送信成功を示すテキスト検出');
  } else {
    console.log('⚠ 送信成否不明。dumpを確認してください');
  }

  await browser.close().catch(() => {});
  console.log('\n完了');
}

main().catch(err => { console.error('エラー:', err); process.exit(1); });
