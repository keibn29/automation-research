# ────────────────────────────────────────────────────────────
# prefect/news_flow.py — Prefect integration for News Demo
# ────────────────────────────────────────────────────────────
# One file with:
#   • news_scrape_flow()      — single keyword (manual trigger)
#   • scheduled_news_scan_flow() — iterates default keyword list
#   • .serve() entrypoint     — local dev serving
#
# Edge cases covered:
#   • Idempotency  — GET /api/runs/:runId before scrape
#   • Human approval — pause_flow_run() with Pydantic input
#   • Retry         — @task(retries=2) for scrape 5xx errors
#   • Not found     — clean not_found payload
#   • Error         — error payload with message
#   • Cached        — cached result with approval:"cached"
# ────────────────────────────────────────────────────────────

import os
from typing import Optional
from datetime import datetime

import httpx
from prefect import flow, task, pause_flow_run, serve
from pydantic import BaseModel

# ─── Configuration ──────────────────────────────────────────

DEMO_SERVER = os.getenv("DEMO_SERVER_URL", "http://localhost:3100")

# Keywords the scheduled scan iterates over
SCAN_KEYWORDS = ["markets", "acquisition", "cyberattack", "inflation"]


# ─── Approval Input Model ───────────────────────────────────

class ApprovalDecision(BaseModel):
    """Data model shown in Prefect UI when a run pauses for human review.

    The UI renders this as a form with:
      - approved: checkbox (default checked)
      - notes:    text field (optional)
    """
    approved: bool = True
    notes: str = ""


# ─── HTTP Tasks ────────────────────────────────────────────

@task(retries=2, retry_delay_seconds=2)
def call_scrape(
    keyword: str,
    runId: Optional[str] = None,
    timeoutMs: Optional[int] = None,
) -> dict:
    """POST /api/scrape with Prefect-managed retry on 5xx.

    Retries up to 2 times with 2s delay between attempts.
    Returns the scrape result dict on success,
    or an error-shaped dict on HTTP failure.
    """
    body: dict = {"keyword": keyword}
    if runId:
        body["runId"] = runId
    if timeoutMs is not None:
        body["timeoutMs"] = timeoutMs

    print(f"  🕸 Scraping keyword=\"{keyword}\" runId={runId}")

    with httpx.Client(timeout=60) as client:
        resp = client.post(f"{DEMO_SERVER}/api/scrape", json=body)

        # 5xx errors trigger Prefect task retry
        if resp.status_code >= 500:
            resp.raise_for_status()

        # Non-5xx errors return an error-shaped payload
        if not resp.is_success:
            return {
                "status": "error",
                "keyword": keyword,
                "error": f"Scrape endpoint returned HTTP {resp.status_code}",
            }

        return resp.json()


