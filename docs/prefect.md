# Prefect — Tích hợp Orchestration cho News Monitor Demo

## Mục tiêu file này

File này hướng dẫn cách tích hợp **Prefect** (nền tảng orchestration Python)
vào project **News Monitor Approval Bot** hiện có. Mục đích là chạy các tác vụ
scrape tin tức có scheduling, idempotency, retry, và human approval gate — sử
dụng Prefect flow/task primitives.

Khác với Trigger.dev (cloud-hosted, Node.js), Prefect có thể chạy **100% local**
mà không cần tài khoản hay kết nối cloud nào. Bạn chỉ cần:

1. **Demo server** (Express + Playwright) — cung cấp trang tin và API scrape
2. **Prefect server** (SQLite-based, chạy tại localhost:4200) —
   UI dashboard + API
3. **Python flow** (`news_flow.py`) — định nghĩa workflow và serve deployment

Prefect quản lý state, retry, pause/resume, scheduling — tất cả qua server local.

## Các file đã tạo / sửa

| File | Vai trò |
|------|---------|
| `prefect/news_flow.py` | Định nghĩa task + flow: `news_scrape_flow` (manual) và `scheduled_news_scan_flow` (cron) |
| `prefect/requirements.txt` | Dependencies: `prefect>=2.14`, `httpx` |
| `docs/prefect.md` | File này — tài liệu hướng dẫn |
| `.gitignore` | Thêm `__pycache__/` và `*.pyc` |

## Prerequisites

- **Node.js** >= 18 (đã cài `npm start` cho demo server)
- **Playwright Chromium** — đã cài qua `npm run setup` hoặc `npx playwright install chromium`
- **Python** >= 3.10
- **pip** (đi kèm Python)
- **npm** packages — đã cài qua `npm install` (express, playwright)

## Các lệnh chạy từ trạng thái sạch

### 1. Cài Python dependencies

```bash
pip install -r prefect/requirements.txt
```

### 2. Cài npm dependencies (nếu chưa)

```bash
npm install
npm run setup   # cài Chromium cho Playwright
```

### 3. Chạy 3 terminal

Mở **ba terminal riêng** và chạy theo thứ tự dưới đây.

#### Terminal 1 — Demo Server

```bash
npm start
# => http://localhost:3100
# Nhấn Ctrl+C để dừng
```

#### Terminal 2 — Prefect Server

```bash
prefect server start
# => http://localhost:4200 (Prefect UI)
# => http://localhost:4200/api (Prefect API)
# Lần đầu chạy sẽ tạo SQLite database tại ~/.prefect/prefect.db
# Nhấn Ctrl+C để dừng
```

> **Lưu ý:** `prefect server start` khởi động tất cả service cần thiết (API,
> UI, scheduler) trong một process duy nhất. Phù hợp cho local dev/testing.
> Không cần work pool, worker, hay deployment riêng nhờ dùng `flow.serve()`.

#### Terminal 3 — Prefect Flow (served)

```bash
python prefect/news_flow.py
# => "🚀 Starting Prefect deployments via .serve()..."
# => Hai deployment đã đăng ký: news-scrape-manual, news-scheduled-scan
# Flow process sẽ chạy mãi, chờ trigger từ Prefect server.
# Nhấn Ctrl+C để dừng.
```

## Expected URLs

| URL | Mục đích |
|-----|----------|
| http://localhost:3100 | Demo server (Express + Playwright) |
| http://localhost:3100/news | Trang danh sách article |
| http://localhost:3100/api/scrape | POST endpoint scrape |
| http://localhost:3100/api/runs/:runId | GET endpoint kiểm tra cache |
| http://localhost:4200 | **Prefect UI** — dashboard |
| http://localhost:4200/flow-runs | Xem danh sách flow runs |

## Các bước trong Prefect UI

### Lần đầu vào Prefect UI

1. Mở http://localhost:4200
2. Bạn sẽ thấy sidebar với các tab: **Flow Runs**, **Flows**, **Deployments**, **Blocks**, **Work Pools**.
3. Vì chưa có flow run nào, **Flow Runs** sẽ trống.
4. Click vào tab **Deployments** — bạn sẽ thấy 2 deployments:
   - `news-scrape-manual / news-scrape-flow`
   - `news-scheduled-scan / scheduled-news-scan-flow`
