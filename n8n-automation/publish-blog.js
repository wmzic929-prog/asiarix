#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ── Config ────────────────────────────────────────────────────────────────────
const REPO        = 'wmzic929-prog/spheretap';
const BRANCH      = 'main';
const LANDING_DIR = path.join(__dirname, '..', 'landing');
const TEMPLATE_PATH = path.join(LANDING_DIR, 'blog', '_template.html');

// ── Load GitHub PAT + Pexels key + Pixabay key + CF token ────────────────────
let GITHUB_PAT    = process.env.GITHUB_PAT;
let PEXELS_KEY    = process.env.PEXELS_API_KEY;
let PIXABAY_KEY   = process.env.PIXABAY_API_KEY   || '55791025-8e1269dc628ef1027da4107b3';
let CF_API_TOKEN  = process.env.CF_API_TOKEN;
let CF_ZONE_ID    = process.env.CF_ZONE_ID;
if (!GITHUB_PAT || !PEXELS_KEY || !CF_API_TOKEN || !CF_ZONE_ID) {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    if (!GITHUB_PAT)   { const m = raw.match(/^GITHUB_PAT=(.+)$/m);       if (m) GITHUB_PAT   = m[1].trim(); }
    if (!PEXELS_KEY)   { const m = raw.match(/^PEXELS_API_KEY=(.+)$/m);   if (m) PEXELS_KEY   = m[1].trim(); }
    if (!PIXABAY_KEY)  { const m = raw.match(/^PIXABAY_API_KEY=(.+)$/m);  if (m) PIXABAY_KEY  = m[1].trim(); }
    if (!CF_API_TOKEN) { const m = raw.match(/^CF_API_TOKEN=(.+)$/m);     if (m) CF_API_TOKEN = m[1].trim(); }
    if (!CF_ZONE_ID)   { const m = raw.match(/^CF_ZONE_ID=(.+)$/m);       if (m) CF_ZONE_ID   = m[1].trim(); }
  }
}
if (!GITHUB_PAT) {
  console.error('ERROR: GITHUB_PAT not set. Add GITHUB_PAT=ghp_... to claude-bridge/.env');
  process.exit(1);
}
if (!PEXELS_KEY) {
  console.warn('WARN: PEXELS_API_KEY not set — Pexels fallback disabled.');
}

// ── Read article JSON ─────────────────────────────────────────────────────────
const articlePath = process.argv[2];
if (!articlePath) {
  console.error('Usage: node publish-blog.js <article.json>');
  process.exit(1);
}
const article = JSON.parse(fs.readFileSync(articlePath, 'utf8'));

// ── Pexels fallback ───────────────────────────────────────────────────────────
async function fetchPexelsImageUrl(query) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.pexels.com',
      path: `/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
      method: 'GET',
      headers: { Authorization: PEXELS_KEY },
    };
    https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Pexels HTTP ${res.statusCode}`));
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data.photos || data.photos.length === 0) return reject(new Error('Pexels: no results'));
        resolve(data.photos[0].src.large);
      });
    }).on('error', reject).end();
  });
}

async function hostPexelsImage(imageTheme, slug) {
  if (!PEXELS_KEY) return null;
  try {
    console.log(`  🔍 Pexels search: "${imageTheme}"`);
    const pexelsUrl = await fetchPexelsImageUrl(imageTheme);
    const { buffer, contentType } = await downloadImageBuffer(pexelsUrl);
    if (buffer.length < 5000) throw new Error('Too small');
    const ext = extFromContentType(contentType, pexelsUrl);
    const ghPath = `blog/img/${slug}.${ext}`;
    const existingSha = await getSha(ghPath);
    await putFileBase64(ghPath, buffer.toString('base64'), `chore: add blog image ${slug}.${ext}`, existingSha);
    const hostedUrl = `https://raw.githubusercontent.com/${REPO}/main/${ghPath}`;
    console.log(`  ✓ Pexels image hosted → ${hostedUrl}`);
    return hostedUrl;
  } catch (e) {
    console.warn(`  ⚠ Pexels fallback failed (${e.message})`);
    return null;
  }
}

