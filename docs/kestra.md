# Kestra — Tích hợp Orchestration cho News Monitor Demo

## Mục tiêu file này

File này hướng dẫn cách tích hợp **Kestra** (nền tảng orchestration YAML-based,
 mã nguồn mở) vào project **News Monitor Approval Bot** hiện có. Mục đích là
chạy các tác vụ scrape tin tức có scheduling, idempotency, và human approval
gate — sử dụng Kestra flow primitives (HTTP Request, If, Pause, ForEach).

Khác với các orchestration tool khác trong repo này:

| So với | Điểm khác |
|--------|-----------|
| **Trigger.dev** | Kestra chạy local 100%, không cần cloud |
| **Prefect** | Kestra dùng YAML (không Python), chạy trong Docker |
| **Temporal** | Kestra dùng Docker compose, YAML-native, có sẵn UI, không cần code |

Kestra phù hợp với team muốn định nghĩa workflow bằng YAML thuần, không viết code.

## Các file đã tạo

| File | Vai trò |
|------|---------|
| `kestra/README.md` | Tổng quan ngắn, link sang file này |
| `kestra/flows/news_scrape_flow.yaml` | Flow cho một keyword (manual trigger) — idempotency + scrape + approval gate |
| `kestra/flows/news_scheduled_scan.yaml` | Flow scan định kỳ (cron `0 */6 * * *`) — ForEach qua 4 keywords |
| `docs/kestra.md` | File này — tài liệu hướng dẫn |

## Prerequisites

- **Node.js** >= 18
- **Playwright Chromium** — đã cài qua `npm run setup` hoặc `npx playwright install chromium`
- **npm packages** — đã cài qua `npm install` (express, playwright)
- **Docker Desktop** — Kestra chạy trong container, cần Docker
- **Kestra CLI** (optional) — để upload flow từ command line:

```bash
# macOS
brew install kestra-io/tap/kestra

# Linux — xem https://kestra.io/docs/installation
```

Kiểm tra:
```bash
kestra --version
```

## Các lệnh chạy từ trạng thái sạch

### 1. Cài đặt (nếu chưa làm)

```bash
npm install
npm run setup                         # cài Chromium cho Playwright
```

### 2. Chạy Kestra với Docker Compose

Kestra yêu cầu Docker. Có 2 cách:

**Cách A — Dùng docker-compose.yml từ Kestra (khuyến nghị):**

```bash
# Tải docker-compose.yml từ Kestra repo
curl -o docker-compose.yml https://raw.githubusercontent.com/kestra-io/kestra/develop/docker-compose.yml

# Khởi động
docker compose up -d
```

Lệnh này sẽ:
- Tải image Kestra (~1GB lần đầu, cache sau đó)
- Khởi động Kestra server tại http://localhost:8080
- Dùng H2 in-memory database (mặc định) — dữ liệu mất khi restart container
- Nếu muốn persistent database, dùng PostgreSQL (xem docker-compose.yml)

**Cách B — Dùng Docker run (nhanh hơn, không cần compose):**

```bash
docker run --pull=always -d \
  --name kestra \
  -p 8080:8080 \
  --network="host" \
  kestra/kestra:latest server local
```

> **Lưu ý:** `--network="host"` cho phép container gọi `host.docker.internal:3100`
> (demo server chạy trên host). Trên macOS, Docker Desktop hỗ trợ `host.docker.internal`
> mặc định.

### 3. Mở Kestra UI

Mở http://localhost:8080 trong browser.

Kestra UI có các tab chính:
- **Flows** — danh sách flow đã tạo
- **Executions** — lịch sử thực thi
- **Triggers** — cron schedule
- **Logs** — log hệ thống
- **Namespaces** — namespace management

> **Lưu ý — authentication trên Kestra OSS hiện đại**: Ở các phiên bản gần đây của Kestra OSS, lần đầu vào UI sẽ yêu cầu tạo tài khoản admin và đăng nhập (basic auth). Đây là behavior mặc định — bạn sẽ thấy màn hình setup để tạo credentials. Sau khi tạo, tất cả API và UI đều yêu cầu basic auth.
>
> Điều này có nghĩa: Kestra OSS **không có RBAC** — chỉ có basic auth (admin user). Real RBAC, audit logs, advanced secrets backends là tính năng Enterprise.

### 4. Upload flows vào Kestra

**Cách 1 — Qua UI (dễ nhất):**