5. Ở deployment `news-scrape-manual`, click nút **▶** (hoặc **Run**) để trigger manual run.

### Cách trigger một manual run

**Cách 1 — Prefect UI:**
1. Vào **Deployments** tab
2. Click vào deployment `news-scrape-manual`
3. Click nút **Run** (góc trên phải)
4. Trong hộp thoại, nhập JSON parameters:
   ```json
   {"keyword": "markets", "runId": "test-manual-001"}
   ```
5. Click **Run** — flow run được tạo, click vào run để xem real-time log

**Cách 2 — Prefect CLI (nhanh hơn cho dev):**
```bash
# Thay <deployment_id> bằng ID thật (chạy `prefect deployment ls` để xem)
prefect deployment run 'news-scrape-manual/news_scrape_flow' -p '{"keyword": "markets", "runId": "test-cli-001"}'
```

**Cách 3 — Prefect Python API:**
```python
from prefect import flow
from prefect.deployments import run_deployment
run_deployment(
    "news-scrape-manual/news_scrape_flow",
    parameters={"keyword": "markets", "runId": "test-api-001"}
)
```

> **Khuyến nghị:** Bắt đầu với UI (Cách 1) vì dễ thấy log real-time nhất.
> CLI nhanh hơn khi dev nhiều lần.

## Cách test các edge case

### Danh sách edge case

Sử dụng deployment `news-scrape-manual` với các parameters khác nhau.

| Test case | Keyword | runId | Expected behavior |
|-----------|---------|-------|-------------------|
| Happy path | `markets` | `test-prefect-001` | `approval: "auto_approved"` |
| Approval + fallback selector | `acquisition` | `test-prefect-002` | Pause chờ human, dùng `.headline` fallback |
| Fail-once retry + approval | `cyberattack` | `test-prefect-003` | Task retry 2 lần (với 2s delay), **sau đó** pause xin approval |
| Slow page | `inflation` | `test-prefect-004` | 7s delay, nhưng httpx timeout 60s đủ, auto-approved |
| Not found | `volcano` | `test-prefect-005` | `status: "not_found"`, `approval: "not_needed"` |
| Idempotency | `markets` | `test-prefect-001` (lại) | `approval: "cached"` |
| Server error | (tắt demo server) | `test-prefect-006` | Task retry rồi fail → `approval: "not_needed"`, `status: "error"` |

Reset demo server state giữa các lần test:
```bash
curl -X POST http://localhost:3100/api/admin/reset
```

### 1. Test human approval pause/resume (acquisition hoặc cyberattack)

Đây là tính năng chính của Prefect integration — flow tự động pause chờ
human decision.

**Steps:**

1. Trigger manual run với parameters:
   ```json
   {"keyword": "acquisition", "runId": "test-approval-001"}
   ```
   hoặc:
   ```json
   {"keyword": "cyberattack", "runId": "test-approval-002"}
   ```

2. Vào **Flow Runs** tab trong Prefect UI

3. Click vào run đang chạy — bạn sẽ thấy:
   - Log: `"⏸ Requires human approval: ..."`
   - State chuyển sang **Paused**
   - Một tab (hoặc section) **Resume** / **Input Required** hiện ra

4. Click **Resume** để mở form `ApprovalDecision`:
   - **approved**: checkbox (mặc định: checked)
   - **notes**: text field (optional, ví dụ "Looks good" hoặc "Not relevant")

5. Submit — flow tiếp tục, log hiện:
   - `"✅ Human decision: approved"` hoặc
   - `"❌ Human decision: rejected"`

6. Xem kết quả trong run output (tab **Results** hoặc **Output**).

### 2. Test scheduled run

Scheduled scan chạy qua **6 tiếng** một lần (cron `0 */6 * * *`).
Để test nhanh, bạn có thể trigger thủ công:

**Cách 1 — Prefect UI:**
1. Vào **Deployments** tab
2. Click deployment `news-scheduled-scan`
3. Click **Run** (không cần parameters)
4. Flow iterates qua: `markets`, `acquisition`, `cyberattack`, `inflation`
5. Với mỗi keyword:
   - Kiểm tra cache
   - Scrape
   - Pause nếu cần approval
6. Sau khi tất cả keywords hoàn tất, flow trả về summary:
   ```json
   {
     "summary": {
       "scan_id": "2026-05-11T14",
       "total": 4,
       "approved": 0,
       "rejected": 0,
       "auto_approved": 1,
       "cached": 0,
       "not_found": 1,
       "errors": 0
     },
     "results": [...]
   }
   ```

**Cách 2 — CLI:**
```bash
prefect deployment run 'news-scheduled-scan/scheduled_news_scan_flow'
```

> **Lưu ý:** scheduled scan gọi `news_scrape_flow` cho mỗi keyword.
> Nếu một keyword pause (cần approval), scheduled scan cũng sẽ đợi
> đến khi được resume mới tiếp tục keyword tiếp theo.

### 3. Test tất cả edge cases cùng lúc

Chạy lần lượt các deployment run sau (reset state trước mỗi lần):

```bash
# Reset state
curl -X POST http://localhost:3100/api/admin/reset

# 1. Happy path
prefect deployment run 'news-scrape-manual/news_scrape_flow' \
  -p '{"keyword":"markets","runId":"test-all-001"}'

# 2. Approval + fallback
prefect deployment run 'news-scrape-manual/news_scrape_flow' \
  -p '{"keyword":"acquisition","runId":"test-all-002"}'
# → Pause, resume trong UI

# 3. Fail-once retry + approval
prefect deployment run 'news-scrape-manual/news_scrape_flow' \
  -p '{"keyword":"cyberattack","runId":"test-all-003"}'
# → Task retry (2 lần), sau đó pause
# → Resume trong UI

# 4. Slow page
prefect deployment run 'news-scrape-manual/news_scrape_flow' \
  -p '{"keyword":"inflation","runId":"test-all-004"}'

# 5. Not found
prefect deployment run 'news-scrape-manual/news_scrape_flow' \
  -p '{"keyword":"volcano","runId":"test-all-005"}'

# 6. Idempotency (dùng lại runId từ test 1)
prefect deployment run 'news-scrape-manual/news_scrape_flow' \
  -p '{"keyword":"markets","runId":"test-all-001"}'
# → approval: "cached"
```

## So sánh: Prefect vs Trigger.dev (local testing)

| Tiêu chí | Prefect | Trigger.dev v4 |
|----------|---------|----------------|
| Cloud requirement | **Không** — 100% local | Có — cần tài khoản cloud |
| Server để chạy | `prefect server start` | Cloud dashboard |
| UI | http://localhost:4200 | https://cloud.trigger.dev |
| Human approval | `pause_flow_run()` → UI Resume form | `wait.createToken()` + `wait.forToken()` |
| Retry | `@task(retries=N)` built-in | `retry` config trên task |
| Scheduling | Cron trong `.serve()` hoặc `@flow(cron=...)` | `cron` field trên task |
| Ngôn ngữ | Python | JavaScript / TypeScript |
| State persistence | SQLite (local) | Cloud DB |
| Setup time | Vài phút (pip install) | Vài phút + tài khoản cloud |

## Cấu trúc code Prefect

### news_scrape_flow (single keyword)

```
news_scrape_flow(keyword, runId?, timeoutMs?)
  │
  ├─ 1. check_run(runId) ─── cached? ──→ return {approval: "cached"}
  │
  ├─ 2. call_scrape(keyword, runId, timeoutMs) → task(retries=2)
  │      │
  │      ├─ error ──→ return {approval: "not_needed", status: "error"}
  │      ├─ not_found ──→ return {approval: "not_needed", status: "not_found"}
  │      └─ success ──→ continues
  │
  ├─ 3. needsApproval? ─── yes ──→ pause_flow_run()
  │      │                         ├─ resume with approved=true  → return {approval: "approved"}
  │      │                         └─ resume with approved=false → return {approval: "rejected"}
  │      │
  │      └─ no ──→ return {approval: "auto_approved"}
  │
  └─ return result dict
```

