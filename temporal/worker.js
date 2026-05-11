// ────────────────────────────────────────────────────────────
// temporal/worker.js — Temporal Worker
// ────────────────────────────────────────────────────────────
// Registers workflow and activity handlers, then polls the
// Temporal server's task queue for tasks to execute.
//
// Usage:
//   node temporal/worker.js
//
// Requires a running Temporal dev server:
//   temporal server start-dev
// ────────────────────────────────────────────────────────────

import { Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import * as activities from "./activities.js";

async function run() {
  console.log("[worker] Starting Temporal worker...");
  console.log(`[worker] DEMO_SERVER_URL=${process.env.DEMO_SERVER_URL || "http://localhost:3100"}`);

  // Create a worker that:
  //   - registers the workflow code from workflows.js
  //   - registers the activity functions from activities.js
  //   - polls the "news-monitor" task queue
  const worker = await Worker.create({
    workflowsPath: fileURLToPath(new URL("./workflows.js", import.meta.url)),
    activities,
    taskQueue: "news-monitor",
    // Worker identity shown in Temporal UI for debugging
    identity: "news-monitor-worker",
  });

  console.log("[worker] Worker created. Polling task queue 'news-monitor'...");
  console.log("[worker] Temporal UI: http://localhost:8233");
  console.log("[worker] Press Ctrl+C to stop.\n");

  // Run forever (blocking)
  await worker.run();
}

run().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