1. Vào **Flows** tab → **Create** (góc trên phải)
2. Copy nội dung `kestra/flows/news_scrape_flow.yaml` paste vào editor
3. Click **Create** (hoặc **Save**)
4. Làm tương tự với `kestra/flows/news_scheduled_scan.yaml`

**Cách 2 — Qua Kestra CLI (nếu đã cài):**

```bash
kestra flow create news_scrape_flow.yaml
kestra flow create news_scheduled_scan.yaml
```

**Cách 3 — Qua API:**

```bash
curl -X POST http://localhost:8080/api/v1/flows \
  -H "Content-Type: application/yaml" \
  --data-binary @kestra/flows/news_scrape_flow.yaml

curl -X POST http://localhost:8080/api/v1/flows \
  -H "Content-Type: application/yaml" \
  --data-binary @kestra/flows/news_scheduled_scan.yaml
```

### 5. Chạy 2 terminal

#### Terminal 1 — Demo Server

```bash
npm start
# => http://localhost:3100
```

#### Terminal 2 — Kestra (đã chạy trong Docker ở bước 2)

## Expected URLs

| URL | Mục đích |
|-----|----------|
| http://localhost:3100 | Demo server (Express + Playwright) |
| http://localhost:3100/news | Trang danh sách article |
| http://localhost:3100/api/scrape | POST endpoint scrape |
| http://localhost:3100/api/runs/:runId | GET endpoint kiểm tra cache |
| http://localhost:8080 | **Kestra UI** — dashboard |
| http://localhost:8080/ui/flows | Danh sách flows |
| http://localhost:8080/ui/executions | Lịch sử thực thi |

## Các bước trong Kestra UI

### Lần đầu vào Kestra UI

1. Mở http://localhost:8080
2. Sau khi upload flows, vào **Flows** tab
3. Bạn sẽ thấy 2 flows:
   - `news_monitor.news_scrape_flow`
   - `news_monitor.news_scheduled_scan`
4. Click vào flow để xem chi tiết (YAML, triggers, executions)

### Trigger manual run

1. Vào **Flows** tab → click `news_monitor.news_scrape_flow`
2. Click nút **Execute** (góc trên phải)
3. Trong hộp thoại, nhập inputs:
   - `keyword`: `markets`
   - `runId`: `test-kestra-001` (optional)
4. Click **Execute** — execution được tạo, bạn sẽ thấy real-time log
5. Click **Executions** tab → click vào execution ID để xem chi tiết

### Xem kết quả

Kết quả flow hiển thị trong execution detail:
- Tab **Logs** — log từng task
- Tab **Logs** — kết quả trả về của mỗi task (bao gồm kết quả scrape)
- Tab **Timeline** — thời gian thực thi
- Tab **Tree** — cây tasks với trạng thái từng task

## Cách test các edge case

### 1. Test manual run (news_scrape_flow)

Sau khi demo server đang chạy và Kestra đã upload flow:

| Test case | Keyword | runId | Expected behavior |
|-----------|---------|-------|-------------------|
| Happy path | `markets` | `test-kestra-001` | `auto_approved` |
| Approval + fallback | `acquisition` | `test-kestra-002` | Pause chờ Resume |
| Fail-once + approval | `cyberattack` | `test-kestra-003` | Pause chờ Resume |
| Slow page | `inflation` | `test-kestra-004` | `auto_approved` |
| Not found | `volcano` | `test-kestra-005` | `not_needed` (not_found) |
| Idempotency | `markets` | `test-kestra-001` (lại) | `cached` |

**Cách test từng case:**

```bash
# Mỗi lần test, vào Kestra UI:
# 1. Flows → news_scrape_flow → Execute
# 2. Nhập keyword và runId
# 3. Nhấn Execute
```

Hoặc dùng API:
```bash
# Start execution via API
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "news_monitor",
    "flowId": "news_scrape_flow",
    "inputs": {
      "keyword": "markets",
      "runId": "test-api-001"
    }
  }'
```

Reset demo server state giữa các lần test:
```bash
curl -X POST http://localhost:3100/api/admin/reset
```

### 2. Test human approval (Pause/Resume)

Đây là tính năng chính — flow pause chờ Resume từ Kestra UI.

**Steps:**

1. Vào **Flows** tab → `news_monitor.news_scrape_flow` → **Execute**
2. Nhập `keyword`: `acquisition`, `runId`: `test-approval-001`
3. Click **Execute**

