// ────────────────────────────────────────────────────────────
// trigger/trigger.js — Trigger.dev v4 task definitions
// ────────────────────────────────────────────────────────────
// Integrates with the shared demo server at DEMO_SERVER_URL.
//
// Edge cases covered:
//   • Idempotency  — checks GET /api/runs/:runId before scrape
//   • Human approval — pauses via wait.createToken/wait.forToken
//   • Not found     — returns clean not_found payload
//   • Error         — returns error payload with message
//   • Cached        — returns cached result with approval:"cached"
// ────────────────────────────────────────────────────────────

import { task, wait } from "@trigger.dev/sdk";

// ─── Configuration ─────────────────────────────────────────

const DEMO_SERVER = process.env.DEMO_SERVER_URL || "http://localhost:3100";

/** Keywords the scheduled scan iterates over */
const SCAN_KEYWORDS = ["markets", "acquisition", "cyberattack", "inflation"];

// ─── HTTP Helpers ──────────────────────────────────────────

/**
 * Check if a runId already has a cached result (idempotency).
 * Returns null if not found, or the cached scrape result object.
 */
async function checkRun(runId) {
  const res = await fetch(`${DEMO_SERVER}/api/runs/${runId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`checkRun failed: HTTP ${res.status} for runId=${runId}`);
  }
  return res.json();
}

/**
 * Call the demo server's scrape endpoint.
 * Returns the scrape result object on success,
 * or an error-shaped object on HTTP failure.
 */
async function callScrape(keyword, runId, timeoutMs) {
  const body = { keyword, runId };
  if (timeoutMs) body.timeoutMs = timeoutMs;

  const res = await fetch(`${DEMO_SERVER}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return {
      status: "error",
      keyword,
      error: body.error || `Scrape endpoint returned HTTP ${res.status}`,
    };
  }

  return res.json();
}

// ─── Task 1: Single Keyword Scrape (manual trigger) ────────

/**
 * Manually triggerable task.
 *
 * Payload:
 *   { keyword: string, runId?: string, timeoutMs?: number }
 *
 * Returns a result object with an `approval` field:
 *   "cached"        — runId already existed on the server
 *   "not_needed"    — scrape completed but no approval gate (error/not_found)
 *   "approved"      — human approved via dashboard
 *   "rejected"      — human rejected via dashboard
 *   "auto_approved" — scrape succeeded, needsApproval was false
 */
export const scrapeKeyword = task({
  id: "scrape-keyword",
  run: async (payload) => {
    const { keyword, runId, timeoutMs } = payload;

    console.log(`[scrapeKeyword] Starting: keyword="${keyword}" runId="${runId || "(none)"}"`);

    // ── Step 1: Idempotency check ──
    if (runId) {
      const cached = await checkRun(runId);
      if (cached) {
        console.log(`[scrapeKeyword] Idempotency hit for runId="${runId}"`);
        return { ...cached, approval: "cached" };
      }
    }

    // ── Step 2: Scrape ──
    const result = await callScrape(keyword, runId, timeoutMs);

    // Terminal states that don't need approval
    if (result.status === "error" || result.status === "not_found") {
      console.log(`[scrapeKeyword] Terminal state: "${result.status}" for keyword="${keyword}"`);
      return { ...result, approval: "not_needed" };
    }

    // ── Step 3: Human approval gate ──
    if (result.needsApproval) {
      console.log(`[scrapeKeyword] Needs approval: "${result.title}" (reasons: ${result.sensitiveReasons.join(", ")})`);
      console.log(`  → Run paused. Complete the waitpoint via Trigger.dev Dashboard or API.`);

      // Create a waitpoint token that pauses the run
      const token = await wait.createToken({
        idempotencyKey: `approve-article-${runId || keyword}`,
        timeout: "24h",
        tags: ["article-approval", keyword],
      });

      // Wait for someone to complete the token
      // The token is completed when someone calls wait.completeToken(token, data)
      // This can be done from the Dashboard, CLI, or REST API
      const approvalResult = await wait.forToken(token).unwrap();

      // approvalResult contains whatever data was passed to completeToken
      const approved = approvalResult?.approved !== false;
      console.log(`[scrapeKeyword] Approval result: ${approved ? "approved" : "rejected"}`);

      return {
        ...result,
        approval: approved ? "approved" : "rejected",
        approvalNotes: approvalResult?.notes,
      };
    }

    // ── Auto-approved (not sensitive) ──
    console.log(`[scrapeKeyword] Auto-approved: "${result.title}"`);
    return { ...result, approval: "auto_approved" };
  },
});

