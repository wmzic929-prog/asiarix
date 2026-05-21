// deep-verify.js — comprehensive blog article quality audit
const fs = require('fs');
const path = require('path');
const https = require('https');
const DIR = __dirname;

const TARGET_ARTICLES = [
  'baccarat-winning-tips','mobile-platform-2025','fps-instant-deposit-tips','welcome-bonus-guide',
  'kyc-verification-guide','usdt-deposit-guide','avoid-blacklist-platforms','withdrawal-fee-comparison',
  'account-security-settings-guide','hk-gambling-tax-guide','baccarat-basics-beginner-guide',
  'weekly-rebate-guide','bank-transfer-deposit-guide','bonus-terms-wagering-guide',
  'referral-code-bonus-guide','live-casino-live-dealer-guide','cashback-rebate-guide',
  'vip-program-guide','new-player-first-deposit-tips','fast-withdrawal-platform-comparison',
  'entertainment-app-download-guide','football-betting-beginner-guide','hk-platform-legal-issues',
  'withdrawal-rejected-reasons','payme-deposit-guide',
  'fps-instant-deposit-story','fps-vs-usdt-platform-comparison','kyc-trap-withdrawal-rejected',
  'baccarat-one-change-second-night',
];

function fetch(url, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && maxRedirects > 0) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        resolve(fetch(redirectUrl, maxRedirects - 1));
        return;
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function deepCheck(slug) {
  const file = path.join(DIR, `${slug}.html`);
  const html = fs.readFileSync(file, 'utf8');
  const issues = [];

  // ── 1. Title vs H1 alignment ────────────────────────────────────────────
  const titleM = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleM ? titleM[1].replace(/<[^>]+>/g,'').trim() : '';
  const h1 = h1M ? h1M[1].replace(/<[^>]+>/g,'').trim() : '';
  if (!title) issues.push('CRIT: missing <title>');
  if (!h1) issues.push('CRIT: missing <h1>');
  if (title && h1) {
    // Check topic overlap (at least 2 words in common or one contains the other)
    const tw = new Set(title.replace(/[^一-鿿\w]/g,' ').split(/\s+/).filter(w=>w.length>1));
    const hw = new Set(h1.replace(/[^一-鿿\w]/g,' ').split(/\s+/).filter(w=>w.length>1));
    const overlap = [...tw].filter(w => hw.has(w)).length;
    if (overlap === 0 && !title.includes(h1.slice(0,4)) && !h1.includes(title.slice(0,4))) {
      issues.push(`WARN: title/H1 no keyword overlap — title:"${title.slice(0,30)}" h1:"${h1.slice(0,30)}"`);
    }
  }

  // ── 2. O3 deep: ALL symbol-range emoji in H2/H3 ─────────────────────────
  const h2h3All = [...html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)];
  const symbolRegex = /[☀-➿\u{1F000}-\u{1FFFF}←-⇿]/u;
  const badHeaders = h2h3All.filter(m => symbolRegex.test(m[1]));
  if (badHeaders.length > 0) {
    badHeaders.forEach(m => issues.push(`O3: symbol in H2/H3: "${m[1].replace(/<[^>]+>/g,'').trim().slice(0,40)}"`));
  }

  // ── 3. JSON-LD: parse and validate FAQPage structure ────────────────────
  const bodyStart = html.indexOf('</style>');
  const body = bodyStart > 0 ? html.slice(bodyStart) : html;
  const jsonLdMatches = [...html.matchAll(/<script[^>]*ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  let faqPageValid = false;
  let faqPageQCount = 0;
  for (const m of jsonLdMatches) {
    try {
      const obj = JSON.parse(m[1]);
      // Flatten: handle both top-level and @graph-wrapped schemas
      const topLevel = Array.isArray(obj) ? obj : [obj];
      const allSchemas = [];
      for (const s of topLevel) {
        if (s['@graph']) allSchemas.push(...s['@graph']);
        else allSchemas.push(s);
      }
      for (const s of allSchemas) {
        if (s['@type'] === 'FAQPage') {
          faqPageValid = true;
          const entries = s.mainEntity || [];
          faqPageQCount = entries.length;
          if (entries.length < 4) issues.push(`O9: FAQPage has only ${entries.length} mainEntity entries (need ≥4)`);
          for (const e of entries) {
            if (!e.name) issues.push('O9: mainEntity entry missing "name" (question)');
            if (!e.acceptedAnswer?.text) issues.push('O9: mainEntity entry missing acceptedAnswer.text');
          }
        }
      }
    } catch(e) {
      issues.push(`O9: JSON-LD parse error: ${e.message.slice(0,60)}`);
    }
  }
  if (!faqPageValid) issues.push('O9: no valid FAQPage JSON-LD found');

  // ── 4. Canonical URL contains correct slug ───────────────────────────────
  const canonM = html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
               || html.match(/href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  if (!canonM) {
    issues.push('META: missing canonical tag');
  } else {
    const canonUrl = canonM[1];
    if (!canonUrl.includes(slug)) {
      issues.push(`META: canonical URL "${canonUrl}" does not contain slug "${slug}"`);
    }
  }

  // ── 5. OG tags: non-empty title and description ──────────────────────────
  const ogTitle = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  const ogDesc  = html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (!ogTitle || ogTitle[1].trim().length < 5) issues.push('META: og:title missing or empty');
  if (!ogDesc  || ogDesc[1].trim().length < 10) issues.push('META: og:description missing or empty');

  // ── 6. Figure quality: figcaption non-empty, has content divs ───────────
  const figureMatches = [...body.matchAll(/<figure[\s\S]*?<\/figure>/gi)];
  let figuresInBody = 0;
  let goodFigures = 0;
  for (const fm of figureMatches) {
    const fig = fm[0];
    figuresInBody++;
    const captionM = fig.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
    const hasCaption = captionM && captionM[1].replace(/<[^>]+>/g,'').trim().length >= 5;
    const divCount = (fig.match(/<div/gi) || []).length;
    if (hasCaption && divCount >= 2) goodFigures++;
  }
  // Only flag if there are NO good-quality info figures (banner-only = no good figures)
  if (figuresInBody > 0 && goodFigures === 0) {
    issues.push(`O7: has ${figuresInBody} figure(s) but none have proper figcaption + data grid`);
  }

  // ── 7. CTA link target ──────────────────────────────────────────────────
  const ctaLinks = [...body.matchAll(/class=["'][^"']*cta[^"']*["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*class=["'][^"']*cta[^"']*["']/gi)];
  // Also check <a> tags containing CTA text
  const ctaBtnLinks = [...body.matchAll(/<a[^>]+class=["'][^"']*cta-btn[^"']*["'][^>]*href=["']([^"']+)["']/gi),
                       ...body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*cta-btn[^"']*["']/gi)];
  const allCtaHrefs = [...ctaLinks, ...ctaBtnLinks].map(m => m[1] || m[2]).filter(Boolean);
  const badCtaLinks = allCtaHrefs.filter(h => h && !h.includes('index.html') && !h.startsWith('http') && !h.startsWith('#'));
  if (badCtaLinks.length > 0) issues.push(`O10: CTA link target suspicious: ${badCtaLinks.join(', ')}`);

  // ── 8. FAQ HTML structure: h3+p pairs inside FAQ section ────────────────
  const faqH2Match = body.match(/<h2[^>]*>[^<]*(常見問題|FAQ)[^<]*<\/h2>/i);
  if (faqH2Match) {
    const faqSection = body.slice(body.indexOf(faqH2Match[0]));
    // Exclude navigation h3s like 相關攻略, 更多攻略, 相關文章
    const NAV_HEADINGS = /相關攻略|更多攻略|相關文章|更多文章/;
    const faqH3s = [...faqSection.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)]
      .filter(m => !NAV_HEADINGS.test(m[1]));
    const faqPs  = [...faqSection.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    if (faqH3s.length < 4) issues.push(`O8: only ${faqH3s.length} FAQ <h3> questions (need ≥4, nav headers excluded)`);
    if (faqPs.length < 4)  issues.push(`O8: only ${faqPs.length} <p> in FAQ section (need ≥4)`);
    faqH3s.forEach((m, i) => {
      const txt = m[1].replace(/<[^>]+>/g,'').trim();
      if (txt.length < 5) issues.push(`O8: FAQ h3 #${i+1} suspiciously short: "${txt}"`);
    });
  }

  // ── 9. No garbled/placeholder text ──────────────────────────────────────
  if (/PLACEHOLDER|TODO|FIXME|%%[A-Z_]+%%/.test(body)) {
    issues.push('CRIT: placeholder text found in body');
  }
  if (/[�]/.test(html)) issues.push('CRIT: replacement character U+FFFD found (encoding issue)');

  // ── 10. Word count in article body only (exclude nav/header/script) ──────
  const articleBody = body
    .replace(/<(script|style|nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const cjk = (articleBody.match(/[一-鿿]/g) || []).length;
  const latin = (articleBody.replace(/[一-鿿]/g,'').match(/\b\w+\b/g) || []).length;
  const wordCount = cjk + latin;
  if (wordCount < 1000) issues.push(`O6: article word count only ${wordCount} (target ≥1500)`);

  // ── 11. Schema: check for BreadcrumbList or Article schema (bonus) ───────
  // (informational only, not a failure)

  return { slug, issues, faqPageQCount, wordCount, figuresInBody, title: title.slice(0,40) };
}

// ── Run all local checks ───────────────────────────────────────────────────
console.log('\n=== Deep Verification Report ===\n');
const results = TARGET_ARTICLES.map(deepCheck);
const clean = results.filter(r => r.issues.length === 0);
const dirty = results.filter(r => r.issues.length > 0);

console.log(`Clean: ${clean.length}/${results.length}   Issues found: ${dirty.length}\n`);

if (dirty.length > 0) {
  console.log('── Articles with issues ──');
  for (const r of dirty) {
    console.log(`\n❌ ${r.slug}`);
    r.issues.forEach(i => console.log(`   ${i}`));
  }
} else {
  console.log('✅ All articles pass deep checks\n');
}

console.log('\n── Stats summary ──');
console.log('Slug'.padEnd(46) + 'Words'.padStart(7) + ' FAQ-Q'.padStart(7) + ' Figs'.padStart(6));
console.log('─'.repeat(66));
for (const r of results) {
  const flag = r.issues.length > 0 ? '❌' : '✅';
  console.log(`${flag} ${r.slug.padEnd(44)} ${String(r.wordCount).padStart(6)} ${String(r.faqPageQCount).padStart(6)} ${String(r.figuresInBody).padStart(5)}`);
}

// ── Live site spot-check (5 articles) ──────────────────────────────────────
const SPOT_CHECK = [
  'kyc-verification-guide',
  'usdt-deposit-guide',
  'baccarat-basics-beginner-guide',
  'bonus-terms-wagering-guide',
  'payme-deposit-guide',
];
const BASE_URL = 'https://spheretap.com/blog/';

async function runLiveChecks() {
  console.log('\n── Live site spot-check (5 articles) ──');
  for (const slug of SPOT_CHECK) {
    const url = BASE_URL + slug + '.html';
    try {
      const res = await fetch(url);
      if (res.status !== 200) {
        console.log(`❌ ${slug} — HTTP ${res.status}`);
        continue;
      }
      const live = res.body;
      // Check that the new figure HTML was deployed
      const hasFigure2 = (live.match(/<figure/gi) || []).length;
      const hasJsonLd = live.includes('FAQPage');
      // Check that ✓ ✗ are gone from h2/h3 in live
      const h2h3Live = [...live.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)];
      const emojiInLive = h2h3Live.filter(m => /[✓✗✔✖]/.test(m[1]));
      const issues = [];
      if (hasFigure2 < 2) issues.push(`only ${hasFigure2} figures`);
      if (!hasJsonLd) issues.push('no FAQPage JSON-LD');
      if (emojiInLive.length > 0) issues.push(`emoji in H2/H3: ${emojiInLive.map(m=>m[1].slice(0,20)).join(' | ')}`);
      if (issues.length === 0) {
        console.log(`✅ ${slug} — ${hasFigure2} figures, FAQPage ✓, no emoji H2/H3`);
      } else {
        console.log(`❌ ${slug} — ${issues.join('; ')}`);
      }
    } catch(e) {
      console.log(`⚠️  ${slug} — fetch error: ${e.message}`);
    }
  }
  console.log('\n=== Complete ===\n');
}

runLiveChecks().catch(console.error);