### scheduled_news_scan_flow

```
scheduled_news_scan_flow()
  │
  └─ for each keyword in SCAN_KEYWORDS:
       └─ news_scrape_flow(keyword, runId=scan-{keyword}-{scan_id})
            └─ aggregate results + summary
```

## Những gì đã implement

- [x] Single keyword flow với idempotency check
- [x] Task-level retry cho scrape (2 lần, 2s delay)
- [x] Human approval gate via `pause_flow_run()` với Pydantic input model
- [x] Scheduled scan flow với cron `0 */6 * * *`
- [x] Local dev pattern: `flow.serve()` + `prefect server start`
- [x] Xử lý timeout approval (tự động reject sau 1 giờ)
- [x] Log/print rõ ràng cho từng bước
- [x] Return payloads nhất quán với shared demo (`cached`, `not_needed`, `auto_approved`, `approved`, `rejected`, `not_found`, `error`)

## Những gì chưa implement / hạn chế

1. **Prefect Cloud không được dùng ở đây**
   - Hướng dẫn này chỉ dùng Prefect server local (SQLite).
   - Nếu muốn Prefect Cloud, cần tạo tài khoản, workspace, API key, và
     chạy `prefect cloud login` thay vì `prefect server start`.

2. **Approval chỉ hoạt động qua UI/CLI**
   - Chưa có webhook/slack tích hợp để resume approval.
   - Phải mở Prefect UI (http://localhost:4200) để click Resume.

3. **Demo server state không bền vững với Prefect**
   - Prefect lưu flow run state (SQLite), nhưng demo server lưu cache riêng
     trong `runtime/runs.json`.
   - Nếu demo server restart, cache trong memory mất (vẫn đọc từ disk).

4. **Scheduled scan chạy tuần tự**
   - Các keywords chạy tuần tự, không parallel.
   - Nếu một keyword pause chờ approval, các keyword sau cũng phải đợi.

5. **Không có concurrency limit rõ ràng**
   - Prefect hỗ trợ work pool + concurrency limits, nhưng không dùng ở đây
     để giữ setup tối thiểu.

6. **Cron chỉ chạy khi `news_flow.py` đang serve**
   - Nếu tắt process ở Terminal 3, cron schedule không được đánh thức.
   - Prefect server (Terminal 2) vẫn chạy, nhưng không có worker để
     chạy flow.

## Practical caveats cho local testing

### 1. `pause_flow_run` yêu cầu Prefect Server

`pause_flow_run()` chỉ hoạt động khi Prefect server đang chạy
(Terminal 2). Nếu chưa chạy `prefect server start`, flow sẽ raise
lỗi `RuntimeError: "pause_flow_run is not available"`.

### 2. `flow.serve()` blocking

`python prefect/news_flow.py` chạy mãi (serve blocking).
Bạn cần một terminal riêng cho nó. Để dừng: `Ctrl+C`.

### 3. Prefect server lần đầu

Lần đầu `prefect server start`, nó sẽ:
- Tạo SQLite database tại `~/.prefect/prefect.db`
- Khởi tạo schema
- Sau 5-10 giây, UI sẽ ready tại http://localhost:4200

### 4. Dừng Prefect server

`Ctrl+C` ở Terminal 2. SQLite database vẫn giữ nguyên state (flow runs, deployments).
Khi chạy lại `prefect server start`, lịch sử vẫn còn.

### 5. Reset Prefect state

Muốn xoá toàn bộ Prefect state (flow runs, deployments):
```bash
# Dừng Prefect server trước
rm ~/.prefect/prefect.db
# Sau đó chạy lại prefect server start
```

### 6. Thay đổi code Prefect

Khi sửa `news_flow.py`, bạn cần restart Terminal 3 (`Ctrl+C` rồi chạy lại).
Prefect serve process không tự reload.

### 7. Python version

Prefect yêu cầu Python >= 3.9. Đã test với Python 3.10, 3.11, 3.12.
Kiểm tra version:
```bash
python --version
```
