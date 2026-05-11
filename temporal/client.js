#!/usr/bin/env node
// ────────────────────────────────────────────────────────────
// temporal/client.js — Temporal CLI Helper
// ────────────────────────────────────────────────────────────
// A simple CLI for starting workflows and sending signals
// to the Temporal dev server.
//
// Usage:
//   node temporal/client.js start <keyword> [runId] [--timeout <ms>]
//   node temporal/client.js start-scan
//   node temporal/client.js signal <workflowId> approved|rejected [--keyword <k>] [--notes "<text>"]
//   node temporal/client.js list
//   node temporal/client.js describe <workflowId>
// ────────────────────────────────────────────────────────────

import { Client, Connection } from "@temporalio/client";
import { approvalSignal, newsScrapeWorkflow, scheduledNewsScanWorkflow } from "./workflows.js";

const TEMPORAL_SERVER = process.env.TEMPORAL_SERVER_URL || "localhost:7233";
const TASK_QUEUE = "news-monitor";

// ─── Helpers ─────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const rest = [];

  // Extract --key=value or --key value options
  const options = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        options[key] = args[i + 1];
        i++; // skip value
      } else {
        options[key] = true;
      }
    } else {
      rest.push(args[i]);
    }
  }

  return { cmd, args: rest, options };
}

function showHelp() {
  console.log(`
Usage:
  node temporal/client.js start <keyword> [runId] [--timeout <ms>]
      Start a single-keyword scrape workflow.
      If runId is omitted, one is auto-generated.
      Example: node temporal/client.js start markets test-manual-001

  node temporal/client.js start-scan
      Start the scheduled scan workflow over all keywords.

  node temporal/client.js signal <workflowId> approved|rejected [--keyword <k>] [--notes "<text>"]
      Send approval/rejection signal to a running workflow.
      --keyword is required for scan workflows (identifies which keyword to approve).
      Example: node temporal/client.js signal abc123 approved --notes "Looks good"
      Example: node temporal/client.js signal abc123 rejected --notes "Not relevant"

  node temporal/client.js list
      List open/running workflows.

  node temporal/client.js describe <workflowId>
      Show details of a workflow execution.

  Environment:
      TEMPORAL_SERVER_URL   (default: localhost:7233)
      DEMO_SERVER_URL       (default: http://localhost:3100)
`.trim());
}

// ─── Commands ────────────────────────────────────────────────

/**
 * Start a single-keyword scrape workflow.
 */
async function cmdStart(keyword, runId, options) {
  if (!keyword) {
    console.error("Error: keyword is required");
    console.error("Usage: node temporal/client.js start <keyword> [runId]");
    process.exit(1);
  }

  runId = runId || `manual-${keyword}-${Date.now()}`;
  const timeoutMs = options.timeout ? parseInt(options.timeout, 10) : undefined;

  const connection = await Connection.connect({ address: TEMPORAL_SERVER });
  const client = new Client({ connection });

  const workflowId = `news-scrape-${runId}`;

  console.log(`Starting workflow: ${workflowId}`);
  console.log(`  keyword:    ${keyword}`);
  console.log(`  runId:      ${runId}`);
  console.log(`  timeoutMs:  ${timeoutMs || "(default)"}`);
  console.log(`  taskQueue:  ${TASK_QUEUE}`);
  console.log(`  Temporal:   ${TEMPORAL_SERVER}`);
  console.log(`  Demo:       ${process.env.DEMO_SERVER_URL || "http://localhost:3100"}`);
  console.log();

  const handle = await client.workflow.start(newsScrapeWorkflow, {
    args: [{ keyword, runId, timeoutMs }],
    taskQueue: TASK_QUEUE,
    workflowId,
  });

  console.log(`✅ Workflow started!`);
  console.log(`   Workflow ID: ${workflowId}`);
  console.log(`   Run ID:      ${handle.firstExecutionRunId}`);
  console.log();
  console.log(`To send approval signal:`);
  console.log(`   node temporal/client.js signal ${workflowId} approved`);
  console.log(`   node temporal/client.js signal ${workflowId} rejected`);
  console.log();
  console.log(`Temporal UI: http://localhost:8233/namespaces/default/workflows/${workflowId}`);

  await connection.close();
}

/**
 * Start the scheduled scan workflow.
 */
