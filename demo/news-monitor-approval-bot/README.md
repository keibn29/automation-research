# News Monitor Approval Bot — Demo

Một demo local mô phỏng quy trình giám sát tin tức sử dụng **Playwright** (tự động hoá trình duyệt) và **Express** (trang tin tức giả lập + API). Được thiết kế để một workflow orchestrator bên ngoài (Temporal, n8n, Prefect, v.v.) điều khiển nhằm mục đích so sánh các công cụ.

## Chức năng

1. Một Express server (cổng 3100) phục vụ trang tin tức giả lập với 4 bài báo.
2. API endpoint `POST /api/scrape` nhận `keyword`, chạy Playwright, duyệt trang tin tức giả lập, tìm bài báo phù hợp, trích xuất thông tin, kiểm tra nội dung nhạy cảm và lưu kết quả.
3. Kết quả được lưu bền vững theo `runId`, giúp cùng một run luôn trả về kết quả đã cache (idempotency).
4. Một số bài báo được cài đặt sẵn edge case: fail-once HTTP 500, trang phản hồi chậm, CSS selector thay thế và từ khoá nhạy cảm cần phê duyệt thủ công.

## Điều kiện tiên quyết

- **Node.js** 18+ (đã kiểm tra với 20.x và 22.x)
- **npm** (đi kèm với Node.js)

## Bắt đầu nhanh

```bash
# Từ thư mục gốc của dự án (/Users/kei/Projects/docs-research)
npm install
npm run setup       # cài Chromium cho Playwright (~200 MB)
npm start           # khởi động server tại http://localhost:3100
```

Trong một **terminal riêng**, chạy các câu lệnh curl (xem bên dưới).

## Cấu trúc dự án

```
demo/news-monitor-approval-bot/
├── server.js               # Express server + Playwright scraper
├── README.md               # Tệp này
├── sample-inputs.json      # Ví dụ payload request
├── data/
│   ├── articles.json       # Dữ liệu bài báo mẫu (4 bài)
│   └── README.md           # Tài liệu tệp dữ liệu
└── runtime/                # Được tạo khi chạy (gitignored)
    ├── fail-counts.json    # Đếm số lần fail-once
    ├── runs.json           # Kết quả run idempotent
    └── screenshots/        # Ảnh chụp của Playwright
```

## API Reference

### `POST /api/scrape` — Chạy Playwright Scraper

**Request body:**
```json
{
  "runId": "optional-unique-id",
  "keyword": "required-search-term",
  "timeoutMs": 30000
}
```

**Response (status: `completed`):**
```json
{
  "status": "completed",
  "keyword": "markets",
  "articleId": 1,
  "title": "Global Markets Rally on Tech Earnings",
  "author": "Alice Chen",
  "publishedAt": "2026-05-07T09:00:00Z",
  "summary": "Stock markets surged today as...",
  "url": "http://localhost:3100/article/1",
  "needsApproval": false,
  "sensitiveReasons": [],
  "usedFallbackSelector": false,
  "screenshotPath": "/path/to/runtime/screenshots/demo-normal-001-123456789.png",
  "notes": ["Navigated to /news", "Found article ID 1 for keyword \"markets\""]
}
```

**Response (status: `not_found`):**
```json
{
  "status": "not_found",
  "keyword": "volcano",
  "articleId": null,
  "title": null,
  ...
  "notes": ["Navigated to /news", "No article matched keyword \"volcano\""]
}
```

**Response (status: `error`):**
```json
{
  "status": "error",
  "keyword": "volcano",
  ...
  "notes": ["Exception: ..."]
}
```

### `GET /api/runs/:runId` — Lấy kết quả đã cache
```bash
curl http://localhost:3100/api/runs/demo-normal-001
```

### `POST /api/runs` — Lưu kết quả run một cách thủ công
```bash
curl -X POST http://localhost:3100/api/runs \
  -H "Content-Type: application/json" \
  -d '{"runId": "my-manual-run", "custom": "data"}'
```

### `POST /api/admin/reset` — Reset trạng thái
```bash
curl -X POST http://localhost:3100/api/admin/reset
```

### `GET /api/health` — Kiểm tra sức khoẻ
```bash
curl http://localhost:3100/api/health
```

## Trình diễn Edge Case

### 1. Bài báo thường — Từ khoá: `markets`
```bash
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId": "demo-normal-001", "keyword": "markets"}'
```
**Kết quả:** `status: "completed"`, `needsApproval: false`, `usedFallbackSelector: false`.

---

### 2. Cần phê duyệt + Fallback Selector — Từ khoá: `acquisition`
```bash
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId": "demo-approval-002", "keyword": "acquisition"}'
```
**Kết quả:** `status: "completed"`, `needsApproval: true`, `sensitiveReasons: ["acquisition"]`, `usedFallbackSelector: true`.  
**Giải thích:** Bài báo này dùng `<div class="headline">` thay vì `<h1>`, nên scraper phải fallback sang selector `.headline`. Từ khoá "acquisition" bị gắn cờ là nhạy cảm.

---

### 3. Fail-Once Retry — Từ khoá: `cyberattack`
```bash
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId": "demo-retry-003", "keyword": "cyberattack"}'
```
**Kết quả:** `status: "completed"`, `needsApproval: true`, `sensitiveReasons: ["breaking"]`.  
**Giải thích:** Lần đầu `GET /article/3` trả về HTTP 500. Playwright phát hiện trang lỗi, tải lại, và thành công ở lần thứ hai. Ghi chú bao gồm `"Retry attempt 1 after fail-once error"`. Chạy lệnh này **sau reset hoặc lần đầu tiên** — bộ đếm fail-once có tính bền vững.

