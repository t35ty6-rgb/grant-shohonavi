/**
 * グラント処方ナビ ローカルAPIサーバー
 * ポート: 3333
 * 起動: node server.mjs
 */

import express from 'express';
import { automateGmax, sendInviteAndAutomate } from './gmax-automate.mjs';
import { randomUUID } from 'crypto';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS: ローカルファイル (file://) と localhost から許可
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// -----------------------------------------------------------
// ジョブ管理
// -----------------------------------------------------------
const jobs = new Map();

// -----------------------------------------------------------
// GET /api/ping
// -----------------------------------------------------------
app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, version: '1.2.0', time: new Date().toISOString() });
});

// -----------------------------------------------------------
// POST /api/invite-and-cart  — ブラウザ起動 → 手動ログイン → 招待送信 + カート設定
//
// Body:
//   customerEmail  string   お客様のメールアドレス
//   customer       object   { lastName, firstName, phone, password }
//   items          array    [{ code, name, color?, size?, qty }]
// -----------------------------------------------------------
const GMAX_LOGIN_URL = 'https://sslgw.jns-asp.jp/granteones/';

app.post('/api/invite-and-cart', async (req, res) => {
  const { customerEmail, customer, items } = req.body;

  if (!customerEmail) return res.status(400).json({ ok: false, error: 'お客様のメールアドレスが必要です' });
  if (!items?.length) return res.status(400).json({ ok: false, error: '商品リストが空です' });

  const jobId = randomUUID();
  const logs = [];
  jobs.set(jobId, { status: 'running', logs, result: null, startedAt: new Date().toISOString() });
  res.json({ ok: true, jobId });

  sendInviteAndAutomate({
    loginUrl: GMAX_LOGIN_URL,
    customerEmail,
    customer: { ...customer, email: customerEmail },
    items,
    onProgress: (entry) => {
      logs.push(entry);
      console.log(`[${jobId.slice(0, 8)}]`, entry.msg);
    },
  })
    .then(result => {
      jobs.get(jobId).status = result.ok ? 'done' : 'failed';
      jobs.get(jobId).result = result;
    })
    .catch(err => {
      jobs.get(jobId).status = 'failed';
      jobs.get(jobId).result = { ok: false, error: err.message };
    });
});

// -----------------------------------------------------------
// POST /api/automate  — 招待URLを直接指定する旧方式（フォールバック）
// -----------------------------------------------------------
app.post('/api/automate', async (req, res) => {
  const { invitationUrl, customer, items, headless = false } = req.body;
  if (!invitationUrl) return res.status(400).json({ ok: false, error: '招待URLが必要です' });
  if (!items?.length) return res.status(400).json({ ok: false, error: '商品リストが空です' });

  const jobId = randomUUID();
  const logs = [];
  jobs.set(jobId, { status: 'running', logs, result: null, startedAt: new Date().toISOString() });
  res.json({ ok: true, jobId });

  automateGmax({
    invitationUrl, customer, items, headless,
    onProgress: (entry) => { logs.push(entry); console.log(`[${jobId.slice(0, 8)}]`, entry.msg); },
  })
    .then(result => { jobs.get(jobId).status = result.ok ? 'done' : 'failed'; jobs.get(jobId).result = result; })
    .catch(err => { jobs.get(jobId).status = 'failed'; jobs.get(jobId).result = { ok: false, error: err.message }; });
});

// -----------------------------------------------------------
// GET /api/status/:jobId
// -----------------------------------------------------------
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: 'ジョブが見つかりません' });
  res.json({ ok: true, status: job.status, logs: job.logs, result: job.result, startedAt: job.startedAt });
});

const PORT = 3333;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n処方ナビ自動化サーバー 起動\nhttp://localhost:${PORT}/api/ping\n`);
});
