// ────────────────────────────────────────────────────────────
// temporal/workflows.js — Temporal Workflow Definitions
// ────────────────────────────────────────────────────────────
// Two workflows:
//   1. newsScrapeWorkflow      — single keyword (manual trigger)
//   2. scheduledNewsScanWorkflow — iterates default keyword list
//
// Human approval uses Temporal Signal + condition() pattern.
//
// NOTE: Workflow code is bundled by the Temporal worker into
// an isolate. Only imports from @temporalio/workflow are
// allowed here — no Node built-ins, no fetch, no fs.
// All I/O goes through activities.
// ────────────────────────────────────────────────────────────

import {
  proxyActivities,
  defineSignal,
  setHandler,
  condition,
  sleep,
} from "@temporalio/workflow";

// ─── Activity Proxy ─────────────────────────────────────────
// Activities are imported from the activities file, but invoked
// through proxyActivities(). The worker wires them at runtime.

const { checkRun, callScrape } = proxyActivities({
  startToCloseTimeout: "120s",
  retry: {
    maximumAttempts: 3,
    initialInterval: "2s",
    backoffCoefficient: 2,
    maximumInterval: "30s",
  },
});

// ─── Signal Definition ──────────────────────────────────────
// Used for human approval / rejection.
// Signal payload: { approved: boolean, notes?: string }

export const approvalSignal = defineSignal("approvalSignal");

// ─── Constants ──────────────────────────────────────────────

const SCAN_KEYWORDS = ["markets", "acquisition", "cyberattack", "inflation"];

// ─── Workflow 1: Single Keyword Scrape ──────────────────────

/**
 * Scrape a single keyword with idempotency and an optional
 * human approval gate.
 *
 * @param {{ keyword: string, runId?: string, timeoutMs?: number }} params
 * @returns {Promise<object>} Result with approval field
 *
 * Returned `approval` values:
 *   "cached"        — runId already existed on the server
 *   "not_needed"    — Terminal state (error / not_found)
 *   "auto_approved" — Success, no sensitive content
 *   "approved"      — Human approved via Temporal signal
 *   "rejected"      — Human rejected via Temporal signal
 */
export async function newsScrapeWorkflow({ keyword, runId, timeoutMs }) {
  console.log(`[workflow] newsScrapeWorkflow: keyword="${keyword}" runId="${runId || "(none)"}"`);

  // ── Step 1: Idempotency check ──
  if (runId) {
    const cached = await checkRun(runId);
    if (cached) {
      console.log(`[workflow] Idempotency hit for runId="${runId}" — returning cached`);
      return { ...cached, approval: "cached" };
    }
  }

  // ── Step 2: Scrape (with activity retry on 5xx) ──
  const result = await callScrape({ keyword, runId, timeoutMs });

  // Terminal states without approval gate
  if (result.status === "error" || result.status === "not_found") {
    console.log(`[workflow] Terminal state: "${result.status}" — no approval needed`);
    return { ...result, approval: "not_needed" };
  }

  // ── Step 3: Human approval gate (signal + condition) ──
  if (result.needsApproval) {
    const title = result.title || "Unknown";
    console.log(`[workflow] Needs approval: "${title}"`);
    console.log(`[workflow] Waiting for signal "approvalSignal"...`);
    console.log(`[workflow]   → Send signal: node temporal/client.js signal <workflowId> approved`);
    console.log(`[workflow]   → Send signal: node temporal/client.js signal <workflowId> rejected`);
    console.log(`[workflow]   → Workflow ID shown in "Started workflow" log above`);
    console.log(`[workflow]   → Or check Temporal UI at http://localhost:8233`);

    // Set up signal handler
    let signalData = null;
    setHandler(approvalSignal, (data) => {
      signalData = data;
      console.log(`[workflow] Approval signal received: ${JSON.stringify(data)}`);
    });

    // Wait for signal with 24h timeout
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    const gotSignal = await condition(() => signalData !== null, deadline);

    if (!gotSignal) {
      console.log(`[workflow] Approval timeout — treating as rejected`);
      return {
        ...result,
        approval: "rejected",
        approvalNotes: "Timed out (no decision within 24 hours)",
      };
    }

    const approved = signalData.approved !== false;
    console.log(`[workflow] Decision: ${approved ? "approved" : "rejected"}`);

    return {
      ...result,
      approval: approved ? "approved" : "rejected",
      approvalNotes: signalData.notes || "",
    };
  }

  // ── Step 4: Auto-approved (not sensitive) ──
  console.log(`[workflow] Auto-approved: "${result.title}"`);
  return { ...result, approval: "auto_approved" };
}

