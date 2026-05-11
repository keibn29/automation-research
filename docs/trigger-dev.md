# Trigger.dev — Tích hợp Orchestration cho News Monitor Demo

## Mục tiêu file này

File này hướng dẫn cách tích hợp **Trigger.dev v4** (nền tảng orchestration kiểu
Durational Execution) vào project **News Monitor Approval Bot** hiện có. Mục đích
là chạy các tác vụ scrape tin tức có scheduling, idempotency, và human approval
gate — mà không cần rewrite server demo.

## Các file đã tạo / sửa

| File | Vai trò |
|------|---------|
| `trigger/trigger.js` | Định nghĩa task: `scrapeKeyword` (manual) và `scheduledNewsScan` (cron) |
| `trigger/package.json` | `{"type": "module"}` — scopes ESM to `trigger/` dir without affecting root CJS project |
| `trigger.config.mjs` | Cấu hình Trigger.dev v4 (project ref, retries, max duration) |
| `docs/trigger-dev.md` | File này — tài liệu hướng dẫn |
| `package.json` | Thêm dependencies (`@trigger.dev/sdk` v4, `trigger.dev` CLI) và scripts |
| `.env.example` | Template cho biến môi trường Trigger.dev |
| `.gitignore` | Thêm `.env` và `.trigger/` vào danh sách ignore |

## Lịch sử: vì sao trước đây dùng `@trigger.dev/cli`?

**Trước đây file này dùng `@trigger.dev/cli` và `@trigger.dev/sdk/v3` — đó là
các package cũ của Trigger.dev phiên bản 3, đã bị deprecated.**

Khi Trigger.dev lên v4, họ đã:
- Gộp CLI vào package `trigger.dev` (chạy với binary `trigger`)
- Đổi tên SDK import từ `@trigger.dev/sdk/v3` thành `@trigger.dev/sdk` (vẫn
  giữ đường dẫn `/v3` cho backward compatibility, nhưng không khuyến khích dùng)
- Cron được khai báo trực tiếp trên task definition (`cron: "0 */6 * * *"`)
  thay vì qua `cronTrigger()`
- `waitForApproval()` được thay bằng hệ thống waitpoint linh hoạt hơn:
  `wait.createToken()` + `wait.forToken()`

Nếu bạn thấy tài liệu cũ nhắc `@trigger.dev/cli` hoặc `/v3`, hãy bỏ qua —
chúng không còn chính xác cho v4.

## Prerequisites

- **Node.js** >= 18 (project hiện tại dùng Node 24)
- **Playwright** đã cài đặt (`npm run setup` — tức `npx playwright install chromium`)
- **Tài khoản Trigger.dev** — đăng ký tại https://trigger.dev (miễn phí)
- **Trigger.dev CLI** — đã có sẵn trong `devDependencies` (`trigger.dev`)

## Những gì user phải tự configure trên Trigger.dev Dashboard

### 1. Tạo project trên Trigger.dev Dashboard

1. Vào https://cloud.trigger.dev
2. Đăng nhập → **New Project**
3. Đặt tên ví dụ: `news-monitor-demo`
4. Framework: **JavaScript** (không chọn Next.js, Remix, etc.)
5. Sau khi tạo, vào **Settings** → copy **Project Ref** (dạng `proj_abc123def456`)

> **⚠ Hai cách dùng `init` — chọn 1 trong 2**
>
> ### Cách A — Dùng repo này (bỏ qua `init`)
>
> Nếu bạn đã clone repo này và muốn dùng file Trigger.dev có sẵn:
>
> 1. Mở `trigger.config.mjs`
> 2. Sửa dòng `project: "YOUR_PROJECT_REF_HERE"` thành project ref thật
> 3. Chạy `npx trigger.dev@latest login` (nếu chưa từng login) — mở browser
>    để xác thực OAuth
> 4. Chạy `npm run trigger:dev`
>
> ### Cách B — Dùng official `init` flow của Trigger.dev
>
> Nếu bạn muốn chạy `init` đúng như Trigger.dev hướng dẫn trên website:
>
> 1. Chạy lệnh init (sẽ sinh file mới):
>    ```bash
>    npx trigger.dev@latest init --javascript -p proj_abc123def456
>    ```
> 2. Lệnh này tạo `trigger.config.*`, `trigger/` directory, sample task, `.env`, v.v.
> 3. **Sau khi init**, copy file task của repo này đè lên sample task:
>    ```bash
>    cp trigger/trigger.js trigger/trigger.js.bak  # backup sample nếu muốn
>    # copy file trigger.js từ repo này vào project
>    ```
> 4. Chạy `npm install && npm run trigger:dev`
>
> **Lưu ý:** Nếu chạy `init` trong thư mục gốc repo này, nó sẽ hỏi **overwrite**
> (ghi đè) các file hiện có. Điều đó cũng được — chỉ cần copy lại `trigger/trigger.js`
> của repo sau đó.

