# Tệp Dữ liệu — News Monitor Approval Bot

## articles.json (dữ liệu mẫu)

Chứa các bài báo mẫu cho demo. Mỗi bài báo tương ứng với một edge case:

| Từ khoá | ID | Edge Case |
|---------|----|-----------|
| `markets` | 1 | Bài báo thường — không có hành vi đặc biệt |
| `acquisition` | 2 | Từ khoá nhạy cảm + fallback selector `.headline` |
| `cyberattack` | 3 | Trang chi tiết fail một lần rồi thành công + nhạy cảm (`breaking`) |
| `inflation` | 4 | Trang tải chậm (~7s) |

Mỗi bài báo hỗ trợ các cờ đặc biệt sau:

- **`failOnce`**: lần đầu `GET /article/:id` trả về HTTP 500. Dùng để kiểm tra retry.
- **`slowResponse`**: thêm độ trễ 7 giây trước khi hiển thị trang chi tiết. Dùng để kiểm tra xử lý timeout.
- **`sensitive`** + **`sensitiveReasons`**: đánh dấu bài báo cần phê duyệt thủ công. Scraper trả về `needsApproval: true`.
- **`selectors.title`**: đặt thành `".headline"` để dùng `<div class="headline">` thay vì `<h1>`, buộc scraper phải dùng fallback.

## Tệp trạng thái runtime (được tạo khi chạy, nằm trong `.gitignore`)

### `runtime/fail-counts.json`
Ghi lại số lần trang chi tiết của mỗi bài báo đã được yêu cầu (theo ID bài báo). Dùng cho hành vi fail-once. Key là ID bài báo (số). Reset qua `POST /api/admin/reset`.

### `runtime/runs.json`
Lưu kết quả scrape theo `runId` (chuỗi). Cho phép idempotency — gọi cùng `runId` sẽ trả về kết quả đã lưu. Tồn tại qua các lần khởi động lại server.

### `runtime/screenshots/`
Thư mục lưu ảnh chụp toàn trang (full-page screenshot) của Playwright khi scrape. Định dạng tên: `<runId>-<timestamp>.png`.