4. Flow sẽ scrape article, phát hiện `needsApproval`, và chạm tới task `pause_approval`
5. Trong execution detail, bạn sẽ thấy:
   - Task `pause_approval` đang ở trạng thái **PAUSED**
   - Flow execution hiển thị **Paused** status
   - Log hiện thông tin article cần duyệt

6. Để approve:
   - Click vào task `pause_approval` (đang PAUSED)
   - Click nút **Resume**
   - Ở Kestra hiện đại, `Pause` hỗ trợ **`onResume` inputs**: bạn có thể cấu hình flow để thu thập structured values khi resume (ví dụ: approve/reject boolean + notes). Flow tiếp tục, task `return_approved` chạy
   - Kết quả: `{ ..., approval: "approved" }`

7. Để reject (cách khác):
   - Click **Kill** ở execution level
   - Execution kết thúc với status **KILLED**
   - Không có return payload — đây là limitation của Kestra Pause nếu không dùng `onResume` inputs

**Test với `cyberattack` (fail-once + approval):**

1. Execute flow với `keyword: cyberattack`, `runId: test-approval-002`
2. Demo server tự động retry fail-once internally
3. Sau scrape thành công, flow pause vì `needsApproval: true`
4. Resume từ UI để approve

### 3. Test scheduled scan

Scheduled scan chạy qua **6 tiếng** một lần (cron `0 */6 * * *`).
Để test nhanh, trigger thủ công:

**Cách 1 — Kestra UI:**

1. Vào **Flows** tab → `news_monitor.news_scheduled_scan`
2. Click **Execute** (không cần inputs)
3. Flow sẽ iterate qua: `markets`, `acquisition`, `cyberattack`, `inflation`
4. Với mỗi keyword: kiểm tra cache → scrape → pause nếu cần approval
5. Sau tất cả, log summary

**Cách 2 — API:**

```bash
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "news_monitor",
    "flowId": "news_scheduled_scan"
  }'
```

**Lưu ý về scan:** Flow chạy tuần tự. Khi gặp `acquisition`, nó pause chờ Resume.
Sau khi resume, nó tiếp tục với `cyberattack` (cũng pause). Cần resume 2 lần.

### 4. Test tất cả edge cases

Chạy lần lượt các executions sau (reset state giữa mỗi lần nếu cần):

```bash
# Reset state
curl -X POST http://localhost:3100/api/admin/reset

# 1. Happy path
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{"namespace":"news_monitor","flowId":"news_scrape_flow","inputs":{"keyword":"markets","runId":"test-all-001"}}'

# 2. Approval + fallback
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{"namespace":"news_monitor","flowId":"news_scrape_flow","inputs":{"keyword":"acquisition","runId":"test-all-002"}}'
# → Pause, Resume trong UI

# 3. Fail-once + approval
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{"namespace":"news_monitor","flowId":"news_scrape_flow","inputs":{"keyword":"cyberattack","runId":"test-all-003"}}'
# → Pause, Resume trong UI

# 4. Slow page
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{"namespace":"news_monitor","flowId":"news_scrape_flow","inputs":{"keyword":"inflation","runId":"test-all-004"}}'

# 5. Not found
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{"namespace":"news_monitor","flowId":"news_scrape_flow","inputs":{"keyword":"volcano","runId":"test-all-005"}}'

# 6. Idempotency
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{"namespace":"news_monitor","flowId":"news_scrape_flow","inputs":{"keyword":"markets","runId":"test-all-001"}}'
# → cached
```

## Cấu trúc code Kestra

### Luồng xử lý — news_scrape_flow

```
news_scrape_flow(keyword, runId?, timeoutMs?)
  │
  ├─ 1. check_run(runId)  ─── [HTTP GET /api/runs/:runId]
  │      │
  │      └─ nếu cached ─→ log_cached { approval: "cached" }
  │      └─ else ─→ continues
  │
  ├─ 2. scrape(keyword, runId) ─── [HTTP POST /api/scrape]
  │      │
  │      ├─ error / not_found ─→ log_terminal { approval: "not_needed" }
  │      └─ success ─→ continues
  │
  ├─ 3. needsApproval? ─── yes ─→ pause_approval [Pause]
  │      │                         └─ Resume ─→ log_approved { approval: "approved" }
  │      │
  │      └─ no ─→ log_auto_approved { approval: "auto_approved" }

### Luồng xử lý — news_scheduled_scan

```
news_scheduled_scan()
  │
  └─ ForEach ["markets", "acquisition", "cyberattack", "inflation"]
       │
       ├─ check_run ─── cached? ─→ log_cached
       │
       └─ scrape
            ├─ error/not_found ─→ log_terminal
            ├─ needsApproval ─→ pause_approval → Resume → log_approved
            └─ success ─→ log_auto_approved