### 2. Sửa `trigger.config.mjs` — điền project ref

Mở `/Users/kei/Projects/docs-research/trigger.config.mjs` và sửa:

```js
project: "proj_abc123def456",   // ← project ref thật của bạn
```

### 3. (Optional) Tạo API Key cho REST API completions

Nếu muốn complete waitpoint qua REST API thay vì Dashboard:

1. Dashboard → **Settings** → **API Keys**
2. Tạo key mới → copy giá trị `tr_apikey_...`
3. Thêm vào `.env`: `TRIGGER_API_KEY=tr_apikey_...`

## Các lệnh local

### Cài dependencies

```bash
npm install
```

### Bước 1: Xác thực với Trigger.dev cloud

Lần đầu tiên, bạn cần login:

```bash
npx trigger.dev@latest login
```

Lệnh này mở browser để xác thực OAuth. Sau đó CLI sẽ nhớ profile.

### Bước 2: Chạy demo server

```bash
# Terminal 1 — start demo server
npm start
# => http://localhost:3100
```

### Bước 3: Chạy Trigger.dev local dev

```bash
# Terminal 2 — start Trigger.dev local dev mode
npm run trigger:dev
```

Lệnh này tương đương `trigger dev` (binary từ package `trigger.dev`). Nó sẽ:
1. Đọc `trigger.config.mjs` và kết nối với Trigger.dev cloud bằng project ref
2. Đồng bộ cấu hình — log **"Sync complete"** hoặc **"Connected"**
3. Watch file trong `trigger/` để reload tự động khi có thay đổi
4. Dashboard sẽ hiển thị **"Waiting for tasks"** — bình thường, chỉ có nghĩa
   là chưa có run nào được trigger

### Deploy lên Trigger.dev cloud

```bash
npm run trigger:deploy
# tương đương: trigger deploy
```

## Expected URLs

| URL | Mục đích |
|-----|----------|
| http://localhost:3100 | Demo server (Express) |
| http://localhost:3100/news | Trang danh sách article |
| http://localhost:3100/api/scrape | POST endpoint scrape |
| http://localhost:3100/api/runs/:runId | GET endpoint kiểm tra cache |
| https://cloud.trigger.dev | Dashboard Trigger.dev |
| https://cloud.trigger.dev/projects/:ref/runs | Xem runs của project |

## Cách test

> **ℹ️** Ngay sau khi chạy `npm run trigger:dev`, Dashboard sẽ hiển thị
> **"Waiting for tasks"**. Điều này là bình thường — nó chỉ có nghĩa là chưa
> có task nào được trigger. Khi bạn chạy các lệnh test bên dưới, trạng thái sẽ
> chuyển thành **"Running"** rồi **"Completed"**.

### 1. Test manual run (scrapeKeyword)

Sau khi cả demo server và `npm run trigger:dev` đều đang chạy, mở terminal thứ 3:

```bash
# Test 1 — normal article (auto-approved)
npm run trigger:run scrape-keyword '{"keyword":"markets","runId":"test-manual-001"}'

# Test 2 — article cần approval
npm run trigger:run scrape-keyword '{"keyword":"acquisition","runId":"test-manual-002"}'
# → Run sẽ pause, complete waitpoint trên Dashboard

# Test 3 — article không tồn tại
npm run trigger:run scrape-keyword '{"keyword":"volcano","runId":"test-manual-003"}'
# → Trả về status: "not_found"

# Test 4 — idempotency (dùng lại runId từ test 1)
npm run trigger:run scrape-keyword '{"keyword":"markets","runId":"test-manual-001"}'
# → Trả về approval: "cached"
```

Kết quả sẽ in ra terminal dưới dạng JSON.

### 2. Test scheduled run

Trigger scheduled task bằng tay để test nhanh (cron không chạy trong `dev` mode):

```bash
npm run trigger:run scheduled-news-scan
```

Task này sẽ:
- Lặp qua các keyword: `markets`, `acquisition`, `cyberattack`, `inflation`
- Với mỗi keyword kiểm tra cache, scrape, và pause nếu cần approval
- Trả về summary với số lượng approved / rejected / auto_approved / cached / errors

### 3. Test human approval pause/resume (v4 waitpoint)

Với keyword `acquisition` hoặc `cyberattack`, task sẽ tạo một **waitpoint** và
đợi nó được complete.

