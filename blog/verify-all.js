// verify-all.js — 驗證所有升級文章的 10 項 SEO/AEO/GEO 優化
const fs = require('fs');
const path = require('path');

const BLOG_DIR = __dirname;

// 要驗的文章（Phase 1 + Phase 2 + Phase 3）
const TARGET_ARTICLES = [
  // Phase 1
  'baccarat-winning-tips',
  'mobile-platform-2025',
  'fps-instant-deposit-tips',
  'welcome-bonus-guide',
  // Phase 2
  'kyc-verification-guide',
  'usdt-deposit-guide',
  'avoid-blacklist-platforms',
  'withdrawal-fee-comparison',
  'account-security-settings-guide',
  'hk-gambling-tax-guide',
  'baccarat-basics-beginner-guide',
  'weekly-rebate-guide',
  'bank-transfer-deposit-guide',
  'bonus-terms-wagering-guide',
  'referral-code-bonus-guide',
  'live-casino-live-dealer-guide',
  'cashback-rebate-guide',
  'vip-program-guide',
  'new-player-first-deposit-tips',
  'fast-withdrawal-platform-comparison',
  'entertainment-app-download-guide',
  'football-betting-beginner-guide',
  'hk-platform-legal-issues',
  'withdrawal-rejected-reasons',
  'payme-deposit-guide',
  // Phase 3
  'fps-instant-deposit-story',
  'fps-vs-usdt-platform-comparison',
  'kyc-trap-withdrawal-rejected',
  'baccarat-one-change-second-night',
];

