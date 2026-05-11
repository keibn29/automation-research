// ────────────────────────────────────────────────────────────
// News Monitor Approval Bot — Local Demo Server
// ────────────────────────────────────────────────────────────
// A single Express server that serves HTML pages and JSON APIs
// for a Playwright-based news scraper demo.
//
// Edge cases supported:
//   • Normal article        (keyword: "markets")
//   • Approval + fallback   (keyword: "acquisition")
//   • Fail-once retry       (keyword: "cyberattack")
//   • Slow page / timeout   (keyword: "inflation")
//   • Not found             (keyword: "volcano")
//   • Idempotency           (same runId returns cached result)
// ────────────────────────────────────────────────────────────

const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PORT = 3100;
const app = express();
app.use(express.json());

// ─── Paths ──────────────────────────────────────────────────

const DEMO_DIR = __dirname;
const DATA_DIR = path.join(DEMO_DIR, 'data');
const RUNTIME_DIR = path.join(DEMO_DIR, 'runtime');
const SCREENSHOTS_DIR = path.join(RUNTIME_DIR, 'screenshots');
const FAIL_COUNTS_PATH = path.join(RUNTIME_DIR, 'fail-counts.json');
const RUNS_PATH = path.join(RUNTIME_DIR, 'runs.json');

// ─── State ──────────────────────────────────────────────────

/** @type {Array<import('./data/articles.json')>} */
let articles = [];

/** @type {Record<number, number>} fail-once counter keyed by article ID */
let failCounts = {};

/** @type {Record<string, object>} saved scrape results keyed by runId */
let savedRuns = {};

// ─── File I/O Helpers ───────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJSON(file, defaultVal) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (_) {
    // corrupt or missing — ignore
  }
  return defaultVal;
}

function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function loadArticles() {
  articles = readJSON(path.join(DATA_DIR, 'articles.json'), []);
}

function loadState() {
  failCounts = readJSON(FAIL_COUNTS_PATH, {});
  savedRuns = readJSON(RUNS_PATH, {});
}

function saveFailCounts() { writeJSON(FAIL_COUNTS_PATH, failCounts); }
function saveRuns() { writeJSON(RUNS_PATH, savedRuns); }

// ─── HTML Escaping ──────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── HTML Page Renderers ────────────────────────────────────

