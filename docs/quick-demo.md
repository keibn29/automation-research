# Quick Demo — News Monitor Approval Bot

Tài liệu này hợp nhất hướng dẫn chạy demo nhanh và cấu hình từng công cụ orchestration, viết lại theo cấu trúc thực hành: **chạy được ngay, quan sát được UI, so sánh được ngay**.

Người đọc mục tiêu: đã từng đọc các tài liệu cũ và thấy rối. Tài liệu này đi thẳng vào hành động.

---

## 1. Mục tiêu

Xây dựng một workflow **News Monitor Approval Bot** có khả năng:

1. Nhận `keyword` và `runId` (tuỳ chọn)
2. Dùng Playwright để scrape một trang tin tức giả lập (chạy local)
3. Trích xuất tiêu đề, tác giả, ngày đăng, tóm tắt và URL của bài báo phù hợp
4. Đánh dấu các bài báo chứa từ khoá nhạy cảm (`breaking`, `acquisition`) cần phê duyệt thủ công
5. Lưu kết quả một cách idempotent theo `runId`
6. Xử lý các edge case: lỗi server fail-once, trang tải chậm, fallback selector, không tìm thấy kết quả

Mục tiêu của **bạn** khi đọc tài liệu này: so sánh 6 công cụ orchestration (Temporal, Prefect, Conductor, Restate, Trigger.dev, Kestra) về:

- Mức độ dễ setup
- Chất lượng UI/dashboard
- Cơ chế human review (approval)
- Retry và xử lý lỗi
- Scheduling
- Idempotency
- Kiểm soát concurrency

---

## 2. Hiện trạng repo này

**Quan trọng — đọc kỹ trước khi bắt đầu:**

| Mục | Trạng thái |
|------|-----------|
| **Demo server chung** (Express + Playwright) | ✅ **Đã có, chạy được ngay** — server tại `http://localhost:3100` vừa là trang tin tức giả lập vừa là API scrape |
| **Workflow cho Temporal** | ❌ Chưa implement |
| **Workflow cho Prefect** | ❌ Chưa implement |
| **Workflow cho Orkes/Netflix Conductor** | ❌ Chưa implement |
| **Workflow cho Restate** | ❌ Chưa implement |
| **Workflow cho Trigger.dev** | ❌ Chưa implement |
| **Workflow cho Kestra** | ❌ Chưa implement |

**Ý nghĩa:** Bạn có thể **mở UI của từng tool và so sánh giao diện/UX ngay lập tức**, nhưng chưa thể chạy full workflow end-to-end trên mỗi tool nếu không tự implement thêm.

Tài liệu này hướng dẫn bạn:

1. Chạy demo server chung
2. Mở UI/dashboard của từng tool
3. Biết các thao tác UI đầu tiên để tạo workspace/project/workflow
4. Biết cần implement gì để chạy thật

---

## 3. Chạy demo server chung

Server này là trung tâm của demo: nó vừa là **trang tin tức giả lập**, vừa là **API scrape dùng Playwright**, vừa có endpoint **idempotency** và **admin reset**.

```bash
# 1. Vào thư mục dự án
cd /Users/kei/Projects/docs-research

# 2. Cài dependencies
npm install

# 3. Cài Chromium cho Playwright
npm run setup

# 4. Khởi động server
npm start
```

Server chạy tại: **http://localhost:3100**

Kiểm tra nhanh:

```bash
# Trang tin tức giả lập
open http://localhost:3100

# API health check
curl http://localhost:3100/api/health
```

Kết quả mong đợi:

```
{"status":"ok","uptime":123}
```

**Lưu ý:** Không cần mock site riêng — server tự phục vụ cả trang tin tức và API.

---

## 4. Test nhanh demo server bằng curl

Dùng các lệnh sau để kiểm tra server hoạt động đúng trước khi kết nối với tool orchestration:

```bash
# 1. Bình thường — scrape thành công, không cần phê duyệt
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId":"test-normal","keyword":"markets"}'

# 2. Cần phê duyệt — needsApproval: true
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId":"test-approval","keyword":"acquisition"}'

# 3. Fail-once retry — lần đầu trả 500, lần sau thành công
# Chạy lần 1 (sẽ fail):
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId":"test-retry","keyword":"cyberattack"}'
# Reset để chạy lại:
curl -X POST http://localhost:3100/api/admin/reset
# Chạy lần 2 (sẽ thành công):
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId":"test-retry","keyword":"cyberattack"}'

# 4. Trang chậm — cần timeout dài (~7s)
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId":"test-slow","keyword":"inflation","timeoutMs":15000}'

# 5. Không tìm thấy — status: "not_found"
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId":"test-notfound","keyword":"volcano"}'

# 6. Idempotency — gửi lại cùng runId, trả kết quả cached
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId":"test-normal","keyword":"markets"}'

# 7. Reset toàn bộ admin (xoá cache, reset fail-once counter)
curl -X POST http://localhost:3100/api/admin/reset
```

