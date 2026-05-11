# Hướng dẫn demo nhanh để tự trải nghiệm và test các tiêu chí

Tài liệu này dùng để bạn tự test nhanh các tool sau trên cùng một bài toán:

- **Temporal**
- **n8n**
- **Prefect**
- **Orkes Conductor / Netflix Conductor**
- **Restate**
- **Trigger.dev**
- **Kestra**

Mục tiêu là tạo một demo nhỏ để bạn có thể cảm nhận nhanh:

- tool nào dễ setup hơn
- tool nào mạnh về reliability / resume
- tool nào có human review tốt
- tool nào dễ nhét Playwright vào nhất
- tool nào có dashboard / observability tốt
- tool nào đáng để POC sâu hơn

## 1. Tên demo

**Browser Order Review Bot**

Bot dùng Playwright mở một site mock/local, đọc thông tin sản phẩm, kiểm tra điều kiện, yêu cầu human approval, rồi "đặt hàng" giả lập với retry, idempotency, schedule và rate limit.

## 2. Mục tiêu

Tạo một demo nhỏ có thể port sang:

- Temporal
- n8n
- Prefect
- Orkes Conductor
- Restate
- Trigger.dev
- Kestra

Mục tiêu là so sánh nhanh các tiêu chí workflow orchestration qua cùng một bài toán, không cần production setup.

## 3. Luồng demo chung

### 3.1 Chuẩn bị mock site

Dùng một app local rất nhỏ, ví dụ:

- `GET /products` hiển thị danh sách sản phẩm HTML.
- `GET /product/:id` hiển thị:
  - tên sản phẩm
  - giá
  - trạng thái còn hàng
  - nút `Reserve`
- `POST /api/reserve`
  - nhận `requestId`, `productId`
  - nếu trùng `requestId` thì trả về kết quả cũ để test idempotency
  - lần gọi đầu tiên có thể fail có chủ đích để test retry

Khuyến nghị: dùng mock local thay vì site public để đảm bảo công bằng và ổn định khi so sánh.

### 3.2 Workflow chính

1. **Trigger workflow**
   - Manual trigger với input:
     - `requestId`
     - `productId`
     - `maxPrice`
   - Schedule trigger chạy mỗi 5 phút hoặc mỗi ngày.

2. **Check idempotency**
   - Nếu `requestId` đã xử lý, dừng sớm và trả kết quả cũ.
   - Ghi rõ trong history/log.

3. **Browser automation**
   - Mở mock site bằng Playwright.
   - Vào trang sản phẩm.
   - Đọc `name`, `price`, `stockStatus`.
   - Chụp screenshot hoặc lưu HTML snapshot.

4. **Forced failure**
   - Bước reserve hoặc validation fail lần đầu.
   - Tool phải retry theo policy.
   - Retry phải không tạo duplicate order nhờ `requestId`.

5. **Human review**
   - Nếu `price > maxPrice` hoặc sản phẩm gần hết hàng:
     - pause workflow
     - gửi form/task approval
     - user chọn `Approve` hoặc `Reject`
   - Nếu reject thì workflow kết thúc có trạng thái rõ ràng.

6. **Reserve**
   - Gọi `POST /api/reserve`.
   - Dùng `requestId` làm idempotency key.
   - Nếu API fail transient, retry.

7. **AI fallback / self-healing nhỏ**
   - Cố tình đổi selector HTML cho một sản phẩm.
   - Playwright selector chính fail.
   - Fallback:
     - selector phụ
     - hoặc rule đọc text theo label
     - hoặc optional LLM/AI extractor nếu tool hỗ trợ dễ
   - Ghi rõ fallback có được gọi không.

8. **Concurrency / rate limit**
   - Chạy batch 10 sản phẩm.
   - Giới hạn:
     - tối đa 2 browser sessions cùng lúc
     - tối đa 3 reserve API calls / phút
   - Quan sát queue, throttle, retry, failure.