```
news_scrape_flow(keyword, runId?, timeoutMs?)
  │
  ├─ 1. check_run(runId)  ─── [HTTP GET /api/runs/:runId]
  │      │
  │      └─ cached? ─→ return_cached { approval: "cached" }
  │
  ├─ 2. scrape(keyword, runId) ─── [HTTP POST /api/scrape]
  │      │
  │      ├─ error / not_found ─→ return_terminal { approval: "not_needed" }
  │      └─ success ─→ continues
  │
  ├─ 3. needsApproval? ─── yes ─→ pause_approval [Pause]
  │      │                         └─ Resume ─→ return_approved { approval: "approved" }
  │      │
  │      └─ no ─→ return_auto_approved { approval: "auto_approved" }
```

### Luồng xử lý — news_scheduled_scan

```
news_scheduled_scan()
  │
  └─ ForEach ["markets", "acquisition", "cyberattack", "inflation"]
       │
       ├─ check_run ─── cached? ─→ log_cached
       │
       └─ scrape
            ├─ error/not_found ─→ log_terminal
            ├─ needsApproval ─→ pause_approval → Resume → log_approved
            └─ success ─→ log_auto_approved
```

## So sánh: Kestra vs Temporal vs Prefect vs Trigger.dev (local testing)

| Tiêu chí | Kestra | Temporal | Prefect | Trigger.dev v4 |
|----------|--------|----------|---------|----------------|
| Ngôn ngữ định nghĩa | **YAML** | JavaScript | Python | JavaScript |
| Chạy local 100% | ✅ (Docker) | ✅ (brew) | ✅ (pip) | ❌ (cần cloud) |
| UI | http://localhost:8080 | http://localhost:8233 | http://localhost:4200 | https://cloud.trigger.dev |
| Human approval | Pause/Resume UI | Signal + condition | pause_flow_run() | wait.createToken() |
| Setup | Docker compose | brew + npm | pip install | npm + tài khoản cloud |
| Retry | Cấu hình trên task | Activity retry policy | @task(retries=N) | Task retry config |
| Cron trigger | ✅ Schedule trigger | ✅ Schedule SDK | ✅ Cron decorator | ✅ Cron field |
| Iteration | ✅ ForEach | ❌ (phải code loop) | ✅ for loop | ❌ (phải code loop) |
| JSON output | ✅ Log task + Pebble | ✅ Return object | ✅ Return dict | ✅ Return object |

## Những gì đã implement

- [x] Single keyword flow với idempotency check (HTTP GET + If)
- [x] Scrape via HTTP POST + xử lý kết quả JSON
- [x] Human approval gate via Pause/Resume UI
- [x] Scheduled scan flow với ForEach + cron trigger
- [x] Return payloads: `cached`, `not_needed`, `auto_approved`, `approved`
- [x] 5 edge cases: markets, acquisition, cyberattack, inflation, volcano
- [x] `host.docker.internal:3100` cho macOS Docker usage
- [x] Log rõ ràng cho từng bước

## Những gì chưa implement / hạn chế

### 1. Kestra cần Docker

