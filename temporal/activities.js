// ────────────────────────────────────────────────────────────
// temporal/activities.js — Temporal Activity Functions
// ────────────────────────────────────────────────────────────
// Activities are stateless HTTP helpers called by workflows.
// They run in the standard Node.js runtime (not the workflow
// isolate), so fetch() and other Node APIs are available.
//
// Edge cases covered:
//   • Idempotency  — GET /api/runs/:runId before scrape
//   • Not found    — returns null from checkRun
//   • Error        — 5xx throws (triggers Temporal retry),
//                     4xx returns error payload
// ────────────────────────────────────────────────────────────

const DEMO_SERVER = process.env.DEMO_SERVER_URL || "http://localhost:3100";

/**
 * Check if a runId already has a cached result (idempotency).
 *
 * @param {string} runId
 * @returns {Promise<object|null>} Cached scrape result, or null if not found.
 */
export async function checkRun(runId) {
  console.log(`[activity] checkRun("${runId}") → GET /api/runs/${runId}`);

  const res = await fetch(`${DEMO_SERVER}/api/runs/${runId}`);
  if (res.status === 404) {
    console.log(`[activity] checkRun("${runId}") → not found`);
    return null;
  }
  if (!res.ok) {
    throw new Error(`checkRun failed: HTTP ${res.status} for runId=${runId}`);
  }

  const data = await res.json();
  console.log(`[activity] checkRun("${runId}") → found (${data.status})`);
  return data;
}

/**
 * Call the demo server's scrape endpoint.
 *
 * Throws on 5xx so Temporal's retry policy kicks in.
 * Returns error-shaped payload on 4xx (bad request).
 * Returns successful scrape result on 2xx.
 *
 * @param {{ keyword: string, runId?: string, timeoutMs?: number }} params
 * @returns {Promise<object>} Scrape result object
 */
export async function callScrape(params) {
  const { keyword, runId, timeoutMs } = params;
  const body = { keyword };
  if (runId) body.runId = runId;
  if (timeoutMs) body.timeoutMs = timeoutMs;

  console.log(`[activity] callScrape("${keyword}", runId=${runId || "(none)"})`);

  const res = await fetch(`${DEMO_SERVER}/api/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // 5xx → throw to trigger Temporal retry
  if (res.status >= 500) {
    const text = await res.text().catch(() => "unknown");
    throw new Error(`callScrape failed: HTTP ${res.status} — ${text}`);
  }

  // 4xx → non-retryable, return error payload
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.log(`[activity] callScrape("${keyword}") → HTTP ${res.status}`);
    return {
      status: "error",
      keyword,
      error: errBody.error || `Scrape endpoint returned HTTP ${res.status}`,
    };
  }

  const data = await res.json();
  console.log(`[activity] callScrape("${keyword}") → ${data.status}`);
  return data;
}