9. **Stop / resume**
   - Đang chờ approval hoặc sau bước browser thì kill worker/container/process.
   - Restart.
   - Kiểm tra workflow có resume đúng state không.

## 4. Cách map từng tiêu chí vào demo

| Tiêu chí | Cách test trong demo |
|---|---|
| Dashboard / History | Xem từng step: trigger, browser, approval, retry, reserve, complete/fail |
| Reliability / Resume | Kill worker giữa workflow, restart, kiểm tra resume |
| Retry / Idempotency | Forced fail lần đầu ở `/api/reserve`, retry với cùng `requestId` |
| Human Review | Pause khi giá vượt `maxPrice`, approve/reject thủ công |
| Browser Automation / Playwright | Mở trang product, đọc giá, screenshot |
| Scheduling | Chạy workflow bằng manual trigger và scheduled trigger |
| Chi phí | Ghi thời gian setup, tài nguyên local/cloud, giới hạn free tier |
| Trigger start / stop / interaction | Start manual, cancel run, approve/reject, retry/resume |
| Scale / Rate Limit | Batch 10 sản phẩm, limit 2 browser sessions và 3 API calls/phút |
| Security / RBAC | Kiểm tra login, project/user role, ai được approve/cancel/retry |
| AI fallback / self-healing | Selector chính fail, fallback selector/rule/AI extractor chạy |
| Learning curve | Đo thời gian từ install đến run demo thành công, số file/config cần viết |

## 5. Checklist quan sát khi chạy

- [ ] Setup local/dev có mất dưới 30 phút không?
- [ ] Có dashboard nhìn được workflow history không?
- [ ] Có thấy rõ input/output từng step không?
- [ ] Retry policy cấu hình dễ không?
- [ ] Duplicate `requestId` có bị xử lý lại không?
- [ ] Human approval có native support không hay phải tự dựng webhook/form?
- [ ] Có thể pause/resume sau restart không?
- [ ] Playwright chạy ổn trong worker/container không?
- [ ] Schedule có dễ cấu hình không?
- [ ] Có cancel/stop workflow đang chạy không?
- [ ] Có tương tác với workflow đang pause không?
- [ ] Rate limit/concurrency có native support không?
- [ ] RBAC có test được ở local/dev không?
- [ ] Logs/screenshot/artifact có dễ xem không?
- [ ] Khi step fail, nguyên nhân có dễ debug không?
- [ ] Code/config có dễ hiểu với người mới không?

## 6. Khuyến nghị phạm vi demo tối thiểu

Nếu muốn chạy nhanh nhất, chỉ giữ:

1. Manual trigger với `requestId`, `productId`, `maxPrice`
2. Playwright đọc giá từ mock page
3. Forced failure + retry
4. Idempotency bằng `requestId`
5. Human approval approve/reject
6. Dashboard/history
7. Batch 5 items với concurrency limit 2

Có thể skip lúc đầu:

- RBAC chi tiết
- Cloud deployment
- AI thật
- Multi-user approval
- Scale lớn
- Billing/cost benchmark sâu

## 7. Lưu ý công bằng khi so sánh tool

- Dùng cùng mock site, cùng input, cùng failure rule.
- Không dùng feature cloud cao cấp cho tool này nhưng local-only cho tool khác.
- Đánh giá `native support` và `phải tự code thêm` riêng biệt.
- Với Human Review, phân biệt:
  - có native approval/task UI
  - dùng webhook/pause thủ công
  - phải tự build UI riêng
- Với reliability, phải test bằng restart thật, không chỉ đọc docs.
- Với cost, ghi cả:
  - chi phí hạ tầng
  - chi phí vận hành
  - thời gian học/setup
- Với AI fallback, nếu tool không có AI native thì dùng fallback rule để vẫn giữ cùng logic demo.
- Không benchmark throughput nặng; demo này chỉ đủ để cảm nhận DX, reliability, observability và orchestration model.