---

## 5. Workflow chung cần tái hiện trên mọi tool

Đây là luồng xử lý mà mỗi tool orchestration phải implement:

```
          ┌─────────────────────────────────┐
          │  Trigger (thủ công / lịch)       │
          │  Input: { keyword, runId }       │
          └────────────┬────────────────────┘
                       │
                       ▼
          ┌─────────────────────────────────┐
          │  Bước 1: Kiểm tra Idempotency    │
          │  GET /api/runs/:runId            │
          │  Nếu có → bỏ qua, trả kết quả     │
          └────────────┬────────────────────┘
                       │
                       ▼
          ┌─────────────────────────────────┐
          │  Bước 2: Scrape qua Playwright  │
          │  POST /api/scrape               │
          │  { runId, keyword }             │
          └────────────┬────────────────────┘
                       │
                       ▼
          ┌─────────────────────────────────┐
          │  Bước 3: Cổng Human Review       │
          │  Nếu needsApproval === true      │
          │  → tạm dừng, chờ duyệt/từ chối  │
          └────────────┬────────────────────┘
                       │
                       ▼
          ┌─────────────────────────────────┐
          │  Bước 4: Hậu xử lý              │
          │  Lưu kết quả, ghi log, ...       │
          └─────────────────────────────────┘
```

**Các pattern quan trọng cần lưu ý khi implement trên từng tool:**

| Pattern | Cách thực hiện |
|---------|---------------|
| **Idempotency** | Kiểm tra `GET /api/runs/:runId` trước khi scrape, hoặc dùng cơ chế dedup native của tool |
| **Human review** | Phát hiện `needsApproval: true` trong response scrape, tạm dừng workflow, chờ approve/reject |
| **Retry** | Khi gặp 5xx từ scrape API, retry với exponential backoff |
| **Timeout** | Trang chậm ~7s — cấu hình timeout task/phù hợp |
| **Concurrency** | Giới hạn tối đa 2 scrape đồng thời khi chạy batch 5 từ khoá |
| **Scheduling** | Lên lịch chạy định kỳ (ví dụ mỗi 15 phút) |
| **Resilience** | Workflow sống sót khi worker bị crash/restart |

---

## 6. Edge cases cần test

Với mỗi tool orchestration, hãy kiểm tra các trường hợp sau:

| Edge Case | Cách kích hoạt | Kết quả mong đợi |
|-----------|---------------|-------------------|
| **Bình thường** | `keyword: "markets"` | Scrape thành công, không cần phê duyệt |
| **Cần phê duyệt** | `keyword: "acquisition"` | Scrape thành công, `needsApproval: true`, workflow tạm dừng |
| **Fail-once retry** | `keyword: "cyberattack"` | Lần đầu trả 500, scraper retry và thành công |
| **Trang chậm** | `keyword: "inflation"` | Trang chi tiết mất ~7s; workflow phải tôn trọng timeout |
| **Không tìm thấy** | `keyword: "volcano"` | Scraper trả về `status: "not_found"` |
| **Idempotency** | Cùng `runId` hai lần | Lần hai trả kết quả cached, không chạy Playwright |
| **Trigger trùng** | Cùng `runId` từ lịch + thủ công | Lần chạy sau bị bỏ qua hoàn toàn |
| **Concurrency** | Gửi 5 từ khoá cùng lúc | Giới hạn tối đa 2 scrape đồng thời |

---

## 7. Cách chạy từng tool local + mở UI/dashboard

Phần này hướng dẫn **chạy local** và **mở dashboard** cho mỗi tool. Các lệnh được tối giản để bạn có thể thấy UI trong vòng 1-2 phút.

### 7.1 Temporal

```bash
# Chạy Temporal server local (cần Docker)
docker compose -f docker-compose-temporal.yml up -d

# Kiểm tra server
curl http://localhost:7233
```

