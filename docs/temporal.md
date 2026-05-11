# Temporal — Tích hợp Orchestration cho News Monitor Demo

## Mục tiêu file này

File này hướng dẫn cách tích hợp **Temporal** (nền tảng orchestration mã nguồn mở,
Durational Execution) vào project **News Monitor Approval Bot** hiện có. Mục đích
là chạy các tác vụ scrape tin tức có scheduling, idempotency, retry, và human
approval gate — sử dụng Temporal Workflow + Activity primitives.

Khác với Trigger.dev (cloud-hosted) và Prefect (Python-native), Temporal:

- **Chạy 100% local** với Temporal dev server (`temporal server start-dev`)
- **Không cần tài khoản cloud** — tất cả đều local
- **Dùng JS/TS** (giống Trigger.dev) nhưng không phụ thuộc cloud
- **Dùng Signal + condition** cho human approval thay vì waitpoint hay pause

Bạn cần 4 terminal riêng:

1. **Demo server** (Express + Playwright) — cung cấp trang tin và API scrape
2. **Temporal dev server** — server local chứa workflow state + UI
3. **Temporal worker** — process chạy workflow + activity code
4. **Client** — CLI để start workflow và gửi signal

## Các file đã tạo / sửa

| File | Vai trò |
|------|---------|
| `temporal/workflows.js` | Định nghĩa workflow: `newsScrapeWorkflow` (manual) và `scheduledNewsScanWorkflow` (scan) |
| `temporal/activities.js` | Activity functions: `checkRun` (idempotency), `callScrape` (HTTP scrape) |
| `temporal/worker.js` | Worker đăng ký workflow + activity và poll task queue |
| `temporal/client.js` | CLI client: start workflow, send signal, list/describe workflows |
| `temporal/package.json` | `{"type": "module"}` + dependencies Temporal SDK |
| `docs/temporal.md` | File này — tài liệu hướng dẫn |
| `package.json` | Thêm scripts `temporal:*` |

## Prerequisites

- **Node.js** >= 18 (project hiện tại dùng Node 24)
- **Playwright Chromium** — đã cài qua `npm run setup` hoặc `npx playwright install chromium`
- **npm packages** — đã cài qua `npm install` (express, playwright)
- **Temporal CLI** — cài đặt:

```bash
# macOS (Homebrew)
brew install temporal

# Linux / Windows — xem https://temporal.io/download
```

Kiểm tra cài đặt thành công:

```bash
temporal --version
# => temporal version x.y.z
```

- **Temporal npm packages** — cài trong thư mục `temporal/`:

```bash
cd temporal && npm install && cd ..
```

## Các lệnh chạy từ trạng thái sạch

### 1. Cài đặt (nếu chưa làm)

```bash
# Từ thư mục gốc
npm install
npm run setup                             # cài Chromium cho Playwright
cd temporal && npm install && cd ..       # cài Temporal SDK
```

### 2. Chạy 4 terminal

Mở **bốn terminal riêng** và chạy theo thứ tự dưới đây.

#### Terminal 1 — Demo Server

```bash
npm start
# => http://localhost:3100
# Nhấn Ctrl+C để dừng
```

#### Terminal 2 — Temporal Dev Server

```bash
temporal server start-dev
```

Lệnh này:

- Khởi động Temporal server local với built-in UI
- Dùng SQLite làm backend (không cần cài đặt gì thêm)
- Mở Temporal UI tại **http://localhost:8233**
- Mở gRPC endpoint tại **localhost:7233** (worker/client kết nối đến đây)
- **Lưu ý:** Lần đầu chạy sẽ tải Docker image Temporal — cần internet và Docker.
  Nếu không có Docker, dùng `temporal server start-dev --db-file` (SQLite thuần,
  giải thích ở phần caveats).
- Nhấn `Ctrl+C` để dừng.

#### Terminal 3 — Temporal Worker

```bash
npm run temporal:worker
# tương đương: node temporal/worker.js
```

Worker sẽ:

- Kết nối đến Temporal server tại `localhost:7233`
- Đăng ký workflow `newsScrapeWorkflow` và `scheduledNewsScanWorkflow`
- Đăng ký activities `checkRun` và `callScrape`
- Poll task queue `news-monitor` để nhận tasks
- Log: `"[worker] Worker created. Polling task queue 'news-monitor'..."`