async function fetchPixabayImageUrl(query) {
  return new Promise((resolve, reject) => {
    https.request({
      hostname: 'pixabay.com',
      path: `/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&image_type=photo&per_page=5&safesearch=true&orientation=horizontal`,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Pixabay HTTP ${res.statusCode}`));
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!data.hits || data.hits.length === 0) return reject(new Error('Pixabay: no results'));
        resolve(data.hits[0].webformatURL);
      });
    }).on('error', reject).end();
  });
}

async function hostPixabayImage(imageTheme, slug) {
  if (!PIXABAY_KEY) return null;
  try {
    console.log(`  🔍 Pixabay search: "${imageTheme}"`);
    const pixUrl = await fetchPixabayImageUrl(imageTheme);
    const { buffer, contentType } = await downloadImageBuffer(pixUrl);
    if (buffer.length < 5000) throw new Error('Too small');
    const ext = extFromContentType(contentType, pixUrl);
    const ghPath = `blog/img/${slug}.${ext}`;
    const existingSha = await getSha(ghPath);
    await putFileBase64(ghPath, buffer.toString('base64'), `chore: add blog image ${slug}.${ext}`, existingSha);
    const hostedUrl = `https://raw.githubusercontent.com/${REPO}/main/${ghPath}`;
    console.log(`  ✓ Pixabay image hosted → ${hostedUrl}`);
    return hostedUrl;
  } catch (e) {
    console.warn(`  ⚠ Pixabay fallback failed (${e.message})`);
    return null;
  }
}

// ── Image hosting ─────────────────────────────────────────────────────────────
function downloadImageBuffer(url, maxRedirects = 6) {
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SphereBot/1.0)', 'Referer': '' },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImageBuffer(res.headers.location, maxRedirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
  });
}

function extFromContentType(ct, urlFallback) {
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif')) return 'gif';
  const m = urlFallback.match(/\.(jpe?g|png|webp|gif)(?:[?#&]|$)/i);
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  return 'jpg';
}

async function hostImage(imageUrl, slug) {
  if (!imageUrl) return null;
  if (imageUrl.includes('spheretap.com') || imageUrl.includes('raw.githubusercontent.com')) {
    return imageUrl;
  }
  try {
    console.log(`  ↓ Downloading image: ${imageUrl.slice(0, 80)}...`);
    const { buffer, contentType } = await downloadImageBuffer(imageUrl);
    if (buffer.length < 1000) throw new Error(`Suspiciously small (${buffer.length} bytes)`);
    const ext = extFromContentType(contentType, imageUrl);
    const ghImagePath = `blog/img/${slug}.${ext}`;
    const existingSha = await getSha(ghImagePath);
    await putFileBase64(ghImagePath, buffer.toString('base64'), `chore: add blog image ${slug}.${ext}`, existingSha);
    console.log(`  ✓ Image hosted → /${ghImagePath}`);
    return `https://raw.githubusercontent.com/${REPO}/main/${ghImagePath}`;
  } catch (e) {
    console.warn(`  ⚠ Image hosting failed (${e.message}) — will use original URL or emoji fallback`);
    return null;
  }
}

// ── CF Cache Purge ────────────────────────────────────────────────────────────
function cfPurgeCache(urls) {
  if (!CF_API_TOKEN || !CF_ZONE_ID) {
    console.warn('  ⚠ CF_API_TOKEN / CF_ZONE_ID not set — skipping cache purge (add to claude-bridge/.env)');
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ files: urls }), 'utf8');
    const req = https.request({
      hostname: 'api.cloudflare.com',
      path:     `/client/v4/zones/${CF_ZONE_ID}/purge_cache`,
      method:   'POST',
      headers: {
        Authorization:   `Bearer ${CF_API_TOKEN}`,
        'Content-Type':  'application/json',
        'Content-Length': body.length,
      },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (j.success) {
          console.log(`  ✓ CF cache purged (${urls.length} URLs)`);
          resolve();
        } else {
          console.warn(`  ⚠ CF purge failed: ${JSON.stringify(j.errors)}`);
          resolve();
        }
      });
    });
    req.on('error', e => { console.warn(`  ⚠ CF purge error: ${e.message}`); resolve(); });
    req.write(body);
    req.end();
  });
}

// ── GitHub helpers ────────────────────────────────────────────────────────────
function ghRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const opts = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        Authorization:  `token ${GITHUB_PAT}`,
        'User-Agent':   'publish-blog-script/1.0',
        Accept:         'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
    };
    if (postData) opts.headers['Content-Length'] = postData.length;
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function getSha(ghPath) {
  const r = await ghRequest('GET', `/repos/${REPO}/contents/${ghPath}?ref=${BRANCH}`);
  if (r.status === 200) return r.body.sha;
  if (r.status === 404) return null;
  throw new Error(`GET ${ghPath} → ${r.status}: ${JSON.stringify(r.body)}`);
}

