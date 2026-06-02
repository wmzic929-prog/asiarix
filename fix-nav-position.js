const fs = require('fs');
const path = require('path');

const BLOG_DIR = path.join(__dirname, 'blog');
const files = fs.readdirSync(BLOG_DIR)
  .filter(f => f.endsWith('.html') && f !== '_template.html')
  .map(f => path.join(BLOG_DIR, f));

let patched = 0, already = 0, skipped = 0;

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes('article-nav')) { skipped++; continue; }

  // Check if nav is already inside .aw (correct position)
  // In correct position: </nav> comes before </div> (the .aw closer) before <section class="bb">
  // In wrong position: nav appears AFTER </div> that closes .aw

  // Pattern to detect and fix wrong position:
  // </div>\n\n  <nav class="article-nav">...\n  </nav>\n<section
  // becomes:
  // \n  <nav class="article-nav">...\n  </nav>\n</div>\n<section

  const wrongPattern = /<\/div>\n(\n  <nav class="article-nav">[\s\S]*?  <\/nav>)\n\n(<section)/;

  if (!wrongPattern.test(html)) {
    already++;
    continue;
  }

  const fixed = html.replace(wrongPattern, '$1\n</div>\n\n$2');
  fs.writeFileSync(file, fixed, 'utf8');
  patched++;
}

console.log(`Fixed: ${patched}  Already correct: ${already}  Skipped (no nav): ${skipped}`);