#### Terminal 4 — Client (trigger workflow)

Dùng terminal này để start workflow và gửi signal.

## Expected URLs

| URL | Mục đích |
|-----|----------|
| http://localhost:3100 | Demo server (Express + Playwright) |
| http://localhost:3100/news | Trang danh sách article |
| http://localhost:3100/api/scrape | POST endpoint scrape |
| http://localhost:3100/api/runs/:runId | GET endpoint kiểm tra cache |
| http://localhost:8233 | **Temporal UI** — dashboard |
| http://localhost:8233/namespaces/default/workflows | Xem danh sách workflows |
| localhost:7233 | Temporal gRPC endpoint (worker + client kết nối) |

## Các bước trong Temporal UI

### Lần đầu vào Temporal UI

1. Mở http://localhost:8233
2. Bạn sẽ thấy trang **Dashboard** với:
   - **Workflows** — danh sách workflow executions
   - **Workers** — worker đang kết nối
   - **Task Queues** — task queue đang hoạt động
   - **Recent Runs** — các workflow gần đây
3. Nếu worker đang chạy (Terminal 3), bạn sẽ thấy **1 Worker** connected
   và task queue **news-monitor** xuất hiện.
4. Nếu chưa có workflow nào, trang **Workflows** sẽ trống.
   Click **Run Workflow** hoặc dùng CLI (bên dưới).

### Các tab quan trọng trong Temporal UI

| Tab / Section | Mô tả |
|---------------|-------|
| **Workflows** | Danh sách tất cả workflow executions, filter theo status |
| **Workers** | Worker đang kết nối, task queue, activity types đã register |
| **Task Queues** | Các task queue và số pending tasks |
| **Schedule** | Lịch cron (nếu có tạo schedule) |
| Workflow detail | Click vào workflow ID để xem: events, history, signals, kết quả |

Khi workflow đang chờ signal, bạn sẽ thấy trạng thái **Running** hoặc
**WorkflowTask** trong UI. Click vào workflow để xem signal history.

## Cách test

### 1. Test manual run (newsScrapeWorkflow)

Sau khi cả demo server, Temporal dev server, và worker đều đang chạy:

```bash
# Test 1 — normal article (auto-approved)
npm run temporal:start markets test-manual-001

# Test 2 — article cần approval
npm run temporal:start acquisition test-manual-002
# → Workflow sẽ pause chờ signal
# → Gửi approval signal (xem bước 2 bên dưới)

# Test 3 — article không tồn tại
npm run temporal:start volcano test-manual-003
# → Trả về status: "not_found"

# Test 4 — idempotency (dùng lại runId từ test 1)
npm run temporal:start markets test-manual-001
# → Trả về approval: "cached"

# Test 5 — fail-once + approval
npm run temporal:start cyberattack test-manual-004
# → Activity retry (3 lần, Temporal tự động), sau đó pause chờ signal

# Test 6 — slow page
npm run temporal:start inflation test-manual-005
# → 7s delay, nhưng activity timeout 120s đủ, auto-approved
```

Kết quả workflow sẽ hiện trong Temporal UI và worker log.

### 2. Test human approval signal

Tính năng chính — workflow pause chờ signal approval.

**Steps:**

1. Start workflow với keyword cần approval:
   ```bash
   npm run temporal:start acquisition test-approval-001
   ```

2. Worker log sẽ hiện:
   ```
   [workflow] Needs approval: "Tech Giant Announces Major Acquisition"
   [workflow] Waiting for signal "approvalSignal"...
   [workflow]   → Send signal: node temporal/client.js signal <workflowId> approved
   ```

3. Mở http://localhost:8233 → **Workflows** tab → Click workflow ID

4. Trong workflow detail, bạn sẽ thấy workflow đang ở trạng thái **Running**.
   Tab **Events** sẽ hiện các event: `WorkflowTaskScheduled`, `WorkflowTaskStarted`, v.v.
   Khi gửi signal, event `WorkflowExecutionSignaled` sẽ xuất hiện.

5. Gửi approval signal từ Terminal 4:
   ```bash
   # Lấy workflowId từ log hoặc UI
   npm run temporal:signal news-scrape-test-approval-001 approved
   ```

   Hoặc rejection:
   ```bash
   npm run temporal:signal news-scrape-test-approval-001 rejected --notes "Not relevant"
   ```

