/**
 * generate-category-pages.js
 * Scans all blog articles, groups by ac-label,
 * and generates one static category index page per label.
 * Output: landing/blog/{slug}.html  (14 pages)
 */

const fs = require('fs');
const path = require('path');

const BLOG_DIR  = path.join(__dirname, 'blog');
const BASE      = 'https://spheretap.com';
const SKIP      = new Set(['_template.html', 'index.html']);

// ac-label → { slug, zhName, metaDesc }
const CAT_META = {
  '新手指南':  { slug: 'newbie-guide',        zhName: '新手指南',  desc: '香港網上娛樂平台新手必讀：開戶教學、迎新優惠領取、常見問題一站解答。' },
  '入款攻略':  { slug: 'deposit-tips',        zhName: '入款攻略',  desc: 'FPS 轉數快、PayMe、USDT、銀行轉帳各種入款方式完整教學，秒速到帳攻略。' },
  '優惠資訊':  { slug: 'bonuses',             zhName: '優惠資訊',  desc: '迎新獎勵、週回贈、反水返水、推薦碼優惠全整合，最筍著數一文睇晒。' },
  '平台評測':  { slug: 'platform-review',     zhName: '平台評測',  desc: '香港線上娛樂平台深度評測：牌照、提款速度、客服質素、用戶口碑完整分析。' },
  '提款教學':  { slug: 'withdrawal-guide',    zhName: '提款教學',  desc: '提款流程、到帳時間、被拒原因及解決方法完整教學，出款無障礙。' },
  '入款教學':  { slug: 'deposit-tutorial',    zhName: '入款教學',  desc: '各種入款方式操作步驟詳解，FPS、PayMe、USDT 圖文教學手把手帶你完成。' },
  '優惠攻略':  { slug: 'bonus-tips',          zhName: '優惠攻略',  desc: '優惠碼使用方法、流水條件拆解、常見陷阱分析，着數最大化攻略。' },
  '遊戲攻略':  { slug: 'game-guide',          zhName: '遊戲攻略',  desc: '百家樂、老虎機、足球投注實戰攻略，技巧、策略、賠率一文掌握。' },
  '平台推薦':  { slug: 'platform-picks',      zhName: '平台推薦',  desc: '2026 香港最推薦娛樂平台精選，安全可靠、快速出款、優惠豐厚平台一覽。' },
  '常見問題':  { slug: 'faq',                 zhName: '常見問題',  desc: '新手最常問的娛樂平台問題解答：開戶、入款、提款、優惠常見疑問全整理。' },
  '安全教學':  { slug: 'security-guide',      zhName: '安全教學',  desc: '帳號安全設定、KYC 認證、防黑名單平台教學，保障個人資料及資金安全。' },
  '平台選擇':  { slug: 'platform-selection',  zhName: '平台選擇',  desc: '如何揀選可靠娛樂平台？5大核心評估指標，避免誤入不可靠平台。' },
  '法律合規':  { slug: 'legal-guide',         zhName: '法律合規',  desc: '香港網上娛樂法律問題完整解析：牌照意義、合規操作、稅務問題一文睇清。' },
  '平台比較':  { slug: 'platform-compare',    zhName: '平台比較',  desc: '香港主流娛樂平台深度橫向對比：支付方式、RTP、提款速度、優惠結構全面比較。' },
};

// --- Step 1: Scan all articles and group by ac-label ---
const files = fs.readdirSync(BLOG_DIR)
  .filter(f => f.endsWith('.html') && !SKIP.has(f));

const articlesByLabel = {};  // label → array of { title, slug, desc, date, label }

for (const file of files) {
  const html = fs.readFileSync(path.join(BLOG_DIR, file), 'utf8');
  const slug = file.replace('.html', '');

  const acMatch = html.match(/class="ac-label">([^<]+)</);
  const label = acMatch ? acMatch[1].trim() : null;
  if (!label || !CAT_META[label]) continue;

  const titleMatch = html.match(/property="og:title"\s+content="([^"]+)"/);
  const descMatch  = html.match(/name="description"\s+content="([^"]+)"/);
  const dateMatch  = html.match(/📅\s*([\d]{4}-[\d]{2}-[\d]{2})/);

  const title = titleMatch ? titleMatch[1] : slug;
  const desc  = descMatch  ? descMatch[1]  : '';
  const date  = dateMatch  ? dateMatch[1]  : '2026-05-15';

  if (!articlesByLabel[label]) articlesByLabel[label] = [];
  articlesByLabel[label].push({ title, slug, desc, date, label });
}