- **Temporal Web UI:** http://localhost:8233
- **Mô tả:** Giao diện web đơn giản, hiển thị workflow executions, lịch sử từng bước.
- **Caveats:**
  - Không có giao diện approval/human task native — phải tự xây hoặc dùng Signal API qua `curl`
  - Retry policy cấu hình trong code (activity options), không trong UI
  - Web UI hiển thị lịch sử thực thi nhưng không có artifact cấp bước (screenshot)

**Code cần viết để chạy workflow thật:**
- `workflows/news-monitor.js` — Định nghĩa workflow
- `activities/scrape.js` — Activity gọi API scrape
- `worker.js` — Temporal worker

### 7.2 Prefect

```bash
# Cài đặt
pip install prefect

# Khởi động Prefect server
prefect server start

# (Mở terminal khác) Chạy worker
prefect worker start --pool news-scrape-pool
```

- **Prefect Server UI:** http://localhost:4200
- **Mô tả:** Giao diện Python-native, observability xuất sắc, có pause/resume cho human review.
- **Caveats:**
  - Prefect là Python-native. Server demo là Node.js — gọi qua HTTP (hoàn toàn bình thường)
  - Pause/resume là tính năng trả phí trên Cloud nhưng dùng được trên local OSS server
  - Screenshot phải lưu bên ngoài Prefect; response API trả về đường dẫn

**Code cần viết để chạy workflow thật:**
```python
# news_monitor_flow.py
from prefect import flow, task
from prefect.flow_runs import pause_flow_run

@task
def check_idempotency(run_id): ...

@task
def scrape_article(keyword, run_id): ...

@task
def human_review_gate(needs_approval): ...

@flow
def news_monitor(keyword, run_id): ...
```

### 7.3 Orkes Conductor / Netflix Conductor

```bash
# Orkes Conductor (Docker Compose — nặng nhất, cần ~4GB RAM)
git clone https://github.com/orkes-io/orkes-conductor-oss
cd orkes-conductor-oss/docker
docker compose up -d

# Netflix Conductor (Docker Compose)
git clone https://github.com/Netflix/conductor
cd conductor/docker
docker compose up -d
```

- **Orkes Conductor UI:** http://localhost:5000
- **Netflix Conductor UI:** http://localhost:5000
- **Mô tả:** Giao diện doanh nghiệp, có HUMAN task native cho phê duyệt.
- **Caveats:**
  - **Nặng nhất trong tất cả các tool** — cần Docker, Elasticsearch, MySQL, nhiều service
  - Workflow definition bằng JSON (có thể phức tạp với người mới)
  - Orkes Cloud có gói miễn phí giới hạn; self-hosted OSS từ Netflix đầy đủ nhưng setup nặng

**Code cần viết:** Workflow definition JSON (trong UI hoặc tệp local), không cần worker nếu dùng HTTP + HUMAN task có sẵn.

### 7.4 Restate

```bash
# Chạy Restate server (cần Docker)
docker run --name restate-server -d \
  -p 9070:9070 -p 9080:9080 \
  docker.restate.dev/restate:latest

# Đăng ký service (sau khi viết code)
restate deployment register localhost:9080

# Invoke thủ công
restate invoker invoke NewsMonitorService/run \
  '{"keyword":"markets","runId":"restate-demo-001"}'
```

- **Restate Admin UI:** http://localhost:9070
- **Mô tả:** Admin UI tối thiểu (chỉ đọc — xem deployments, invocations, state). Không có UI thiết kế workflow.
- **Caveats:**
  - Không có scheduler tích hợp — cần cron bên ngoài
  - Approval dùng pattern Awakeable (callback), không có giao diện phê duyệt native
  - Đường cong học tập cao — durable execution (journaling, replay) khác workflow engine truyền thống
  - UI nghèo nàn nhất so với Prefect, Kestra, Temporal

**Code cần viết để chạy workflow thật:**
```typescript
// news-monitor-service.ts
import * as restate from "@restatedev/restate-sdk";

const service = restate.service({
  name: "NewsMonitorService",
  handlers: {
    run: async (ctx, { keyword, runId }) => {
      // Gọi API scrape, xử lý Awakeable, ...
    }
  }
});
```

### 7.5 Trigger.dev

```bash
# Tạo project
npx create-triggerdev my-news-monitor
cd my-news-monitor

# Chạy local dev
npx trigger.dev dev
```