6. Workflow sẽ tiếp tục, worker log hiện:
   ```
   [workflow] Decision: approved
   ```

7. Kết quả hiển thị trong workflow detail (tab **Summary** hoặc **Events**).

### 3. Test scheduled scan

```bash
npm run temporal:start-scan
# tương đương: node temporal/client.js start-scan
```

Workflow này sẽ:

- Tạo scan ID dựa trên timestamp
- Lặp qua 4 keyword: `markets`, `acquisition`, `cyberattack`, `inflation`
- Với mỗi keyword: kiểm tra cache → scrape → pause nếu cần approval
- Trả về summary với số lượng approved / rejected / auto_approved / cached / errors

**Gửi approval trong scan:**

Vì scan workflow chạy tuần tự, nó sẽ dừng ở keyword `acquisition` (cần approval)
cho đến khi nhận được signal. Gửi signal với `--keyword` để chỉ đúng keyword:

```bash
# Lấy workflowId từ log
npm run temporal:signal news-scan-<scanId> approved --keyword acquisition
```

Sau đó worker tiếp tục với `cyberattack` (cũng cần approval):

```bash
npm run temporal:signal news-scan-<scanId> approved --keyword cyberattack
```

### 4. Test tất cả edge cases cùng lúc

Chạy lần lượt các lệnh sau (reset state giữa các lần nếu cần):

```bash
# Reset state demo server
curl -X POST http://localhost:3100/api/admin/reset

# 1. Happy path
npm run temporal:start markets test-all-001

# 2. Approval + fallback
npm run temporal:start acquisition test-all-002
# → Signal approval

# 3. Fail-once retry + approval
npm run temporal:start cyberattack test-all-003
# → Activity retry, sau đó signal approval

# 4. Slow page
npm run temporal:start inflation test-all-004

# 5. Not found
npm run temporal:start volcano test-all-005

# 6. Idempotency (dùng lại runId từ test 1)
npm run temporal:start markets test-all-001
# → approval: "cached"
```

### 5. Các CLI helper khác

```bash
# List workflows
npm run temporal:list

# Describe workflow
npm run temporal:describe news-scrape-test-manual-001

# Xem help
npm run temporal:help
```

## Cấu trúc code Temporal

### Luồng xử lý

```
newsScrapeWorkflow({ keyword, runId, timeoutMs })
  │
  ├─ 1. checkRun(runId) ─── [activity] cached? ──→ return { approval: "cached" }
  │
  ├─ 2. callScrape({ keyword, runId }) ─── [activity, retry 3x on 5xx]
  │      │
  │      ├─ error ──→ return { approval: "not_needed", status: "error" }
  │      ├─ not_found ──→ return { approval: "not_needed", status: "not_found" }
  │      └─ success ──→ continues
  │
  ├─ 3. needsApproval? ─── yes ──→ setHandler(approvalSignal)
  │      │                          └─ await condition(24h timeout)
  │      │                             ├─ signal approved  → return { approval: "approved" }
  │      │                             ├─ signal rejected  → return { approval: "rejected" }
  │      │                             └─ timeout          → return { approval: "rejected" }
  │      │
  │      └─ no ──→ return { approval: "auto_approved" }
  │
  └─ return result dict
```

### scheduledNewsScanWorkflow

```
scheduledNewsScanWorkflow()
  │
  ├─ setHandler(approvalSignal)  — nhận signal cho tất cả keywords
  │
  └─ for each keyword in SCAN_KEYWORDS:
       ├─ checkRun(runId) ─── cached? ──→ skip
       ├─ callScrape(keyword, runId)
       ├─ needsApproval? ─── yes ──→ await condition(approvals[keyword])
       └─ aggregate results
  │
  └─ return { summary, results }
```

### Quan hệ giữa các file

```
temporal/client.js          ← CLI tool, dùng @temporalio/client
  │                           để start workflow và gửi signal
  │
  └─ gọi workflow trên Temporal server (localhost:7233)
       │
temporal/worker.js          ← Worker process
  │                           đăng ký workflows.js + activities.js
  │                           poll task queue "news-monitor"
  │
  ├── temporal/workflows.js    ← Workflow definitions
  │     │                        (chạy trong Temporal isolate)
  │     └─ proxyActivities()    ← gọi activities từ workflow
  │
  └── temporal/activities.js   ← Activity functions
                                  (chạy trong Node runtime)
                                  └─ HTTP calls đến demo server
```