**Cách complete waitpoint trên Dashboard:**
1. Vào https://cloud.trigger.dev
2. Vào project → **Runs** tab
3. Tìm run đang ở trạng thái **Running** hoặc **Waiting**
4. Click vào run → tab **Waitpoints** (hoặc **Overview** nếu không có tab đó)
5. Tìm waitpoint đang pending, click **Complete**
6. Nhập JSON: `{"approved": true, "notes": "Looks good"}` hoặc
   `{"approved": false, "notes": "Not relevant"}`

**Cách complete qua REST API (nếu có API key):**
```bash
# tokenId có trong Dashboard run detail hoặc CLI log
curl -X POST https://api.trigger.dev/api/v1/v3/waitpoints/{tokenId}/complete \
  -H "Authorization: Bearer tr_apikey_..." \
  -H "Content-Type: application/json" \
  -d '{"approved": true, "notes": "Looks good"}'
```

### 4. Test edge cases với demo server

| Edge case | Keyword | runId | Expected behavior |
|-----------|---------|-------|-------------------|
| Happy path | `markets` | `test-edge-001` | `approval: "auto_approved"` |
| Approval + fallback selector | `acquisition` | `test-edge-002` | Dashboard pause, `.headline` fallback |
| Fail-once retry + approval | `cyberattack` | `test-edge-003` | Retry tự động, sau đó pause xin approval |
| Slow page | `inflation` | `test-edge-004` | Timeout mặc định 30s đủ, auto-approved |
| Not found | `volcano` | `test-edge-005` | `status: "not_found"`, `approval: "not_needed"` |
| Idempotency | `markets` | `test-edge-001` (lại) | `approval: "cached"` |
| Server error (simulate) | tắt demo server | `test-edge-006` | `status: "error"` |

Reset demo server state giữa các lần test:
```bash
curl -X POST http://localhost:3100/api/admin/reset
```

### 5. Kiểm tra log

Khi chạy `npm run trigger:dev`, log sẽ hiện trong terminal. Bạn cũng có thể xem
log chi tiết của từng run trên Dashboard.

## Lưu ý kỹ thuật

### Vì sao `trigger/trigger.js` dùng ESM (`import`) trong khi project là CommonJS?

Trigger.dev SDK (`@trigger.dev/sdk`) là ESM-only. Để dùng `.js` thay vì `.mjs`,
file `trigger/package.json` chứa `{"type": "module"}` — Node.js sẽ treat tất cả
`.js` files trong thư mục `trigger/` là ESM modules. Root project (demo server)
vẫn là CJS, không bị ảnh hưởng.

### Tại sao không dùng `waitForApproval` nữa?

Trigger.dev v4 thay `waitForApproval()` bằng hệ thống **waitpoint** tổng quát
hơn (`wait.createToken()` + `wait.forToken()`). Waitpoint cho phép:
- Tuỳ chỉnh dữ liệu complete (không chỉ approved/rejected)
- Timeout linh hoạt
- Complete từ REST API, webhook, hoặc CLI

Trong Dashboard, waitpoint pending hiển thị dưới dạng mục chờ được complete.

## Current Limitations / Chưa tự động hoá

1. **Project ref phải copy thủ công từ Dashboard**
   - Không thể tự động lấy từ CLI
   - Phải tạo project trên cloud.trigger.dev trước

2. **Approval (waitpoint) chỉ operate qua Dashboard/REST API**
   - Chưa có UI tích hợp sẵn trong app demo
   - Phải mở Dashboard để complete waitpoint

3. **Scheduled task chỉ chạy thực sự sau khi deploy**
   - `npm run trigger:dev` không chạy cron trigger
   - Để test cron, dùng `npm run trigger:run scheduled-news-scan` (manual trigger)
   - Deploy lên cloud thì cron mới tự động chạy

4. **Không có retry cho approval timeout**
   - Nếu không ai complete waitpoint, run treo đến khi timeout
   - Timeout mặc định: 24h (cấu hình trong `wait.createToken({timeout: "24h"})`)
   - Không có built-in "auto-reject sau N phút"

5. **Idempotency key chỉ tồn tại trong RAM của demo server**
   - `runs.json` lưu trên disk, nhưng không có TTL/expiry
   - Nếu server restart, cache trong memory bị mất (nhưng vẫn đọc từ disk)

6. **Chưa có CI/CD pipeline**
   - `npm run trigger:deploy` chạy thủ công
   - Chưa tích hợp vào GitHub Actions

7. **Demo server chạy ở localhost:3100**
   - Trigger.dev cloud runs không thể gọi localhost
   - Để production, cần deploy demo server lên hosting (Render, Railway, etc.)
   - Sau đó cập nhật `DEMO_SERVER_URL` trong Trigger.dev environment variables
