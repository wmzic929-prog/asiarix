const fs = require('fs');
const path = require('path');

const NAV_CSS = `\n  /* article-nav */\n  .article-nav{display:flex;gap:12px;margin:36px 0 0;padding:28px 0 0;border-top:1px solid var(--border)}\n  .art-nav-prev,.art-nav-next{flex:1;min-width:0;display:flex;flex-direction:column;text-decoration:none;padding:14px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;transition:border-color .2s}\n  .art-nav-prev:hover,.art-nav-next:hover{border-color:rgba(240,180,41,.35)}\n  .art-nav-next{text-align:right}\n  .art-nav-prev[href=""],.art-nav-next[href=""]{display:none}\n  .art-nav-label{font-size:11px;color:var(--gold);font-weight:700;margin-bottom:6px;display:block;text-transform:uppercase;letter-spacing:.04em}\n  .art-nav-title{font-size:13px;color:var(--text-light);font-weight:600;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}\n  @media(max-width:480px){.article-nav{flex-direction:column}.art-nav-next{text-align:left}}\n  `;

const BLOG_DIR = path.join(__dirname, 'blog');
const files = fs.readdirSync(BLOG_DIR)
  .filter(f => f.endsWith('.html') && f !== '_template.html')
  .map(f => path.join(BLOG_DIR, f));

let patched = 0, skipped = 0;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('article-nav')) { skipped++; continue; }
  if (html.includes('article-nav{display:flex')) { skipped++; continue; }

  const styleClose = html.indexOf('</style>');
  if (styleClose < 0) { console.log('WARN: no </style> in', path.basename(file)); skipped++; continue; }

  const updated = html.slice(0, styleClose) + NAV_CSS + html.slice(styleClose);
  fs.writeFileSync(file, updated, 'utf8');
  patched++;
}

console.log(`Patched: ${patched}  Skipped: ${skipped}`);