## So sánh: Temporal vs Prefect vs Trigger.dev (local testing)

| Tiêu chí | Temporal | Prefect | Trigger.dev v4 |
|----------|----------|---------|----------------|
| Cloud requirement | **Không** — 100% local | **Không** — 100% local | **Có** — cần cloud |
| Server để chạy | `temporal server start-dev` | `prefect server start` | Cloud dashboard |
| UI | http://localhost:8233 | http://localhost:4200 | https://cloud.trigger.dev |
| Human approval | Signal + `condition()` | `pause_flow_run()` → Resume form | `wait.createToken()` + `wait.forToken()` |
| Retry | Activity retry policy built-in | `@task(retries=N)` built-in | Task retry config |
| Scheduling | Cron trên Schedule UI hoặc SDK | Cron trong `.serve()` | Cron field trên task |
| Ngôn ngữ | JavaScript / TypeScript | Python | JavaScript / TypeScript |
| State persistence | SQLite (dev server) | SQLite (local) | Cloud DB |
| Setup time | Vài phút (brew install + npm) | Vài phút (pip install) | Vài phút + tài khoản cloud |
| Signal gốc | ✅ Có — Signal là native primitive | ❌ Không — dùng pause/resume | ❌ Không — dùng waitpoint |
| Activity retry policy | ✅ Retry policy riêng biệt | ✅ Task decorator | ✅ Task config |

## Những gì đã implement

- [x] Single keyword workflow với idempotency check
- [x] Activity retry cho scrape (3 lần với exponential backoff)
- [x] Human approval gate via Signal + `condition()`
- [x] Scheduled scan workflow (tuần tự qua 4 keywords)
- [x] Local dev pattern: Temporal dev server + worker + CLI
- [x] Xử lý timeout approval (tự động reject sau 24 giờ)
- [x] CLI helper: start workflow, send signal, list/describe
- [x] Log rõ ràng cho từng bước (workflow + activity + worker)
- [x] Return payloads nhất quán: `cached`, `not_needed`, `auto_approved`, `approved`, `rejected`, `not_found`, `error`
- [x] Activity proxy với `startToCloseTimeout: 120s` cho scrape lâu
- [x] Workflow ID naming có ý nghĩa: `news-scrape-{runId}`, `news-scan-{scanId}`

## Những gì chưa implement / hạn chế

### 1. Temporal dev server cần Docker (mặc định)

Lần đầu `temporal server start-dev` sẽ tải Docker image
(`temporalio/dev-server:latest`). Nếu không có Docker:

```bash
# Dùng SQLite thuần, không cần Docker
temporal server start-dev --db-file temporal-dev.db
```

File `temporal-dev.db` sẽ được tạo trong thư mục hiện tại.

### 2. Không có retry cho approval timeout

- Nếu không ai gửi signal, workflow treo đến 24h
- Timeout 24h cấu hình trong `condition()` deadline
- Không có built-in "auto-reject sau N phút"

### 3. Scan workflow chạy tuần tự

- Các keywords chạy tuần tự, không parallel
- Nếu `acquisition` pause chờ signal, `cyberattack` cũng phải đợi
- Đây là behavior cố ý để đơn giản, có thể nâng cấp lên child workflow
  cho parallel execution

### 4. Signal chỉ hoạt động qua CLI

- Chưa có web UI tích hợp để gửi signal
- Phải dùng CLI: `npm run temporal:signal <id> approved`
- Hoặc dùng Temporal UI → workflow detail → **Signal** button
  (cho phép gửi signal trực tiếp từ UI với custom payload)

### 5. Demo server state không bền vững với Temporal

- Temporal lưu workflow state trong SQLite (dev server)
- Demo server lưu cache riêng trong `runtime/runs.json`
- Nếu demo server restart, cache trong memory mất (vẫn đọc từ disk)
- Temporal workflow state không bị ảnh hưởng (server riêng)

### 6. Cron scheduling chưa tự động