function renderNewsPage() {
  const cards = articles.map(a => `
    <div class="article-card" data-id="${a.id}">
      <h2><a href="/article/${a.id}">${escapeHtml(a.title)}</a></h2>
      <div class="meta">By ${escapeHtml(a.author)} | ${a.publishedAt}</div>
      <p>${escapeHtml(a.summary)}</p>
      <div class="tags">${a.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
    </div>
  `).join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>News Monitor — Demo Site</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 860px; margin: 0 auto; padding: 24px; background: #f5f5f5; }
    h1 { color: #1a1a1a; font-size: 1.8em; margin-bottom: 24px; }
    .article-card { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .article-card h2 { margin: 0 0 8px; font-size: 1.2em; }
    .article-card h2 a { color: #1a73e8; text-decoration: none; }
    .article-card h2 a:hover { text-decoration: underline; }
    .meta { color: #666; font-size: 0.85em; margin-bottom: 8px; }
    .article-card p { color: #333; line-height: 1.5; margin: 8px 0; }
    .tags { margin-top: 8px; }
    .tag { display: inline-block; background: #e8eaf6; color: #283593; padding: 2px 10px; border-radius: 12px; font-size: 0.78em; margin-right: 4px; }
  </style>
</head>
<body>
  <h1>📰 News Monitor — Demo Site</h1>
  ${cards}
</body>
</html>`;
}

function renderArticlePage(article) {
  // Selector variant: articles with selectors.title === ".headline"
  // use a <div class="headline"> instead of <h1>, so the Playwright
  // scraper must fall back to the .headline selector.
  const titleHtml = (article.selectors && article.selectors.title === '.headline')
    ? `<div class="headline">${escapeHtml(article.title)}</div>`
    : `<h1>${escapeHtml(article.title)}</h1>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(article.title)} — News Monitor</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 860px; margin: 0 auto; padding: 24px; background: #f5f5f5; }
    article { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .back-link { display: inline-block; margin-bottom: 16px; color: #1a73e8; text-decoration: none; font-size: 0.9em; }
    .back-link:hover { text-decoration: underline; }
    h1, .headline { font-size: 1.6em; font-weight: 700; margin: 0 0 8px; color: #1a1a1a; }
    .meta { color: #666; font-size: 0.85em; margin-bottom: 12px; }
    .summary { font-size: 1.05em; color: #444; line-height: 1.6; margin: 16px 0; padding: 12px 16px; background: #f8f9fa; border-left: 4px solid #1a73e8; border-radius: 4px; }
    .content { line-height: 1.7; color: #333; margin-top: 16px; white-space: pre-wrap; }
    .tag { display: inline-block; background: #e8eaf6; color: #283593; padding: 2px 10px; border-radius: 12px; font-size: 0.78em; margin-right: 4px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 0.78em; font-weight: 600; margin-bottom: 12px; }
    .badge-sensitive { background: #fce4ec; color: #c62828; }
  </style>
</head>
<body>
  <a href="/news" class="back-link">&larr; Back to News</a>
  <article>
    ${article.sensitive ? '<div class="badge badge-sensitive">⚠ Requires Approval</div>' : ''}
    ${titleHtml}
    <div class="meta">By ${escapeHtml(article.author)} | ${article.publishedAt}</div>
    <div class="tags">${article.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
    <p class="summary">${escapeHtml(article.summary)}</p>
    <div class="content">${escapeHtml(article.content || '')}</div>
  </article>
</body>
</html>`;
}

function renderErrorPage(msg) {
  return `<!DOCTYPE html><html lang="en"><head><title>Error</title></head><body><h1>500 — Server Error</h1><p>${escapeHtml(msg)}</p></body></html>`;
}

// ─── Middleware: log API calls ──────────────────────────────

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`  → ${req.method} ${req.path}`, req.body ? JSON.stringify(req.body) : '');
  }
  next();
});

// ─── HTML Routes ────────────────────────────────────────────

app.get('/news', (_req, res) => {
  res.send(renderNewsPage());
});

app.get('/article/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).send('Invalid article ID');

  const article = articles.find(a => a.id === id);
  if (!article) return res.status(404).send('Article not found');

  // ── Fail-once simulation ──
  if (article.failOnce) {
    const count = failCounts[id] || 0;
    if (count === 0) {
      failCounts[id] = 1;
      saveFailCounts();
      console.log(`  ⚠ Article ${id}: simulated 500 error (fail-once)`);
      return res.status(500).send(renderErrorPage(`Simulated failure for article ${id}. Retry to succeed.`));
    }
  }

  // ── Slow response simulation ──
  const delay = article.slowResponse ? 7000 : 0;
  if (delay) {
    console.log(`  ⏳ Article ${id}: slow response (${delay}ms delay)`);
  }

  setTimeout(() => {
    res.send(renderArticlePage(article));
  }, delay);
});

// ─── API Routes ─────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()) });
});

app.post('/api/admin/reset', (_req, res) => {
  failCounts = {};
  savedRuns = {};
  saveFailCounts();
  saveRuns();
  console.log('  🔄 State reset: fail-counts and runs cleared');
  res.json({ status: 'ok', message: 'Fail counts and saved runs cleared' });
});

app.get('/api/runs/:runId', (req, res) => {
  const run = savedRuns[req.params.runId];
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

app.post('/api/runs', (req, res) => {
  const { runId, ...data } = req.body;
  if (!runId) return res.status(400).json({ error: 'runId is required' });

  // Idempotent: if already saved, return existing
  if (savedRuns[runId]) {
    return res.json({ ...savedRuns[runId], fromCache: true });
  }

  savedRuns[runId] = data;
  saveRuns();
  res.json(data);
});

// ─── Scrape Endpoint ────────────────────────────────────────

app.post('/api/scrape', async (req, res) => {
  const { keyword, runId, timeoutMs } = req.body || {};

  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    return res.status(400).json({ error: 'keyword (string) is required' });
  }

  const trimmedKeyword = keyword.trim();

  // ── Idempotency check ──
  if (runId && savedRuns[runId]) {
    console.log(`  🔁 runId "${runId}" cached — returning previous result`);
    return res.json({ ...savedRuns[runId], fromCache: true });
  }

  console.log(`  🕸 Scraping keyword="${trimmedKeyword}"${runId ? ` runId="${runId}"` : ''}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const notes = [];
    const baseUrl = `http://localhost:${PORT}`;
    const timeout = (timeoutMs && typeof timeoutMs === 'number') ? timeoutMs : 30000;

    // Step 1 — Navigate to news listing
    notes.push('Navigated to /news');
    await page.goto(`${baseUrl}/news`, { waitUntil: 'networkidle', timeout });

    // Step 2 — Find article card matching keyword
    const cards = await page.$$('.article-card');
    let matchedCard = null;
    for (const card of cards) {
      const text = await card.textContent();
      if (text.toLowerCase().includes(trimmedKeyword.toLowerCase())) {
        matchedCard = card;
        break;
      }
    }

    if (!matchedCard) {
      const result = {
        status: 'not_found',
        keyword: trimmedKeyword,
        articleId: null,
        title: null,
        author: null,
        publishedAt: null,
        summary: null,
        url: null,
        needsApproval: false,
        sensitiveReasons: [],
        usedFallbackSelector: false,
        screenshotPath: null,
        notes: [...notes, `No article matched keyword "${trimmedKeyword}"`],
      };
      if (runId) { savedRuns[runId] = result; saveRuns(); }
      return res.json(result);
    }

    // Step 3 — Extract article link and ID
    const link = await matchedCard.$('a');
    const href = await link.getAttribute('href');
    const articleId = parseInt(href.split('/').pop(), 10);
    const article = articles.find(a => a.id === articleId);
    notes.push(`Found article ID ${articleId} for keyword "${trimmedKeyword}"`);

    // Step 4 — Click through to article detail
    await Promise.all([
      page.waitForLoadState('networkidle'),
      link.click(),
    ]);

    // Step 5 — Retry loop for fail-once articles
    let retries = 0;
    while (retries < 3) {
      const errorEl = await page.$('text=500 — Server Error');
      if (!errorEl) break;
      retries++;
      notes.push(`Got 500 error, retry attempt ${retries}`);
      await page.waitForTimeout(1500);
      await page.reload({ waitUntil: 'networkidle', timeout });
    }

    if (retries >= 3) {
      const result = {
        status: 'error',
        keyword: trimmedKeyword,
        articleId,
        title: null,
        author: null,
        publishedAt: null,
        summary: null,
        url: `${baseUrl}/article/${articleId}`,
        needsApproval: false,
        sensitiveReasons: [],
        usedFallbackSelector: false,
        screenshotPath: null,
        notes: [...notes, 'Max retries (3) exceeded for fail-once error'],
      };
      if (runId) { savedRuns[runId] = result; saveRuns(); }
      return res.json(result);
    }

    // Step 6 — Extract title with selector fallback
    let usedFallbackSelector = false;
    let titleEl = await page.$('h1');
    if (!titleEl) {
      titleEl = await page.$('.headline');
      if (titleEl) {
        usedFallbackSelector = true;
        notes.push('Used fallback selector .headline (h1 not found)');
      }
    }
    const title = titleEl ? (await titleEl.textContent()).trim() : 'Unknown';

    // Step 7 — Extract metadata
    const authorEl = await page.$('.meta');
    const authorText = authorEl ? await authorEl.textContent() : '';
    const authorMatch = authorText.match(/By\s+(.+?)\s+\|/);
    const author = authorMatch ? authorMatch[1].trim() : 'Unknown';
    const dateMatch = authorText.match(/\|\s+(.+)$/);
    const publishedAt = dateMatch ? dateMatch[1].trim() : 'Unknown';

    const summaryEl = await page.$('.summary');
    const summary = summaryEl ? (await summaryEl.textContent()).trim() : 'Unknown';

    // Step 8 — Sensitivity check
    const needsApproval = !!(article && article.sensitive);
    const sensitiveReasons = (article && article.sensitiveReasons) || [];
    if (needsApproval) {
      notes.push(`Requires human approval: ${sensitiveReasons.join(', ')}`);
    }

    // Step 9 — Take screenshot
    ensureDir(SCREENSHOTS_DIR);
    const screenshotName = `${runId || trimmedKeyword}-${Date.now()}.png`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    notes.push(`Screenshot saved: ${screenshotName}`);

    const result = {
      status: 'completed',
      keyword: trimmedKeyword,
      articleId,
      title,
      author,
      publishedAt,
      summary,
      url: `${baseUrl}/article/${articleId}`,
      needsApproval,
      sensitiveReasons,
      usedFallbackSelector,
      screenshotPath,
      notes,
    };

    // Step 10 — Idempotent save
    if (runId) {
      savedRuns[runId] = result;
      saveRuns();
    }

    console.log(`  ✓ Scrape complete for "${trimmedKeyword}": ${result.status}`);
    res.json(result);
  } catch (err) {
    console.error(`  ✗ Scrape error for "${trimmedKeyword}": ${err.message}`);
    const errorResult = {
      status: 'error',
      keyword: trimmedKeyword,
      articleId: null,
      title: null,
      author: null,
      publishedAt: null,
      summary: null,
      url: null,
      needsApproval: false,
      sensitiveReasons: [],
      usedFallbackSelector: false,
      screenshotPath: null,
      notes: [`Exception: ${err.message}`],
    };
    if (runId) { savedRuns[runId] = errorResult; saveRuns(); }
    res.status(500).json(errorResult);
  } finally {
    if (browser) await browser.close();
  }
});

// ─── Initialize & Start ─────────────────────────────────────

loadArticles();
loadState();
ensureDir(SCREENSHOTS_DIR);

app.listen(PORT, () => {
  console.log(`
  ┌──────────────────────────────────────────────────────┐
  │  News Monitor Approval Bot — Demo Server             │
  │  http://localhost:${PORT}                               │
  └──────────────────────────────────────────────────────┘

  HTML Pages:
    GET  /news              Article listing
    GET  /article/:id       Article detail page

  API Endpoints:
    GET  /api/health        Health check
    POST /api/admin/reset   Reset fail-counts and cached runs
    GET  /api/runs/:runId   Retrieve saved scrape result
    POST /api/runs          Idempotently save a run result
    POST /api/scrape        Run Playwright and extract article

  Edge Cases (use as keyword in POST /api/scrape):
    "markets"        Normal article — happy path
    "acquisition"    Needs approval + .headline fallback
    "cyberattack"    Fail-once retry + needs approval
    "inflation"      Slow page (~7s delay)
    "volcano"        No matching article — not_found
`);
});