---

### 4. Trang chậm — Từ khoá: `inflation`
```bash
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId": "demo-slow-004", "keyword": "inflation", "timeoutMs": 15000}'
```
**Kết quả:** Mất ~7–8 giây. `status: "completed"`, `needsApproval: false`.  
**Giải thích:** Bài báo số 4 có độ trễ 7 giây trước khi hiển thị. Cần `timeoutMs` lớn hơn (15s) để thành công. Với timeout mặc định 30s cũng chạy được, nhưng 15s cho thấy tác dụng của tham số timeout.

---

### 5. Không có kết quả — Từ khoá: `volcano`
```bash
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId": "demo-notfound-005", "keyword": "volcano"}'
```
**Kết quả:** `status: "not_found"`, tất cả trường article đều `null`.  
**Giải thích:** Không có bài báo nào khớp "volcano". Scraper trả về sớm với trạng thái `not_found`.

---

### 6. Idempotency / Trigger trùng — Cùng `runId`
```bash
# Lần gọi đầu (giống bước 1)
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId": "demo-normal-001", "keyword": "markets"}'

# Lần gọi thứ hai cùng runId — sẽ trả về kết quả cache
curl -X POST http://localhost:3100/api/scrape \
  -H "Content-Type: application/json" \
  -d '{"runId": "demo-normal-001", "keyword": "markets"}'
```
**Kết quả (lần hai):** Giống lần đầu, nhưng có thêm `fromCache: true`. Không khởi chạy Playwright.

---

### 7. Admin Reset
```bash
# Sau khi chạy các bài kiểm tra, reset trạng thái:
curl -X POST http://localhost:3100/api/admin/reset

# Lệnh này xoá:
#   - bộ đếm fail-once (để "cyberattack" sẽ fail lại)
#   - kết quả run đã cache (để idempotency cache bị xoá)
```

### 8. Kiểm tra trạng thái đã lưu sau Reset
```bash
curl http://localhost:3100/api/runs/demo-normal-001
# Trả về 404 sau khi reset
```

## Ánh xạ sang Workflow Orchestrator

Mỗi công cụ orchestration có thể ánh xạ các bước của demo này như sau:

| Bước | Ánh xạ công cụ |
|------|-------------|
| **Trigger** | Trigger thủ công / trigger theo lịch với input `keyword` và `runId` |
| **Kiểm tra Idempotency** | Gọi `GET /api/runs/:runId` hoặc dùng built-in workflow ID dedup |
| **Scrape** | Gọi `POST /api/scrape` với `{ runId, keyword }` qua HTTP task |
| **Cổng Human Review** | Nếu response `needsApproval === true`, tạm dừng workflow chờ quyết định thủ công |
| **Hành động sau phê duyệt** | Sau khi duyệt, tiếp tục bước tiếp theo (ví dụ gửi thông báo) |
| **Retry khi lỗi** | Nếu response là `error` hoặc 5xx, retry với backoff |
| **Lên lịch** | Chạy mỗi N phút/giờ với danh sách từ khoá |
| **Giới hạn Concurrency** | Gửi batch N từ khoá, giới hạn số lượng scrape đồng thời |

## Lên lịch (Scheduling)

Để chạy workflow này theo lịch qua một orchestrator:
1. Bọc lệnh gọi `POST /api/scrape` trong workflow có lịch của orchestrator.
2. Truyền danh sách từ khoá để lặp qua.
3. Dùng cron/schedule trigger của orchestrator (ví dụ mỗi 15 phút).
4. Với mỗi từ khoá, tạo `runId` xác định (ví dụ `news-${keyword}-${date}`).

## Giới hạn tốc độ / Concurrency

Để kiểm tra giới hạn tốc độ:
1. Gửi 5 từ khoá song song qua orchestrator.
2. Đặt max concurrency là **2** lệnh gọi `POST /api/scrape` đồng thời.
3. Quan sát: Playwright khởi chạy tuần tự (mỗi lần gọi mở/đóng trình duyệt riêng).
4. Express server xử lý các request đồng thời tốt, nhưng bộ nhớ Playwright tăng theo mức concurrency.

Ví dụ batch (từ terminal riêng):
```bash
# Reset trước
curl -X POST http://localhost:3100/api/admin/reset

# Gửi 5 request song song — trong thực tế, giới hạn còn 2 mỗi lần
for keyword in markets acquisition cyberattack inflation volcano; do
  curl -X POST http://localhost:3100/api/scrape \
    -H "Content-Type: application/json" \
    -d "{\"runId\":\"demo-batch-$(date +%s)\", \"keyword\":\"$keyword\"}" &
done
wait
```

## Kiểm tra Resume / Kill

Để kiểm tra khả năng tiếp tục của workflow:
1. Bắt đầu một scrape cho `inflation` (mất ~7s).
2. Kill server (`Ctrl+C`) khi scrape đang chạy.
3. Khởi động lại server.
4. Orchestrator (nếu có durability) sẽ retry bước scrape.
5. Bộ đếm fail-once cho "cyberattack" được reset khi khởi động lại nếu không có tệp runtime, nhưng vẫn tồn tại nếu `runtime/fail-counts.json` có sẵn.

Đối với kiểm tra resume approval:
1. Scrape `acquisition` hoặc `cyberattack` — kết quả có `needsApproval: true`.
2. Trước khi phê duyệt, kill worker.
3. Khởi động lại worker — orchestrator sẽ tiếp tục từ cổng approval.
4. Phê duyệt hoặc từ chối — workflow tiếp tục.
