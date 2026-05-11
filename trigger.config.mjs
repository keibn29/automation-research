// ────────────────────────────────────────────────────────────
// trigger.config.mjs — Trigger.dev v4 Configuration
// ────────────────────────────────────────────────────────────
// This file is loaded by Node.js directly; it uses ESM (.mjs)
// so it works alongside the existing CommonJS demo server.
//
// The trigger/ directory is auto-discovered by the CLI.
// ────────────────────────────────────────────────────────────

import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Project reference from Trigger.dev dashboard.
  // Get this from Dashboard → Your Project → Settings → Project Ref.
  // Format: proj_abc123def456
  project: "proj_ybcnnxkwphxpjsweykdg",

  // Maximum duration for a single run (300s = 5 min)
  maxDuration: 300,

  // Automatic retry on failure
  retries: {
    enabled: true,
    maxAttempts: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 30_000,
    factor: 2,
    randomize: true,
  },
});
