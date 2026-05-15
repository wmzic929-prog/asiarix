#!/usr/bin/env node
const { google } = require('googleapis');

const { GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN } = process.env;

if (!GSC_CLIENT_ID || !GSC_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
  console.error('[sitemap] Missing env: GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN');
  process.exit(1);
}

const SITE_URL    = 'sc-domain:spheretap.com';
const SITEMAP_URL = 'https://spheretap.com/sitemap.xml';

(async () => {
  console.log('[sitemap] Requesting access token...');
  const auth = new google.auth.OAuth2(GSC_CLIENT_ID, GSC_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GSC_REFRESH_TOKEN });

  const wt = google.webmasters({ version: 'v3', auth });

  console.log('[sitemap] Submitting sitemap...');
  const res = await wt.sitemaps.submit({ siteUrl: SITE_URL, feedpath: SITEMAP_URL });

  console.log(`[sitemap] OK → HTTP ${res.status} | ${SITEMAP_URL}`);
})().catch(err => {
  console.error('[sitemap] FAILED:', err.message);
  process.exit(1);
});