- **Không thể chạy Kestra standalone không Docker** (trừ khi dùng Java JAR)
- Cần Docker Desktop (macOS) hoặc Docker Engine (Linux)
- Lần đầu tải image ~1GB
- Dùng `docker compose up -d` với [docker-compose.yml](https://raw.githubusercontent.com/kestra-io/kestra/develop/docker-compose.yml) chính thức

### 2. Pause/Resume không hỗ trợ "rejected" payload

- Khi pause, user click Resume = approved
- Không có cách truyền "rejected" data khi resume
- Để reject: user kill execution (không có return payload)
- Không có signal với payload như Temporal

### 3. Demo server chạy trên host, Kestra chạy trong container

- YAML dùng `host.docker.internal:3100` (macOS)
- Trên Linux: cần `--add-host host.docker.internal:host-gateway` hoặc dùng
  network host mode
- Trên Windows: `host.docker.internal` hoạt động mặc định

### 4. Mỗi trigger cần upload flow riêng

- Flow chỉ trigger khi đã upload vào Kestra server
- Nếu sửa YAML, cần upload lại (UI: Save; CLI/API: create với `--upsert`)

### 5. ForEach không aggregate outputs

- Mỗi iteration log riêng, không có summary object ở cuối
- Các outputs của iteration không tự động gộp
- Task `log_summary` chỉ log message đơn giản

### 6. Cron trigger chỉ chạy khi Kestra server online

- Nếu Kestra container không chạy, cron schedule không được đánh thức
- Sau khi start lại Kestra, schedule tự động bắt lại

### 7. Kestra 1.0+ có AI features
- Từ 1.0+, Kestra có **AI Copilot** (hỗ trợ tạo flow bằng AI), **AI Agents** (`io.kestra.plugin.ai.agent.AIAgent`), plugin-ai ecosystem, MCP server & agent skills.
- Nếu bạn quan tâm đến AI-assisted orchestration, Kestra không còn "không có AI" — đã có dedicated AI capabilities.

### 8. Không có retry policy trên HTTP tasks

- Mặc định, `Request` task fail ngay nếu HTTP error
- Có thể cấu hình `options.allowFailed: true` + `retry` property để retry
- Hiện tại flows dùng `options.allowFailed: true` để tránh fail nhanh

## Practical caveats cho local testing

### 1. `host.docker.internal` chỉ hoạt động trong Docker Desktop

Trên macOS và Windows, `host.docker.internal` tự động resolve đến host machine.
Trên Linux, cần thêm flag:

```bash
docker run --add-host host.docker.internal:host-gateway ...
```

### 2. Demo server phải chạy trước khi Kestra gọi

Nếu demo server chưa chạy, Kestra HTTP tasks sẽ fail với connection refused.
Luôn đảm bảo Terminal 1 (demo server) đã chạy xong.

### 3. Xem output trong Kestra UI

Sau khi execution hoàn tất:
1. Vào **Executions** tab
2. Click vào execution ID
3. Tab **Logs** hiển thị kết quả từng task (Log tasks ghi kết quả dưới dạng JSON)
4. Tab **Logs** hiển thị từng bước

### 4. Dừng Kestra

```bash
docker compose down
# Hoặc nếu dùng docker run:
docker stop kestra && docker rm kestra
```

### 5. Reset Kestra state

Xoá container và volume (nếu dùng docker-compose với volume):

```bash
docker compose down -v
docker compose up -d
```

### 6. Chỉnh sửa flow

Khi sửa YAML, upload lại qua UI:
1. Vào **Flows** tab
2. Click vào flow name
3. Click **Edit** (góc trên phải)
4. Paste nội dung mới
5. Click **Save** (ghi đè flow cũ)

Hoặc CLI:
```bash
kestra flow create flows/news_scrape_flow.yaml --upsert
```

### 7. Mặc định Kestra dùng H2 in-memory database

Khi `docker compose down`, tất cả flows và executions biến mất.
Để lưu persistent, dùng profile PostgreSQL:

```bash
# Docker compose với PostgreSQL
curl -o docker-compose.yml https://raw.githubusercontent.com/kestra-io/kestra/develop/docker-compose.yml
# Sửa docker-compose.yml để dùng PostgreSQL thay H2 (xem comments trong file)
docker compose up -d
```

### 8. `json() | merge() | json()` trong Pebble

Các flow dùng Pebble template để thêm `approval` key vào JSON output:

```
{{ json(outputs.scrape.body) | merge({'approval': 'auto_approved'}) | json }}
```

Cách này parse response body thành map, merge thêm key approval, và convert
lại thành JSON string. Nếu response body không phải JSON hợp lệ, task sẽ fail.

### 9. Kết quả trả về của Log task

Kết quả flow hiển thị trong tab **Logs** của execution — mỗi Log task ghi
một dòng với JSON string bao gồm tất cả scrape fields + `approval` key.

### 10. Idempotency check dùng `options.allowFailed`

Task `check_run` luôn chạy (dù có runId hay không). Nếu có runId nhưng
server trả về 404, `options.allowFailed: true` ngăn task fail.
Task `if_cached` kiểm tra HTTP code 200 để quyết định đã cached hay chưa.