function getTextContent(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function countWords(text) {
  // Count CJK characters + Latin words
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  const latin = (text.replace(/[一-鿿㐀-䶿]/g, '').match(/\b\w+\b/g) || []).length;
  return cjk + latin;
}

function check(slug) {
  const file = path.join(BLOG_DIR, `${slug}.html`);
  if (!fs.existsSync(file)) {
    return { slug, error: 'FILE NOT FOUND' };
  }
  const html = fs.readFileSync(file, 'utf8');
  const results = {};

  // O1: title tag exists and non-empty
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  results.O1_title = titleMatch ? titleMatch[1].trim() : null;
  results.O1_ok = !!results.O1_title && results.O1_title.length >= 10;

  // O2: H1 ↔ Title alignment (check H1 exists)
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  results.O2_h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : null;
  results.O2_ok = !!results.O2_h1 && results.O2_h1.length >= 15;

  // O3: No emoji in H2/H3
  const h2h3Matches = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)];
  const emojiRegex = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27FF}]/u;
  const emojiH2H3 = h2h3Matches.filter(m => emojiRegex.test(m[1]));
  results.O3_ok = emojiH2H3.length === 0;
  results.O3_violations = emojiH2H3.map(m => m[1].replace(/<[^>]+>/g, '').trim().slice(0, 40));

  // O4: Emotional hook (first <p> after H1, check for first-person or emotional words)
  const afterH1 = html.slice(html.search(/<h1/i));
  const firstPMatch = afterH1.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const firstP = firstPMatch ? firstPMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  results.O4_firstP = firstP.slice(0, 80);
  results.O4_ok = firstP.length >= 40; // at least some content

  // O5: Long-tail keywords in H2 (check H2 count)
  const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
  results.O5_h2Count = h2Count;
  results.O5_ok = h2Count >= 3;

  // O6: Word count 1500+
  const bodyText = getTextContent(html);
  const wordCount = countWords(bodyText);
  results.O6_wordCount = wordCount;
  results.O6_ok = wordCount >= 1500;

  // Work on body only (after </style>) to avoid CSS false positives
  const bodyStart = html.indexOf('</style>');
  const body = bodyStart > 0 ? html.slice(bodyStart) : html;

  // O7: Inline images with ALT + figures in body (not CSS)
  const imgMatches = [...body.matchAll(/<img[^>]+>/gi)];
  const imgsWithAlt = imgMatches.filter(m => /alt=["'][^"']{3,}/i.test(m[0]));
  const figureCount = (body.match(/<figure/gi) || []).length;
  results.O7_imgWithAlt = imgsWithAlt.length;
  results.O7_figures = figureCount;
  results.O7_ok = (imgsWithAlt.length + figureCount) >= 2;

  // O8: FAQ section — <h2> tag containing FAQ text + h3 count >= 4
  const hasFaqH2 = /<h2[^>]*>[^<]*(常見問題|FAQ)[^<]*<\/h2>/i.test(body);
  const h3InFaq = [...body.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].length;
  results.O8_hasFaqH2 = hasFaqH2;
  results.O8_h3Count = h3InFaq;
  results.O8_ok = hasFaqH2 && h3InFaq >= 4;

  // O9: FAQPage JSON-LD
  const hasJsonLd = html.includes('application/ld+json');
  const hasFaqPage = html.includes('FAQPage');
  results.O9_hasJsonLd = hasJsonLd;
  results.O9_hasFaqPage = hasFaqPage;
  results.O9_ok = hasJsonLd && hasFaqPage;

  // O10: CTA inside article body before FAQ h2
  const faqH2Pos = body.search(/<h2[^>]*>[^<]*(常見問題|FAQ)[^<]*<\/h2>/i);
  const bodyBeforeFaq = faqH2Pos > 0 ? body.slice(0, faqH2Pos) : body;
  const ctaInBody = /class=["'][^"']*cta[^"']*["']|立即|查看|立刻|推薦平台|點擊/i.test(bodyBeforeFaq);
  results.O10_ok = ctaInBody;

  // Overall pass/fail
  const checks = ['O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10'];
  const fails = checks.filter(c => !results[`${c}_ok`]);
  results.pass = fails.length === 0;
  results.fails = fails;

  return { slug, ...results };
}

// Run all
const results = TARGET_ARTICLES.map(check);

// Summary
let passCount = 0;
let failCount = 0;
const failDetails = [];

console.log('\n=== spheretap.com Blog 驗證報告 ===\n');
console.log(`檢查文章數：${results.length}`);

for (const r of results) {
  if (r.error) {
    console.log(`❌ [FILE NOT FOUND] ${r.slug}`);
    failCount++;
    continue;
  }
  if (r.pass) {
    passCount++;
    console.log(`✅ ${r.slug}`);
  } else {
    failCount++;
    console.log(`❌ ${r.slug}  失敗項：${r.fails.join(', ')}`);
    failDetails.push(r);
  }
}

console.log(`\n通過：${passCount} / ${results.length}　失敗：${failCount}`);

if (failDetails.length > 0) {
  console.log('\n=== 失敗詳情 ===\n');
  for (const r of failDetails) {
    console.log(`── ${r.slug} ──`);
    if (r.fails.includes('O1')) console.log(`  O1 title: "${r.O1_title}"`);
    if (r.fails.includes('O2')) console.log(`  O2 H1: "${r.O2_h1}"`);
    if (r.fails.includes('O3')) console.log(`  O3 emoji H2/H3: ${r.O3_violations.join(' | ')}`);
    if (r.fails.includes('O4')) console.log(`  O4 導言: "${r.O4_firstP}"`);
    if (r.fails.includes('O5')) console.log(`  O5 H2 數量: ${r.O5_h2Count} (需 ≥ 3)`);
    if (r.fails.includes('O6')) console.log(`  O6 字數: ${r.O6_wordCount} (需 ≥ 1500)`);
    if (r.fails.includes('O7')) console.log(`  O7 圖片 alt: ${r.O7_imgWithAlt} imgs, ${r.O7_figures} figures (需 ≥ 2)`);
    if (r.fails.includes('O8')) console.log(`  O8 FAQ: hasFaqH2=${r.O8_hasFaqH2}, h3Count=${r.O8_h3Count}`);
    if (r.fails.includes('O9')) console.log(`  O9 JSON-LD: hasJsonLd=${r.O9_hasJsonLd}, hasFaqPage=${r.O9_hasFaqPage}`);
    if (r.fails.includes('O10')) console.log(`  O10 CTA: 文章中段未找到 CTA 關鍵字`);
    console.log('');
  }
}

// Additional checks
console.log('\n=== 補充檢查 ===');

// Check for broken/garbled text patterns (old encoding bugs)
let garbledCount = 0;
for (const slug of TARGET_ARTICLES) {
  const file = path.join(BLOG_DIR, `${slug}.html`);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  // Check for common garbled patterns: ????  or replacement chars
  if (/\?{3,}/.test(html) || /�/.test(html)) {
    console.log(`  ⚠️  亂碼偵測：${slug}`);
    garbledCount++;
  }
}
if (garbledCount === 0) console.log('  ✅ 無亂碼偵測');

// Check for broken external images (Unsplash/Pixabay hotlinks)
let hotlinkCount = 0;
for (const slug of TARGET_ARTICLES) {
  const file = path.join(BLOG_DIR, `${slug}.html`);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  const hotlinks = html.match(/https?:\/\/(images\.unsplash|pixabay\.com|cdn\.pixabay)[^"'>\s]*/g) || [];
  if (hotlinks.length > 0) {
    console.log(`  ⚠️  外部圖片 hotlink：${slug} → ${hotlinks.length} 個`);
    hotlinkCount++;
  }
}
if (hotlinkCount === 0) console.log('  ✅ 無外部圖片 hotlink');

// Check for missing canonical tags
let noCanonical = 0;
for (const slug of TARGET_ARTICLES) {
  const file = path.join(BLOG_DIR, `${slug}.html`);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('rel="canonical"') && !html.includes("rel='canonical'")) {
    console.log(`  ⚠️  缺 canonical：${slug}`);
    noCanonical++;
  }
}
if (noCanonical === 0) console.log('  ✅ 所有文章有 canonical');

// Check for missing OG tags
let noOG = 0;
for (const slug of TARGET_ARTICLES) {
  const file = path.join(BLOG_DIR, `${slug}.html`);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('og:title') && !html.includes('og:description')) {
    console.log(`  ⚠️  缺 OG tags：${slug}`);
    noOG++;
  }
}
if (noOG === 0) console.log('  ✅ 所有文章有 OG tags');

console.log('\n=== 完成 ===\n');
