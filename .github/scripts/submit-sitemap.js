#!/usr/bin/env node
const https = require('https');

const { GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN } = process.env;

if (!GSC_CLIENT_ID || !GSC_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
  console.error('[sitemap] Missing env: GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN');
  process.exit(1);
}

const SITE_URL = 'sc-domain:spheretap.com';
const SITEMAP_URL = 'https://spheretap.com/sitemap.xml';

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken() {
  const body = new URLSearchParams({
    client_id: GSC_CLIENT_ID,
    client_secret: GSC_CLIENT_SECRET,
    refresh_token: GSC_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }).toString();

  const res = await request({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);

  if (res.status !== 200) throw new Error(`Token exchange failed ${res.status}: ${res.body}`);
  return JSON.parse(res.body).access_token;
}

async function submitSitemap(token) {
  const site = encodeURIComponent(SITE_URL);
  const feed = encodeURIComponent(SITEMAP_URL);

  const res = await request({
    hostname: 'www.googleapis.com',
    path: `/webmasters/v3/sites/${site}/sitemaps/${feed}`,
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Length': 0 },
  }, null);

  if (res.status >= 300) throw new Error(`GSC API error ${res.status}: ${res.body}`);
  console.log(`[sitemap] OK → HTTP ${res.status} | ${SITEMAP_URL}`);
}

(async () => {
  console.log('[sitemap] Requesting access token...');
  const token = await getAccessToken();
  console.log('[sitemap] Submitting sitemap...');
  await submitSitemap(token);
})().catch(err => {
  console.error('[sitemap] FAILED:', err.message);
  process.exit(1);
});