async function cmdStartScan() {
  const connection = await Connection.connect({ address: TEMPORAL_SERVER });
  const client = new Client({ connection });

  const scanId = new Date().toISOString().slice(0, 13);
  const workflowId = `news-scan-${scanId}`;

  console.log(`Starting scheduled scan workflow: ${workflowId}`);
  console.log(`  taskQueue: ${TASK_QUEUE}`);
  console.log();

  const handle = await client.workflow.start(scheduledNewsScanWorkflow, {
    args: [],
    taskQueue: TASK_QUEUE,
    workflowId,
  });

  console.log(`✅ Scan workflow started!`);
  console.log(`   Workflow ID: ${workflowId}`);
  console.log();
  console.log(`Keywords being scanned: markets, acquisition, cyberattack, inflation`);
  console.log();
  console.log(`To send approval during scan:`);
  console.log(`   node temporal/client.js signal ${workflowId} approved --keyword acquisition`);
  console.log(`   node temporal/client.js signal ${workflowId} approved --keyword cyberattack`);
  console.log(`   node temporal/client.js signal ${workflowId} rejected --keyword acquisition`);
  console.log();
  console.log(`Temporal UI: http://localhost:8233/namespaces/default/workflows/${workflowId}`);

  await connection.close();
}

/**
 * Send an approval/rejection signal to a running workflow.
 */
async function cmdSignal(workflowId, decision, options) {
  if (!workflowId || !decision) {
    console.error("Error: workflowId and decision (approved|rejected) are required");
    process.exit(1);
  }

  if (decision !== "approved" && decision !== "rejected") {
    console.error('Error: decision must be "approved" or "rejected"');
    process.exit(1);
  }

  const approved = decision === "approved";
  const notes = options.notes || "";

  const signalData = {};
  if (options.keyword) {
    signalData.keyword = options.keyword;
  }
  signalData.approved = approved;
  signalData.notes = notes;

  const connection = await Connection.connect({ address: TEMPORAL_SERVER });
  const client = new Client({ connection });

  const handle = client.workflow.getHandle(workflowId);

  console.log(`Sending signal "${approvalSignal.name}" to workflow ${workflowId}...`);
  console.log(`  payload: ${JSON.stringify(signalData)}`);

  await handle.signal(approvalSignal, signalData);

  console.log(`✅ Signal sent successfully!`);
  console.log(`   Decision: ${approved ? "approved" : "rejected"}`);
  if (notes) console.log(`   Notes: ${notes}`);

  await connection.close();
}

/**
 * List open workflows.
 */
async function cmdList() {
  const connection = await Connection.connect({ address: TEMPORAL_SERVER });
  const client = new Client({ connection });

  console.log("Listing open workflows...\n");

  let count = 0;
  for await (const info of client.workflow.list({
    query: 'WorkflowType="newsScrapeWorkflow" OR WorkflowType="scheduledNewsScanWorkflow"',
  })) {
    count++;
    console.log(`  ${info.workflowId}`);
    console.log(`    Type: ${info.typeName}`);
    console.log(`    Status: ${info.status}`);
    console.log(`    Start: ${info.startTime?.toISOString()}`);
    console.log();
  }

  if (count === 0) {
    console.log("  (no matching workflows found)");
  }
  console.log(`Total: ${count}`);

  await connection.close();
}

/**
 * Describe a specific workflow execution.
 */
async function cmdDescribe(workflowId) {
  if (!workflowId) {
    console.error("Error: workflowId is required");
    process.exit(1);
  }

  const connection = await Connection.connect({ address: TEMPORAL_SERVER });
  const client = new Client({ connection });

  const handle = client.workflow.getHandle(workflowId);
  const describe = await handle.describe();

  console.log(`Workflow: ${describe.workflowId}`);
  console.log(`  Type:       ${describe.typeName}`);
  console.log(`  Status:     ${describe.status}`);
  console.log(`  Task Queue: ${describe.taskQueue}`);
  console.log(`  Start Time: ${describe.startTime?.toISOString()}`);
  console.log(`  Close Time: ${describe.closeTime?.toISOString() || "(running)"}`);

  await connection.close();
}

// ─── Main ────────────────────────────────────────────────────

async function main() {
  const { cmd, args, options } = parseArgs();

  switch (cmd) {
    case "start":
      await cmdStart(args[0], args[1], options);
      break;
    case "start-scan":
      await cmdStartScan();
      break;
    case "signal":
      await cmdSignal(args[0], args[1], options);
      break;
    case "list":
      await cmdList();
      break;
    case "describe":
      await cmdDescribe(args[0]);
      break;
    case "help":
    case "--help":
    case undefined:
      showHelp();
      break;
    default:
      console.error(`Unknown command: "${cmd}"`);
      console.error("Run with no arguments or 'help' to see usage.");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