- **Trigger.dev Dashboard:** http://localhost:3030 (hoặc cloud dashboard)
- **Mô tả:** Nền tảng TypeScript-native, dashboard hiển thị run history, log từng task.
- **Caveats:**
  - Cloud có gói miễn phí giới hạn số run và concurrency
  - Self-hosting cần Docker + PostgreSQL
  - Approval dùng pattern wait-for-approval (webhook token), không có dashboard "hàng đợi phê duyệt" phong phú
  - Idempotency không tích hợp sẵn theo `runId`

**Code cần viết để chạy workflow thật:**
```typescript
// jobs/news-monitor.ts
import { client } from "../trigger";
import { eventTrigger } from "@trigger.dev/sdk";

client.defineJob({
  id: "news-monitor",
  name: "News Monitor",
  version: "0.1.0",
  trigger: eventTrigger({ name: "news.scrape" }),
  run: async (payload, io) => {
    // fetch, check approval, etc.
  }
});
```

### 7.6 Kestra

```bash
# Chạy Kestra local (cần Docker, ~2GB RAM)
docker compose up -d
# Hoặc dùng file docker-compose riêng:
# https://kestra.io/docs/installation/docker
```

- **Kestra UI:** http://localhost:8080
- **Mô tả:** UI xuất sắc, workflow định nghĩa bằng YAML, có pause task và retry tích hợp.
- **Caveats:**
  - Playwright không phải task tích hợp — gọi HTTP endpoint của Express server local
  - Pause task đơn giản: tạm dừng cho đến khi click Resume. Không có rẽ nhánh approve/reject nếu không thêm task bổ sung
  - Cú pháp YAML cho rẽ nhánh có điều kiện kém linh hoạt hơn workflow dạng code (Temporal, Prefect, Trigger.dev)

**Code cần viết:** Toàn bộ workflow trong YAML — không cần code tuỳ chỉnh nếu dùng HTTP task có sẵn.

---

## 8. Tôi cần thao tác gì trên website/UI của từng tool?

### 8.1 Temporal Web UI (http://localhost:8233)

| Thao tác | Cách làm |
|----------|---------|
| **Start workflow thủ công** | Click **Start Workflow** → nhập Workflow Type: `newsMonitorWorkflow`, Task Queue: `news-monitor-queue`, Input: `{"keyword":"markets","runId":"temporal-demo-001"}` |
| **Xem lịch sử execution** | Vào tab **Workflows** → click vào một workflow ID → xem từng bước (activity) với input/output |
| **Tạo schedule** | Vào **Schedules** (thanh trái) → **Create Schedule** → Workflow Type: `newsMonitorWorkflow`, Interval: every 15 minutes, Input: `{"keyword":"markets"}` |
| **Gửi Signal (approval)** | Vào workflow detail → **Signals** → gửi payload `{"approved": true}` — không có giao diện approval task native |

### 8.2 Prefect Server UI (http://localhost:4200)

| Thao tác | Cách làm |
|----------|---------|
| **Tạo Work Pool** | Vào **Work Pools** → **Create Pool** → tên `news-scrape-pool`, Type: `process` |
| **Tạo Deployment** | Vào **Deployments** → **Create Deployment** → chọn flow `news-monitor`, chọn work pool |
| **Run flow thủ công** | Click **Run** → nhập parameters: `{"keyword":"markets","runId":"prefect-demo-001"}` |
| **Xem run history** | Vào **Flow Runs** → click vào một run → xem từng task với log |
| **Approval (Resume)** | Khi flow bị paused, UI hiển thị run bị paused → click **Resume** với input `{"approved": true}` — có giao diện native |
| **Tạo Schedule** | Trên deployment detail → **Schedule** → Interval: every 15 minutes, hoặc cron `*/15 * * * *` |

### 8.3 Orkes Conductor UI (http://localhost:5000)

| Thao tác | Cách làm |
|----------|---------|
| **Tạo workflow definition** | Vào **Definitions** → **Create Workflow** → tên `news_monitor_workflow`, version 1 |
| **Thêm HTTP task** | Thêm task → type `HTTP` → Method: POST, URL: `http://localhost:3100/api/scrape`, Body: `{"runId":"${workflow.input.runId}","keyword":"${workflow.input.keyword}"}` |
| **Thêm HUMAN task (approval)** | Thêm task → type `HUMAN` → gán user/group, nhập template hiển thị bài báo |
| **Bật idempotency** | Trong workflow definition → set `"idempotencyKey"` = `${workflow.input.runId}` |
| **Tạo schedule** | Vào **Scheduler** → **Create Schedule** → chọn workflow, cron `0 */15 * * * *` |
| **Xem execution** | Vào **Executions** → click ID → xem từng task với input/output |