- `scheduledNewsScanWorkflow` chưa có cron schedule attached
- Để chạy cron: tạo Schedule trong Temporal UI
  hoặc dùng `temporal schedule create` CLI
- Hiện tại: chạy thủ công qua `npm run temporal:start-scan`

### 7. Worker không tự reload

- Khi sửa `workflows.js` hoặc `activities.js`, cần restart worker
- `Ctrl+C` ở Terminal 3 và chạy lại `npm run temporal:worker`

## Practical caveats cho local testing

### 1. Temporal dev server lần đầu cần Docker image

Lần đầu `temporal server start-dev`:
- Tải Docker image `temporalio/dev-server:latest` (~500MB)
- Cần kết nối internet
- Cần Docker desktop hoặc Docker engine

Sau lần đầu, image được cache, khởi động nhanh.

Không có Docker? Dùng SQLite mode:
```bash
temporal server start-dev --db-file temporal-dev.db
```

### 2. Worker cần kết nối tới Temporal server

Nếu Temporal server chưa chạy, worker sẽ log lỗi kết nối:
```
[worker] Fatal error: ConnectionError: ...
```

Luôn đảm bảo Terminal 2 (Temporal dev server) đã chạy xong
trước khi khởi động worker.

### 3. Dừng Temporal dev server

`Ctrl+C` ở Terminal 2. SQLite database vẫn giữ nguyên state
(workflow history). Khi chạy lại, lịch sử vẫn còn.

### 4. Reset Temporal state

```bash
# Dừng Temporal dev server
# Xoá SQLite database (mặc định ở ~/.temporal/)
rm -rf ~/.temporal/db/
# Hoặc nếu dùng --db-file:
rm temporal-dev.db
# Sau đó chạy lại temporal server start-dev
```

### 5. Xem workflow result trong Temporal UI

Sau khi workflow complete:
1. Vào http://localhost:8233
2. Click **Workflows** tab
3. Click vào workflow ID
4. Tab **Summary** hiển thị status
5. Kết quả trả về hiện trong **Events** → event cuối cùng có type
   `WorkflowExecutionCompleted` → click để expand, xem `result` field
6. Hoặc dùng CLI: `npm run temporal:describe <workflowId>`

### 6. Temporal UI không hiển thị signal payload

Temporal UI hiển thị event `WorkflowExecutionSignaled` nhưng
**không hiển thị chi tiết signal payload** (chỉ hiện signal name).
Để xem payload:

- Worker log hiển thị signal data
- Dùng CLI: signal data in ra terminal khi gửi
- Dùng `temporal workflow show --workflow-id <id>` CLI command

### 7. Worker identity trong UI

Worker hiển thị với identity `news-monitor-worker` trong Temporal UI
→ **Workers** tab → bạn sẽ thấy worker name này.

### 8. Workflow ID không tự động unique

Nếu start workflow với workflowId đã tồn tại (và chưa closed),
Temporal sẽ reject với lỗi `WorkflowExecutionAlreadyStarted`.
Mỗi lần start cần runId khác hoặc dùng auto-generated runId (bỏ qua
tham số runId để client tự sinh).

### 9. Signal cho scheduled scan cần keyword

Khi gửi signal cho `scheduledNewsScanWorkflow`, bắt buộc phải
có `--keyword` để workflow biết signal dành cho keyword nào:

```bash
npm run temporal:signal <wfId> approved --keyword acquisition
npm run temporal:signal <wfId> rejected --keyword cyberattack
```

### 10. Nhiều workflow chạy đồng thời

Mỗi `npm run temporal:start markets` tạo một workflow riêng với
workflow ID khác nhau (dựa trên runId). Worker xử lý tất cả
trên cùng task queue `news-monitor`.

## Temporal Signal từ Temporal UI

Ngoài CLI, bạn có thể gửi signal trực tiếp từ Temporal UI:

1. Mở http://localhost:8233
2. Vào **Workflows** → click workflow ID
3. Click nút **Signal** (góc trên phải)
4. Nhập signal name: `approvalSignal`
5. Nhập payload JSON:
   ```json
   {"approved": true, "notes": "Looks good from UI"}
   ```
6. Click **Signal** — workflow tiếp tục

Đây là cách trực quan nhất để test approval flow nếu không muốn dùng CLI.