@task
def check_run(runId: str) -> Optional[dict]:
    """GET /api/runs/:runId — returns cached result or None."""
    with httpx.Client(timeout=10) as client:
        resp = client.get(f"{DEMO_SERVER}/api/runs/{runId}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


# ─── Flows ─────────────────────────────────────────────────

@flow
def news_scrape_flow(
    keyword: str,
    runId: Optional[str] = None,
    timeoutMs: Optional[int] = None,
):
    """Single keyword scrape with idempotency and human approval gate.

    Returns a dict with all scrape fields plus an ``approval`` key:

    ================  =========================================
    ``approval``      Meaning
    ================  =========================================
    ``"cached"``      runId existed on server — returned cached
    ``"not_needed"``  Terminal (error / not_found) — no gate
    ``"auto_approved"`` Scrape OK, needsApproval was false
    ``"approved"``    Human approved via Prefect UI
    ``"rejected"``    Human rejected via Prefect UI
    ================  =========================================
    """
    print(f"\n{'=' * 60}")
    print(f"📰 news_scrape_flow: keyword=\"{keyword}\" runId={runId}")
    print(f"{'=' * 60}")

    # ── Step 1: Idempotency check ──
    if runId:
        cached = check_run(runId)
        if cached:
            print(f"  🔁 Idempotency hit for runId=\"{runId}\"")
            return {**cached, "approval": "cached"}

    # ── Step 2: Scrape (with task-level retry for 5xx) ──
    result = call_scrape(keyword, runId, timeoutMs)
    status = result.get("status")
    print(f"  → Scrape result: status={status}")

    # ── Terminal states — no approval gate ──
    if status in ("error", "not_found"):
        print(f"  ⏹ Terminal state: {status} — no approval needed")
        return {**result, "approval": "not_needed"}

    # ── Step 3: Human approval gate ──
    if result.get("needsApproval"):
        title = result.get("title", "Unknown")
        reasons = ", ".join(result.get("sensitiveReasons", []))
        print(f"  ⏸ Requires human approval: \"{title}\"")
        print(f"     Reasons: {reasons}")
        print(f"  → Resume in Prefect UI at http://localhost:4200")
        print(f"  → Or via CLI: prefect flow-run resume <run_id> --input '{{\"approved\": true}}'")

        # Pause the flow run and wait for human input
        decision: Optional[ApprovalDecision] = pause_flow_run(
            wait_for_input=ApprovalDecision,
            timeout=3600,  # 1 hour timeout
        )

        # Timeout — treat as rejected
        if decision is None:
            print("  ⏰ Approval timed out — treating as rejected")
            return {
                **result,
                "approval": "rejected",
                "approval_notes": "Timed out (no decision within 1 hour)",
            }

        approved = decision.approved
        print(f"  → Human decision: {'✅ approved' if approved else '❌ rejected'}")
        return {
            **result,
            "approval": "approved" if approved else "rejected",
            "approval_notes": decision.notes,
        }

    # ── Step 4: Auto-approved (not sensitive) ──
    print(f"  ✅ Auto-approved: \"{result.get('title', 'Unknown')}\"")
    return {**result, "approval": "auto_approved"}


@flow
def scheduled_news_scan_flow():
    """Scheduled scan over the default keyword list.

    Iterates sequentially with idempotency + approval gates.
    Designed to run every 6 hours via cron.
    """
    scan_id = datetime.utcnow().strftime("%Y-%m-%dT%H")
    print(f"\n{'=' * 60}")
    print(f"📡 scheduled_news_scan_flow: scan_id={scan_id}")
    print(f"{'=' * 60}")

    results: list[dict] = []
    counts = {
        "approved": 0,
        "rejected": 0,
        "auto_approved": 0,
        "cached": 0,
        "not_found": 0,
        "errors": 0,
    }

    for keyword in SCAN_KEYWORDS:
        run_id = f"scan-{keyword}-{scan_id}"
        print(f"\n  --- Keyword: \"{keyword}\" (runId={run_id}) ---")

        try:
            out = news_scrape_flow(keyword, runId=run_id)
            approval = out.get("approval", "unknown")

            if approval == "not_needed":
                if out.get("status") == "not_found":
                    counts["not_found"] += 1
                else:
                    counts["errors"] += 1
            elif approval in counts:
                counts[approval] += 1
            else:
                counts["errors"] += 1

            results.append({
                "keyword": keyword,
                "approval": approval,
                "status": out.get("status"),
            })
            print(f"  → Result: {approval}")

        except Exception as e:
            print(f"  ✗ Exception for \"{keyword}\": {e}")
            counts["errors"] += 1
            results.append({
                "keyword": keyword,
                "approval": "error",
                "status": "error",
                "error": str(e),
            })

    summary = {
        "scan_id": scan_id,
        "total": len(SCAN_KEYWORDS),
        **counts,
    }

    print(f"\n{'=' * 60}")
    print(f"📊 Scan complete: {summary}")
    print(f"{'=' * 60}")

    return {"summary": summary, "results": results}


# ─── Serve (local dev entrypoint) ──────────────────────────
#
# Terminal 1: npm start                     (demo server)
# Terminal 2: prefect server start           (Prefect API + UI)
# Terminal 3: python prefect/news_flow.py    (this file)
#
# The .serve() call registers two deployments and blocks,
# listening for manual or scheduled triggers.

if __name__ == "__main__":
    print("🚀 Starting Prefect deployments via .serve()...")
    print(f"   DEMO_SERVER={DEMO_SERVER}")
    print(f"   Prefect UI: http://localhost:4200")
    print()

    serve(
        news_scrape_flow.to_deployment(
            name="news-scrape-manual",
        ),
        scheduled_news_scan_flow.to_deployment(
            name="news-scheduled-scan",
            cron="0 */6 * * *",
        ),
    )