// ─── Task 2: Scheduled News Scan ───────────────────────────

/**
 * Scheduled task that fans out over a small keyword list.
 *
 * Runs every 6 hours via cron.
 * Each keyword is scraped sequentially with idempotency.
 * Articles needing approval pause the run at each keyword.
 */
export const scheduledNewsScan = task({
  id: "scheduled-news-scan",
  // Cron expression — runs every 6 hours at minute 0
  cron: "0 */6 * * *",
  run: async () => {
    const scanId = new Date().toISOString().slice(0, 13); // unique per hour
    console.log(`[scheduledNewsScan] Starting scan ${scanId} for ${SCAN_KEYWORDS.length} keywords`);

    const results = [];
    let approved = 0;
    let rejected = 0;
    let autoApproved = 0;
    let cached = 0;
    let notFound = 0;
    let errors = 0;

    for (const keyword of SCAN_KEYWORDS) {
      const runId = `scan-${keyword}-${scanId}`;

      try {
        // ── Idempotency ──
        const existing = await checkRun(runId);
        if (existing) {
          cached++;
          results.push({ keyword, status: "cached", title: existing.title });
          console.log(`[scheduledNewsScan] Cached: "${keyword}"`);
          continue;
        }

        // ── Scrape ──
        const result = await callScrape(keyword, runId);

        if (result.status === "error") {
          errors++;
          results.push({ keyword, status: "error", error: result.error });
          console.log(`[scheduledNewsScan] Error: "${keyword}" — ${result.error}`);
          continue;
        }

        if (result.status === "not_found") {
          notFound++;
          results.push({ keyword, status: "not_found" });
          console.log(`[scheduledNewsScan] Not found: "${keyword}"`);
          continue;
        }

        // ── Human approval gate ──
        if (result.needsApproval) {
          const token = await wait.createToken({
            idempotencyKey: `scan-approve-${runId}`,
            timeout: "24h",
            tags: ["article-approval", "scan", keyword],
          });

          const approvalResult = await wait.forToken(token).unwrap();
          const isApproved = approvalResult?.approved !== false;

          if (isApproved) approved++;
          else rejected++;

          results.push({
            keyword,
            status: result.status,
            title: result.title,
            approval: isApproved ? "approved" : "rejected",
          });

          console.log(`[scheduledNewsScan] "${keyword}" → ${isApproved ? "approved" : "rejected"}`);
        } else {
          autoApproved++;
          results.push({
            keyword,
            status: result.status,
            title: result.title,
            approval: "auto_approved",
          });

          console.log(`[scheduledNewsScan] "${keyword}" → auto_approved`);
        }
      } catch (err) {
        errors++;
        results.push({ keyword, status: "error", error: err.message });
        console.log(`[scheduledNewsScan] Exception for "${keyword}": ${err.message}`);
      }
    }

    const summary = {
      scanId,
      total: SCAN_KEYWORDS.length,
      approved,
      rejected,
      autoApproved,
      cached,
      notFound,
      errors,
    };

    console.log(`[scheduledNewsScan] Complete:`, summary);

    return { summary, results };
  },
});

// ─── Note: Completing approval waitpoints ────────────────────
// When a task pauses at wait.createToken(), it creates a "waitpoint".
// To complete it and let the task resume:
//
//   1. Dashboard: The pending waitpoint appears in the run's detail view.
//      Look for a "Waiting" or "Waitpoints" tab. Click "Complete" and
//      provide data like { "approved": true } or { "approved": false }.
//
//   2. REST API (requires TRIGGER_API_KEY in .env):
//      curl -X POST https://api.trigger.dev/api/v1/v3/waitpoints/{tokenId}/complete \
//        -H "Authorization: Bearer tr_apikey_..." \
//        -H "Content-Type: application/json" \
//        -d '{"approved": true, "notes": "Looks good"}'
//
//   3. CLI:
//      trigger.dev dev (in another terminal) shows active waitpoints
//      and allows completing them interactively.
//
//   The tokenId is logged by wait.createToken() during the run,
//   or visible in the Dashboard run detail view.
// ────────────────────────────────────────────────────────────