### 8.4 Restate Admin UI (http://localhost:9070)

| Thao tác | Cách làm |
|----------|---------|
| **Xem deployments** | Trang chủ UI hiển thị danh sách deployments đã đăng ký |
| **Invoke service** | Vào tab **Invoke** → chọn service `NewsMonitorService`, method `run`, nhập JSON |
| **Xem invocations** | Vào tab **Invocations** → xem lịch sử, trạng thái, input/output |
| **Xem state** | Vào tab **State** → xem durable state của service |
| **Gửi Awakeable signal** | Dùng `curl` (không có UI): `curl -X POST http://localhost:9070/restate/awakeable/{id} -d '{"approved":true}'` |

**Lưu ý:** Restate không có UI thiết kế workflow. Admin UI chỉ đọc.

### 8.5 Trigger.dev Dashboard (http://localhost:3030)

| Thao tác | Cách làm |
|----------|---------|
| **Tạo project** | Dashboard → **Create Project** → đặt tên `news-monitor` |
| **Trigger job thủ công** | Vào tab **Test** → chọn job `news-monitor` → nhập input JSON |
| **Tạo Schedule** | Vào tab **Triggers** → **Create Schedule** → cron `*/15 * * * *` |
| **Approval (run bị paused)** | Vào **Runs** → click run bị paused → click **Approve** hoặc **Reject** |
| **Xem run history** | Vào **Runs** → click một run → xem log từng task, thời gian chạy |

### 8.6 Kestra UI (http://localhost:8080)

| Thao tác | Cách làm |
|----------|---------|
| **Tạo flow mới** | Vào **Flows** → **Create** → dán YAML workflow |
| **Định nghĩa inputs** | Trong YAML: `inputs: - name: runId type: STRING - name: keyword type: STRING` |
| **Execute flow** | Click **Execute** → điền input fields → click **Start** |
| **Pause/Resume** | Khi chạm task `Pause`, execution bị paused → click **Resume** để tiếp tục |
| **Tạo Schedule** | Thêm vào YAML: `triggers: - id: every_15min type: Schedule cron: "*/15 * * * *"` |
| **Cấu hình retry** | Thêm block `retry` vào task YAML: `maxAttempt: 3, type: exponential` |
| **Xem execution** | Vào **Executions** → click ID → xem từng task với input/output, log |

---

## 9. Tool nào dễ cảm nhận nhất nếu chỉ muốn so sánh nhanh?

Nếu bạn chỉ có **30 phút** và muốn nhanh chóng cảm nhận sự khác biệt giữa các tool, đây là thứ tự khuyến nghị:

### Dễ nhất (chạy + thấy UI trong < 2 phút)

| Tool | Thời gian thấy UI | Lý do |
|------|------------------|-------|
| **Temporal** | ~1 phút | Docker Compose, Web UI đơn giản, dễ start workflow |
| **Kestra** | ~1 phút | Docker Compose, UI xuất sắc, YAML editor trong trình duyệt |

### Trung bình (vài phút setup + cần viết code)

| Tool | Thời gian thấy UI | Lý do |
|------|------------------|-------|
| **Prefect** | ~5 phút | Cần `pip install`, `prefect server start`, viết flow Python |
| **Trigger.dev** | ~5 phút | Cần `npx create-triggerdev`, chạy dev server |

### Khó nhất (nhiều tài nguyên + setup phức tạp)

| Tool | Thời gian thấy UI | Lý do |
|------|------------------|-------|
| **Restate** | ~10 phút | UI tối thiểu, cần viết service, học durable execution concepts |
| **Orkes Conductor** | ~15 phút | Cần Docker + Elasticsearch + MySQL, workflow JSON phức tạp |

### So sánh nhanh UI/UX

| Tiêu chí | Tool mạnh nhất |
|----------|---------------|
| UI editor trực quan | Kestra (visual + YAML editor) |
| Observability (xem từng bước) | Prefect, Kestra |
| Human review native | Orkes Conductor (HUMAN task) |
| Dashboard mặc định đẹp nhất | Kestra |
| Đơn giản nhất | Temporal |
| Code-first mạnh nhất | Temporal, Restate |

---

## 10. Checklist so sánh

Với mỗi công cụ orchestration, hãy xác nhận:

- [ ] **Trigger thủ công** — Có thể trigger với input `keyword` + `runId`?
- [ ] **Idempotency** — Có thể kiểm tra `GET /api/runs/:runId` hoặc dùng cơ chế native?
- [ ] **Scrape API call** — Có thể gọi `POST /api/scrape` và xử lý kết quả?
- [ ] **Human review** — Có thể phát hiện `needsApproval: true` và tạm dừng chờ quyết định?
- [ ] **Retry** — Có thể retry khi gặp lỗi tạm thời (5xx)?
- [ ] **Timeout** — Có thể xử lý trang chậm ~7s mà không bị timeout?
- [ ] **Concurrency** — Có thể xử lý batch 5 từ khoá với tối đa 2 tác vụ đồng thời?
- [ ] **Scheduling** — Có thể lên lịch chạy định kỳ (cron)?
- [ ] **Resilience** — Workflow tiếp tục được sau khi worker bị crash/restart?
- [ ] **Observability** — Có lịch sử thực thi với input/output từng bước?

### Ghi chú quan sát khi so sánh

Khi chạy từng tool, ghi lại:

1. **Thời gian setup**: từ cài đặt đến lần scrape đầu tiên thành công mất bao nhiêu phút?
2. **Chất lượng dashboard**: có xem được input/output của từng bước không?
3. **Cấu hình retry**: retry policy chỉ vài dòng code hay phải viết YAML phức tạp?
4. **Trải nghiệm human review**: công cụ có giao diện phê duyệt native hay phải tự xây?
5. **Resume sau crash**: kill worker giữa lúc scrape — có resume đúng không?
6. **Scheduling**: đặt lịch cron dễ hay khó?
7. **Kiểm soát concurrency**: có giới hạn số tác vụ đồng thời được không?
8. **Code so với config**: workflow logic nằm trong code hay trong cấu hình khai báo (declarative)?

---

## 11. Bước tiếp theo nếu muốn chạy end-to-end thật

### 11.1 Chọn tool để implement trước

Dựa trên mục tiêu của bạn, chọn:

| Nếu bạn muốn... | Chọn... |
|----------------|---------|
| Cảm nhận workflow nhanh nhất, ít code nhất | **Kestra** (YAML) |
| Code-first, durable execution mạnh nhất | **Temporal** |
| Human review native tốt nhất | **Orkes Conductor** |
| Python-native, observability xuất sắc | **Prefect** |
| TypeScript-native, đơn giản | **Trigger.dev** |
| Học durable execution khác biệt | **Restate** |

### 11.2 Các bước implement cho một tool cụ thể

Ví dụ với **Temporal** (pattern áp dụng cho các tool khác):

```bash
# Cấu trúc thư mục đề xuất
workflows/
├── temporal/           # Temporal implementation
│   ├── workflows/
│   │   └── news-monitor.js
│   ├── activities/
│   │   └── scrape.js
│   └── worker.js
├── prefect/           # Prefect Python flow
│   └── news_monitor_flow.py
├── conductor/         # Conductor workflow JSON
│   └── news-monitor-workflow.json
├── restate/           # Restate TypeScript service
│   └── news-monitor-service.ts
├── triggerdev/        # Trigger.dev job
│   └── jobs/news-monitor.ts
└── kestra/            # Kestra YAML flow
    └── news-monitor.yml
```

### 11.3 Kiểm tra end-to-end

Sau khi implement workflow trên một tool, chạy checklist ở **Mục 10** và các edge case ở **Mục 6**. Nếu tất cả đều pass, bạn đã có một workflow hoàn chỉnh.

### 11.4 Lưu ý khi implement

- **Server demo là Node.js** — tất cả tool đều gọi nó qua HTTP. Điều này hoàn toàn bình thường và phản ánh thực tế khi browser automation (Playwright) chạy trong một service riêng.
- **Screenshot/phụ kiện** — response API có thể trả về đường dẫn screenshot. Tool orchestration không lưu trữ file — bạn cần một giải pháp lưu trữ riêng (S3, local disk) nếu muốn xem ảnh trong dashboard.
- **Human review** — các tool khác nhau có mức hỗ trợ khác nhau:
  - Orkes Conductor: HUMAN task native — mạnh nhất
  - Prefect: Pause/Resume native — tốt
  - Kestra: Pause task — đơn giản
  - Temporal: Signal-based — phải tự xây
  - Restate: Awakeable-based — phải tự xây
  - Trigger.dev: Wait for approval — khá tốt

---

> **Tài liệu tham khảo:** Xem thêm `comparison/` trong repo để biết bảng so sánh chi tiết giữa các công cụ.