// ─── Workflow 2: Scheduled News Scan ────────────────────────

/**
 * Iterate over the default keyword list with idempotency
 * and approval gates. Designed for cron scheduling every 6h.
 *
 * Each keyword is processed sequentially so that a paused
 * approval gate blocks the next keyword.
 *
 * @returns {Promise<{ summary: object, results: object[] }>}
 */
export async function scheduledNewsScanWorkflow() {
  const scanId = new Date().toISOString().slice(0, 13);
  console.log(`[workflow] scheduledNewsScanWorkflow: scanId="${scanId}"`);

  const results = [];
  const counts = {
    approved: 0,
    rejected: 0,
    autoApproved: 0,
    cached: 0,
    notFound: 0,
    errors: 0,
  };

  // Shared signal handler for all keywords
  let approvals = {};
  setHandler(approvalSignal, (data) => {
    if (data && data.keyword) {
      approvals[data.keyword] = data;
      console.log(`[workflow] Approval signal for "${data.keyword}": ${JSON.stringify(data)}`);
    } else {
      console.log(`[workflow] Approval signal (no keyword): ${JSON.stringify(data)}`);
    }
  });

  for (const keyword of SCAN_KEYWORDS) {
    const runId = `scan-${keyword}-${scanId}`;
    console.log(`[workflow] --- Processing: "${keyword}" (runId=${runId}) ---`);

    try {
      // ── Idempotency ──
      const cached = await checkRun(runId);
      if (cached) {
        counts.cached++;
        results.push({ keyword, status: "cached", title: cached.title });
        console.log(`[workflow] "${keyword}" → cached`);
        continue;
      }

      // ── Scrape ──
      const result = await callScrape({ keyword, runId });

      if (result.status === "error") {
        counts.errors++;
        results.push({ keyword, status: "error", error: result.error });
        console.log(`[workflow] "${keyword}" → error: ${result.error}`);
        continue;
      }

      if (result.status === "not_found") {
        counts.notFound++;
        results.push({ keyword, status: "not_found" });
        console.log(`[workflow] "${keyword}" → not_found`);
        continue;
      }

      // ── Human approval gate ──
      if (result.needsApproval) {
        console.log(`[workflow] "${keyword}" needs approval — waiting for signal`);
        console.log(`[workflow]   → Send: node temporal/client.js signal <wfId> approved --keyword ${keyword}`);
        console.log(`[workflow]   → Send: node temporal/client.js signal <wfId> rejected --keyword ${keyword}`);

        const deadline = Date.now() + 24 * 60 * 60 * 1000;
        await condition(() => approvals[keyword] !== undefined, deadline);

        const decision = approvals[keyword];
        if (decision && decision.approved !== false) {
          counts.approved++;
          results.push({ keyword, status: result.status, title: result.title, approval: "approved" });
          console.log(`[workflow] "${keyword}" → approved`);
        } else {
          counts.rejected++;
          results.push({ keyword, status: result.status, title: result.title, approval: "rejected" });
          console.log(`[workflow] "${keyword}" → rejected`);
        }

        // Clean up to avoid stale state
        delete approvals[keyword];
      } else {
        counts.autoApproved++;
        results.push({ keyword, status: result.status, title: result.title, approval: "auto_approved" });
        console.log(`[workflow] "${keyword}" → auto_approved`);
      }
    } catch (err) {
      counts.errors++;
      results.push({ keyword, status: "error", error: err.message });
      console.log(`[workflow] "${keyword}" → exception: ${err.message}`);
    }
  }

  const summary = {
    scanId,
    total: SCAN_KEYWORDS.length,
    ...counts,
  };

  console.log(`[workflow] Scan complete: ${JSON.stringify(summary)}`);
  return { summary, results };
}
