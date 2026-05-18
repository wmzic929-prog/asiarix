#!/usr/bin/env node
const { google } = require('googleapis');

const {
  GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN,
  GSC_SITE_URL, GSC_SITEMAP_URL,
} = process.env;

if (!GSC_CLIENT_ID || !GSC_CLIENT_SECRET || !GSC_REFRESH_TOKEN) {
  console.error('[sitemap] Missing secrets: GSC_CLIENT_ID, GSC_CLIENT_SECRET, GSC_REFRESH_TOKEN');
  process.exit(1);
}
if (!GSC_SITE_URL || !GSC_SITEMAP_URL) {
  console.error('[sitemap] Missing vars: GSC_SITE_URL, GSC_SITEMAP_URL');
  process.exit(1);
}

(async () => {
  console.log(`[sitemap] Submitting ${GSC_SITEMAP_URL} -> ${GSC_SITE_URL}`);
  const auth = new google.auth.OAuth2(GSC_CLIENT_ID, GSC_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: GSC_REFRESH_TOKEN });
  const wt = google.webmasters({ version: 'v3', auth });
  const res = await wt.sitemaps.submit({ siteUrl: GSC_SITE_URL, feedpath: GSC_SITEMAP_URL });
  console.log(`[sitemap] OK -> HTTP ${res.status}`);
})().catch(err => {
  console.error('[sitemap] FAILED:', err.message);
  process.exit(1);
});