// Sort articles within each label by date desc
for (const label of Object.keys(articlesByLabel)) {
  articlesByLabel[label].sort((a, b) => b.date.localeCompare(a.date));
}

// --- Step 2: Generate one HTML page per label ---
function buildCatPage(label, meta, articles) {
  const { slug, zhName, desc } = meta;
  const canonicalUrl = `${BASE}/blog/${slug}`;
  const articleCards = articles.map((a, i) => `
    <a href="${BASE}/blog/${a.slug}" class="cat-article-card">
      <div class="cac-meta">
        <span class="cac-label">${label}</span>
        <span class="cac-date">${a.date}</span>
      </div>
      <h2 class="cac-title">${a.title.replace(/"/g, '&quot;')}</h2>
      <p class="cac-desc">${a.desc.slice(0, 100)}${a.desc.length > 100 ? '…' : ''}</p>
    </a>`).join('\n');

  const schemaItems = articles.map((a, i) => JSON.stringify({
    '@type': 'ListItem',
    position: i + 1,
    name: a.title,
    url: `${BASE}/blog/${a.slug}`
  })).join(',\n    ');

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonicalUrl}#page`,
        url: canonicalUrl,
        name: `${zhName} — spheretap 攻略中心`,
        description: desc,
        inLanguage: 'zh-Hant-HK',
        isPartOf: { '@type': 'WebSite', '@id': `${BASE}/#website` }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '首頁',   item: `${BASE}/` },
          { '@type': 'ListItem', position: 2, name: '攻略中心', item: `${BASE}/blog` },
          { '@type': 'ListItem', position: 3, name: zhName }
        ]
      },
      {
        '@type': 'ItemList',
        name: `${zhName}文章列表`,
        numberOfItems: articles.length,
        itemListElement: articles.map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: a.title,
          url: `${BASE}/blog/${a.slug}`
        }))
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="zh-Hant-HK">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${zhName}完整攻略 2026 | spheretap 攻略中心</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${zhName}完整攻略 2026 | spheretap 攻略中心">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${BASE}/og-image.jpg">
  <meta property="og:locale" content="zh_HK">
  <meta property="og:site_name" content="spheretap">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${zhName}完整攻略 2026 | spheretap">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${BASE}/og-image.jpg">
  <script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-TQCSL891XL"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-TQCSL891XL');</script>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-KHMKPNV9');</script>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--purple:#6b3ff6;--purple-ultra:#a78bfa;--bg:#f5f3ff;--bg-card:#fff;--text:#0d1440;--text-muted:#6b7db3;--border:#e2d9ff}
    body{font-family:-apple-system,'PingFang HK','Noto Sans TC',sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
    .site-header{background:linear-gradient(90deg,#0d0b2e,#13103a);border-bottom:2px solid var(--purple);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:10px;position:sticky;top:0;z-index:200}
    .site-logo img{height:40px;width:auto;object-fit:contain;display:block}
    .btn-header{background:var(--purple);color:#fff;font-size:13px;font-weight:800;padding:9px 18px;border-radius:50px;text-decoration:none;white-space:nowrap}
    .bc{padding:10px 20px;font-size:12px;color:var(--text-muted);border-bottom:1px solid var(--border);background:#fff}
    .bc a{color:var(--text-muted);text-decoration:none}.bc a:hover{color:var(--purple)}.bc-s{margin:0 6px;opacity:.4}
    .cat-hero{background:linear-gradient(160deg,#0d0b2e,#13103a);padding:40px 20px 32px;text-align:center;border-bottom:1px solid rgba(107,63,246,.2)}
    .cat-hero .cat-chip{display:inline-block;background:rgba(107,63,246,.25);border:1px solid rgba(107,63,246,.5);border-radius:20px;padding:4px 16px;font-size:12px;font-weight:700;color:var(--purple-ultra);letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px}
    .cat-hero h1{font-size:clamp(24px,6vw,38px);font-weight:800;color:#fff;margin-bottom:10px}
    .cat-hero h1 em{font-style:normal;color:var(--purple-ultra)}
    .cat-hero p{font-size:14px;color:rgba(255,255,255,.65);max-width:480px;margin:0 auto 20px}
    .cat-count{font-size:13px;color:rgba(255,255,255,.45)}
    .cat-grid{max-width:1000px;margin:0 auto;padding:32px 20px 56px;display:grid;grid-template-columns:1fr;gap:16px}
    @media(min-width:600px){.cat-grid{grid-template-columns:repeat(2,1fr)}}
    @media(min-width:900px){.cat-grid{grid-template-columns:repeat(3,1fr)}}
    .cat-article-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;text-decoration:none;display:block;transition:border-color .2s,transform .2s,box-shadow .2s}
    .cat-article-card:hover{border-color:rgba(107,63,246,.5);transform:translateY(-2px);box-shadow:0 8px 24px rgba(107,63,246,.12)}
    .cac-meta{display:flex;align-items:center;gap:8px;margin-bottom:10px}
    .cac-label{display:inline-block;background:rgba(107,63,246,.1);border:1px solid rgba(107,63,246,.22);color:var(--purple);font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:20px}
    .cac-date{font-size:10.5px;color:var(--text-muted)}
    .cac-title{font-size:15px;font-weight:700;line-height:1.45;margin-bottom:8px;color:var(--text)}
    .cac-desc{font-size:13px;color:var(--text-muted);line-height:1.6}
    .bottom-cta{background:linear-gradient(160deg,#13103a,#0d0b2e);padding:48px 20px;text-align:center;border-top:1px solid rgba(107,63,246,.15)}
    .bottom-cta h2{font-size:clamp(20px,5vw,28px);font-weight:800;color:#fff;margin-bottom:10px}
    .bottom-cta h2 em{font-style:normal;color:var(--purple-ultra)}
    .bottom-cta p{font-size:14px;color:rgba(255,255,255,.65);margin-bottom:26px}
    .btn-cta{display:inline-flex;align-items:center;gap:8px;background:var(--purple);color:#fff;font-size:18px;font-weight:800;padding:18px 44px;border-radius:50px;text-decoration:none;border:2px solid rgba(255,255,255,.3)}
    footer{padding:14px 20px;text-align:center;font-size:11px;background:#06040f;border-top:1px solid rgba(255,255,255,.04)}
    footer a{color:rgba(255,255,255,.45);text-decoration:none;margin:0 7px}
  </style>
</head>
<body>
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KHMKPNV9" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>

<header class="site-header">
  <a href="${BASE}/" class="site-logo"><img src="../LOGO.svg" alt="spheretap" width="40" height="40"></a>
  <a href="${BASE}/" class="btn-header">領取禮遇</a>
</header>

<nav class="bc" aria-label="breadcrumb">
  <a href="${BASE}/">首頁</a><span class="bc-s">›</span>
  <a href="${BASE}/blog">攻略中心</a><span class="bc-s">›</span>
  ${zhName}
</nav>

<section class="cat-hero">
  <div class="cat-chip">攻略分類</div>
  <h1><em>${zhName}</em>完整攻略</h1>
  <p>${desc}</p>
  <span class="cat-count">共 ${articles.length} 篇文章</span>
</section>

<main class="cat-grid" aria-label="${zhName}文章列表">
${articleCards}
</main>

<section class="bottom-cta">
  <h2>準備好試一試？<br><em>新用戶禮遇等緊你</em></h2>
  <p>立即登記，即享豐厚迎新獎勵，PayMe · FPS · USDT 全支援</p>
  <a href="${BASE}/" class="btn-cta">立即領取迎新禮遇</a>
</section>

<footer>
  <a href="${BASE}/">首頁</a>
  <a href="${BASE}/blog">攻略中心</a>
  <a href="${BASE}/privacy.html">私隱政策</a>
  <a href="${BASE}/terms.html">條款</a>
</footer>
</body>
</html>`;
}

// --- Step 3: Write files ---
let created = 0;
for (const [label, meta] of Object.entries(CAT_META)) {
  const articles = articlesByLabel[label] || [];
  const html = buildCatPage(label, meta, articles);
  const outPath = path.join(BLOG_DIR, `${meta.slug}.html`);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`✓ ${meta.slug}.html [${label}] — ${articles.length} articles`);
  created++;
}

console.log(`\nCreated ${created} category pages.`);