async function getContent(ghPath) {
  const r = await ghRequest('GET', `/repos/${REPO}/contents/${ghPath}?ref=${BRANCH}`);
  if (r.status !== 200) throw new Error(`GET ${ghPath} → ${r.status}: ${JSON.stringify(r.body)}`);
  return {
    sha:     r.body.sha,
    content: Buffer.from(r.body.content.replace(/\n/g, ''), 'base64').toString('utf8'),
  };
}

async function putFile(ghPath, content, message, sha) {
  const body = { message, content: Buffer.from(content, 'utf8').toString('base64'), branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await ghRequest('PUT', `/repos/${REPO}/contents/${ghPath}`, body);
  if (r.status !== 200 && r.status !== 201)
    throw new Error(`PUT ${ghPath} → ${r.status}: ${JSON.stringify(r.body)}`);
  return r;
}

async function putFileBase64(ghPath, base64Content, message, sha) {
  const body = { message, content: base64Content, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await ghRequest('PUT', `/repos/${REPO}/contents/${ghPath}`, body);
  if (r.status !== 200 && r.status !== 201)
    throw new Error(`PUT ${ghPath} → ${r.status}: ${JSON.stringify(r.body)}`);
  return r;
}

// ── HTML builders ─────────────────────────────────────────────────────────────
function buildFaqHtml(faqJson) {
  if (!faqJson) return '';
  let items;
  try { items = JSON.parse(faqJson); } catch (e) { return ''; }
  if (!Array.isArray(items) || items.length === 0) return '';
  const rows = items.map(q =>
    `<div style="border-bottom:1px solid var(--border);padding:16px 0">` +
    `<h3 style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px">${q.name || ''}</h3>` +
    `<p style="font-size:14px;color:var(--text-light);line-height:1.75;margin:0">${(q.acceptedAnswer && q.acceptedAnswer.text) || ''}</p>` +
    `</div>`
  ).join('');
  return `<div style="margin:36px 0;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:24px 24px 8px">` +
    `<h2 style="font-size:18px;font-weight:800;margin-bottom:4px">常見問題 FAQ</h2>` +
    rows +
    `</div>`;
}

function buildArticleHtml(a) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Blog template not found at ${TEMPLATE_PATH}. Ensure landing/blog/_template.html exists.`);
  }
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  const bannerHtml = a.imageUrl
    ? `<div class="blog-banner"><img src="${a.imageUrl}" alt="${a.h1 || a.title}" loading="lazy"></div>`
    : `<div class="blog-banner" style="background:linear-gradient(135deg,#1a0a4e 0%,#2d1a7e 50%,#1a0a4e 100%);border-radius:12px;height:220px;display:flex;align-items:center;justify-content:center;font-size:80px;">🎰</div>`;

  // Build related articles (use placeholders if not provided)
  const rel1 = a.related && a.related[0] || {};
  const rel2 = a.related && a.related[1] || {};
  const rel3 = a.related && a.related[2] || {};

  // Compute STATS_HTML from statsJson array
  let statsHtml = '';
  if (a.statsJson && Array.isArray(a.statsJson) && a.statsJson.length > 0) {
    const items = a.statsJson.map(s =>
      `<div class="stat-item"><span class="stat-num">${s.num}</span><span class="stat-ctx">${s.ctx}</span><span class="stat-src">${s.src}</span></div>`
    ).join('');
    statsHtml = `<div class="stats-box"><div class="stats-box-title">數據一覽</div><div class="stats-list">${items}</div></div>`;
  }

  // Compute QUOTES_HTML from quoteText + quoteAttr
  let quotesHtml = '';
  if (a.quoteText) {
    quotesHtml = `<div class="quotes-box"><div class="quote-item"><p class="quote-text">${a.quoteText}</p><p class="quote-attr">${a.quoteAttr || ''}</p></div></div>`;
  }

  // Inject body image as <figure> after the first </p> in body HTML
  let bodyHtml = a.body || '';
  if (a.bodyImageUrl) {
    const alt = a.bodyImageAlt || a.bodyImageTheme || a.title;
    const cap = a.bodyImageAlt ? `<figcaption>${a.bodyImageAlt}</figcaption>` : '';
    const fig = `<figure class="body-figure"><img src="${a.bodyImageUrl}" alt="${alt}" loading="lazy">${cap}</figure>`;
    const idx = bodyHtml.indexOf('</p>');
    bodyHtml = idx !== -1
      ? bodyHtml.slice(0, idx + 4) + '\n' + fig + '\n' + bodyHtml.slice(idx + 4)
      : fig + '\n' + bodyHtml;
  }

  const map = {
    '%%TITLE%%':     a.title,
    '%%META_DESC%%': a.metaDesc,
    '%%SLUG%%':      a.slug,
    '%%H1%%':        a.h1 || a.title,
    '%%CATEGORY%%':  a.category,
    '%%DATE%%':          a.date,
    '%%DATE_MODIFIED%%': a.dateModified || a.date,
    '%%READ_MIN%%':  String(a.readMin || 5),
    '%%LEAD%%':      a.lead,
    '%%BANNER_HTML%%': bannerHtml,
    '%%STATS_HTML%%': statsHtml,
    '%%QUOTES_HTML%%': quotesHtml,
    '%%BODY%%':      bodyHtml,
    '%%OG_IMAGE%%':  a.imageUrl || '',
    '%%CTA_H3%%':    a.ctaH3 || '立即體驗最佳娛樂平台',
    '%%CTA_P%%':     a.ctaP  || '選擇信譽平台，安全存款，享受最佳博彩體驗。',
    '%%BANNER_H2%%': a.bannerH2 || a.h1 || a.title,
    '%%BANNER_P%%':  a.bannerP  || a.lead,
    '%%REL1_HREF%%': rel1.href  || 'blog/welcome-bonus-guide.html',
    '%%REL1_CAT%%':  rel1.cat   || '新手指南',
    '%%REL1_TITLE%%': rel1.title || '新手必讀：迎新獎勵點樣領？完整 5 分鐘入門指南',
    '%%REL2_HREF%%': rel2.href  || 'blog/payme-deposit-guide.html',
    '%%REL2_CAT%%':  rel2.cat   || '入款攻略',
    '%%REL2_TITLE%%': rel2.title || 'PayMe 入款教學｜快速入帳全攻略',
    '%%REL3_HREF%%': rel3.href  || 'blog/mobile-platform-recommendation-2025.html',
    '%%REL3_CAT%%':  rel3.cat   || '平台推薦',
    '%%REL3_TITLE%%': rel3.title || '手機版娛樂平台推薦 2025',
    '%%FAQ_JSON%%':  a.faqJson  || '[]',
    '%%FAQ_HTML%%':  buildFaqHtml(a.faqJson),
    '%%EVENT_SLUG%%': a.eventSlug || a.slug,
    '%%PREV_HREF%%':  a.prevHref  || '',
    '%%PREV_TITLE%%': a.prevTitle || '',
    '%%NEXT_HREF%%':  a.nextHref  || '',
    '%%NEXT_TITLE%%': a.nextTitle || '',
  };

  for (const [k, v] of Object.entries(map)) {
    html = html.split(k).join(v || '');
  }

  // Guard: zero tolerance for unreplaced %%PLACEHOLDER%%
  const remaining = html.match(/%%[A-Z0-9_]+%%/g);
  if (remaining) {
    throw new Error(`[buildArticleHtml] Unreplaced placeholders: ${[...new Set(remaining)].join(', ')} — add to map or data/blog-schema.json`);
  }

  return html;
}

function buildBlogListingCard(a) {
  const imgHtml = a.imageUrl
    ? `<img src="${a.imageUrl}" alt="${a.h1 || a.title}" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:0">`
    : '';
  return `<article class="article-card" data-cat="${a.category}">
  <div class="article-thumb" style="background:#111;overflow:hidden">${imgHtml}</div>
  <div class="article-body">
    <div class="article-meta">
      <span class="article-cat">${a.category}</span>
      <span class="article-date">${a.date}</span>
      <span class="article-read">&middot; ${a.readMin || 5} 分鐘</span>
    </div>
    <h2>${a.title}</h2>
    <p class="article-excerpt">${(a.excerpt || a.lead || '').slice(0, 120)}...</p>
    <a href="blog/${a.slug}.html" class="article-link">閱讀全文 →</a>
  </div>
</article>`;
}

function buildIndexBlogCard(a) {
  return `    <a href="blog/${a.slug}.html" class="bp-card">
      <span class="bp-cat">${a.category}</span>
      <h3>${a.title}</h3>
      <p class="bp-desc">${(a.excerpt || a.lead || '').slice(0, 80)}</p>
      <div class="bp-footer"><span>${a.date}</span><span class="bp-read-more">閱讀全文 →</span></div>
    </a>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const { slug } = article;
  if (!slug) throw new Error('Article JSON must have a "slug" field');

  const ghArticle = `blog/${slug}.html`;
  const ghBlog    = 'blog.html';
  const ghIndex   = 'index.html';
  const ghRecent  = 'data/blog-recent.json';
  const ghKeywords = 'data/keywords.json';

  console.log(`\n📰 Publishing blog: ${slug}\n`);

  // 0 — Self-host the banner image (Pexels → Pixabay fallback chain)
  const imageTheme = article.imageTheme || article.image_theme || article.category;
  let hostedImageUrl = article.imageUrl ? await hostImage(article.imageUrl, slug) : null;
  if (!hostedImageUrl) hostedImageUrl = await hostPexelsImage(imageTheme, slug);
  if (!hostedImageUrl) hostedImageUrl = await hostPixabayImage(imageTheme, slug);
  if (hostedImageUrl) {
    article.imageUrl = hostedImageUrl;
  } else {
    delete article.imageUrl;
    console.warn('  ⚠ All image sources failed — will use emoji fallback');
  }

  // 0b — Self-host body image (must differ from cover)
  let hostedBodyImageUrl = article.bodyImageUrl
    ? await hostImage(article.bodyImageUrl, `${slug}-body`)
    : null;
  if (!hostedBodyImageUrl && article.bodyImageTheme) {
    hostedBodyImageUrl = await hostPexelsImage(article.bodyImageTheme, `${slug}-body`);
    if (!hostedBodyImageUrl) hostedBodyImageUrl = await hostPixabayImage(article.bodyImageTheme, `${slug}-body`);
  }
  if (hostedBodyImageUrl) article.bodyImageUrl = hostedBodyImageUrl;

  // 0c — Resolve PREV from blog-recent.json (fetch before we modify it)
  let prevArticle = null;
  try {
    const { content: recentRawEarly } = await getContent(ghRecent);
    const recentEarly = JSON.parse(recentRawEarly);
    prevArticle = recentEarly.articles && recentEarly.articles[0] || null;
  } catch (e) {
    console.warn('  ⚠ Could not fetch blog-recent.json for PREV:', e.message);
  }
  if (prevArticle) {
    article.prevHref  = `blog/${prevArticle.slug}.html`;
    article.prevTitle = prevArticle.title;
    console.log(`  ✓ PREV set: ${prevArticle.slug}`);
  }
  article.nextHref  = '';
  article.nextTitle = '';

  // 1 — Article HTML
  const articleHtml = buildArticleHtml(article);
  const articleSha  = await getSha(ghArticle);
  await putFile(ghArticle, articleHtml, `feat(blog): add article ${slug}`, articleSha);
  console.log(`✓ Article HTML pushed`);

  // 2 — blog.html: insert new card after AI_INJECT_START
  const { sha: blogSha, content: blogHtml } = await getContent(ghBlog);
  const INJECT_START = '<!-- AI_INJECT_START -->';
  if (!blogHtml.includes(INJECT_START)) throw new Error('AI_INJECT_START not found in blog.html');
  const slugLink = `blog/${slug}.html`;
  let newBlogHtml;
  if (blogHtml.includes(slugLink)) {
    // Update existing card
    console.log(`⚠ ${slug} already in blog.html — updating card`);
    const oldCardRegex = new RegExp(
      `<article class="article-card"[^>]*>[\\s\\S]*?href="blog/${slug.replace(/[-]/g, '\\-')}\\.html"[\\s\\S]*?</article>\\n?`,
      'g'
    );
    newBlogHtml = blogHtml.replace(oldCardRegex, buildBlogListingCard(article) + '\n');
  } else {
    newBlogHtml = blogHtml.replace(
      INJECT_START,
      INJECT_START + '\n' + buildBlogListingCard(article)
    );
  }
  await putFile(ghBlog, newBlogHtml, `feat(blog): update ${slug} in blog.html`, blogSha);
  console.log(`✓ blog.html updated`);

  // 3 — blog-recent.json: prepend new entry, keep 3
  const { sha: recentSha, content: recentRaw } = await getContent(ghRecent);
  const recent = JSON.parse(recentRaw);
  const newEntry = {
    slug:     article.slug,
    title:    article.title,
    category: article.category,
    date:     article.date,
    excerpt:  article.excerpt || (article.lead || '').slice(0, 120),
    imageUrl: article.imageUrl || '',
  };
  recent.articles = [newEntry, ...recent.articles.filter(a => a.slug !== slug)].slice(0, 3);
  await putFile(ghRecent, JSON.stringify({ articles: recent.articles }, null, 2), `chore: update blog-recent.json`, recentSha);
  console.log(`✓ blog-recent.json updated`);

  // 4 — index.html BLOG_INJECT block: replace with latest 3 cards
  const { sha: indexSha, content: indexHtml } = await getContent(ghIndex);
  const BLOG_START = '<!-- BLOG_INJECT_START -->';
  const BLOG_END   = '<!-- BLOG_INJECT_END -->';
  const bi = indexHtml.indexOf(BLOG_START);
  const be = indexHtml.indexOf(BLOG_END);
  if (bi === -1 || be === -1) throw new Error('BLOG_INJECT markers not found in index.html');
  const indexCards = recent.articles.map(a => buildIndexBlogCard(a)).join('\n');
  const newIndexHtml =
    indexHtml.slice(0, bi + BLOG_START.length) +
    '\n' + indexCards + '\n    ' +
    indexHtml.slice(be);
  await putFile(ghIndex, newIndexHtml, `feat(blog): update index blog section (${slug})`, indexSha);
  console.log(`✓ index.html updated`);

  // 4b — Update PREV article's NEXT to point to this new article
  if (prevArticle) {
    try {
      const prevGhPath = `blog/${prevArticle.slug}.html`;
      const { sha: prevSha, content: prevHtml } = await getContent(prevGhPath);
      const nextHref = `blog/${slug}.html`;
      const nextTitle = article.title;
      // Replace the art-nav-next href="" with new article href
      const patchedHtml = prevHtml
        .replace(
          /(<a class="art-nav-next" href=")[^"]*(")/,
          `$1${nextHref}$2`
        )
        .replace(
          /(<a class="art-nav-next"[^>]*>[\s\S]*?<span class="art-nav-label">[^<]*<\/span>\s*<span class="art-nav-title">)[^<]*/,
          `$1${nextTitle}`
        );
      if (patchedHtml !== prevHtml) {
        await putFile(prevGhPath, patchedHtml, `fix(nav): set next→${slug} in ${prevArticle.slug}`, prevSha);
        console.log(`✓ PREV article ${prevArticle.slug} NEXT updated → ${slug}`);
      }
    } catch (e) {
      console.warn(`  ⚠ Could not update PREV article NEXT: ${e.message}`);
    }
  }

  // 5 — keywords.json: mark keyword as used
  const { sha: kwSha, content: kwRaw } = await getContent(ghKeywords);
  const kwData = JSON.parse(kwRaw);
  if (article.keywordId) {
    const kw = kwData.keywords.find(k => k.id === article.keywordId);
    if (kw) {
      kw.status = 'used';
      kw.slug = slug;
      kw.used_date = article.date;
      await putFile(ghKeywords, JSON.stringify(kwData, null, 2), `chore: mark keyword ${article.keywordId} as used`, kwSha);
      console.log(`✓ keywords.json updated (keyword #${article.keywordId} → used)`);
    }
  }

  // 6 — Update local copies
  const localBlogDir = path.join(LANDING_DIR, 'blog');
  if (fs.existsSync(localBlogDir)) {
    fs.writeFileSync(path.join(localBlogDir, `${slug}.html`), articleHtml, 'utf8');
  }
  const localBlogHtml = path.join(LANDING_DIR, 'blog.html');
  if (fs.existsSync(localBlogHtml)) {
    fs.writeFileSync(localBlogHtml, newBlogHtml, 'utf8');
  }
  fs.writeFileSync(path.join(LANDING_DIR, 'data', 'blog-recent.json'), JSON.stringify({ articles: recent.articles }, null, 2), 'utf8');
  const localKeywords = path.join(LANDING_DIR, 'data', 'keywords.json');
  if (article.keywordId && fs.existsSync(localKeywords)) {
    fs.writeFileSync(localKeywords, JSON.stringify(kwData, null, 2), 'utf8');
  }
  console.log(`✓ Local files updated`);

  // 7 — Purge CF edge cache so users see new content immediately
  await cfPurgeCache([
    `https://spheretap.com/blog/${slug}.html`,
    'https://spheretap.com/blog.html',
    'https://spheretap.com/blog',
    'https://spheretap.com/index.html',
    'https://spheretap.com/',
  ]);

  console.log(`\n🚀 Done! Article live:`);
  console.log(`   https://spheretap.com/blog/${slug}.html\n`);
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
