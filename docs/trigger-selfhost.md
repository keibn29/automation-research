# Trigger.dev Self-host từ upstream/fork — hướng dẫn thực dụng

Tài liệu này dành cho trường hợp bạn muốn:

- dùng **Trigger.dev hoàn toàn self-host** trong hạ tầng công ty
- có thể **fork repo gốc về Git nội bộ** để kiểm soát source
- **không sửa core logic** của Trigger.dev lúc đầu
- dựng **một instance Trigger.dev nội bộ đóng vai trò giống Trigger Cloud**, rồi cho nhiều repo automation riêng `init/dev/deploy` vào instance đó

---

## 1. Trả lời ngắn: self-host có cần fork repo không?

**Không bắt buộc.**

Bạn có 2 lựa chọn:

### Cách A — Không fork, dùng upstream chính thức
- clone repo gốc hoặc chỉ dùng image / compose file chính thức
- deploy bằng Docker/Kubernetes
- đây là cách nhanh nhất để chạy

### Cách B — Fork về Git công ty
- phù hợp nếu công ty muốn kiểm soát source ở nội bộ
- vẫn có thể giữ code gần như y nguyên upstream
- fork **không có nghĩa là phải sửa core**

> Khuyến nghị thực tế: **fork về Git công ty để governance nội bộ**, nhưng ban đầu **không sửa code**. Chỉ pin version, deploy, và harden infra.

---

## 2. Khi nào mới thật sự cần fork sâu?

Chỉ nên sửa core Trigger.dev khi bạn cần một trong các việc sau:

- custom auth đặc thù công ty
- thay đổi runtime/worker behavior
- patch bảo mật nội bộ chưa upstream
- hardening cho môi trường air-gapped đặc biệt
- custom storage / network / registry flow không giải được bằng config

Nếu chưa có các nhu cầu trên, **fork chỉ để mirror source** là đủ.

---

## 3. Kiến trúc khuyến nghị

### Trigger.dev self-host như một “internal Trigger Cloud”

Đây là mô hình rất hợp lý nếu bạn muốn nhiều project automation dùng chung một platform nội bộ:

```text
Internal Trigger.dev Platform
  - Dashboard
  - API
  - Registry
  - Runs / Schedules / Metadata
  - Workers / Control plane

        ↑
        │  trigger init / dev / deploy
        │

Automation Repo A
Automation Repo B
Automation Repo C
```

Trong mô hình này:
- repo Trigger.dev self-host đóng vai trò giống **Trigger Cloud nội bộ**
- mỗi repo automation là một project riêng, tự có:
  - `trigger.config.mjs`
  - `trigger/`
  - task code riêng
- developer dùng CLI bình thường, chỉ khác là trỏ vào **instance nội bộ** thay vì `cloud.trigger.dev`

## 4. Cần chuẩn bị gì trước khi deploy?

### Runtime / infra tối thiểu
- Docker / Docker Compose hoặc Kubernetes
- internal domain / reverse proxy nếu muốn truy cập UI dễ hơn
- persistent volumes cho:
  - Postgres
  - MinIO/object storage
  - ClickHouse (nếu dùng)

### Mạng
- chỉ mở trong nội bộ / VPN nếu dùng website nội bộ
- egress allowlist nếu có thể
- không để dashboard public nếu không cần

### Secrets
- dùng secret manager nội bộ hoặc env injection qua CI/CD
- không hardcode trong repo
- không log secrets ra task logs

### Platform boundary
- nếu dùng mô hình “internal Trigger Cloud”, hãy phân biệt rõ:
  - **platform repo** = repo self-host Trigger.dev
  - **automation repo** = repo task/business logic của bạn
- không nên nhét task code trực tiếp vào repo platform nếu bạn muốn sau này có nhiều project automation khác nhau

---

## 5. Quy trình triển khai khuyến nghị

### Bước 1 — Fork repo về Git công ty

Ví dụ:

```bash
# Trên GitHub/GitLab công ty: tạo fork hoặc mirror repo gốc
# Sau đó clone về máy triển khai
git clone <git-noi-bo>/trigger.dev.git
cd trigger.dev
```

> Nếu công ty bạn chỉ cần self-host mà không cần thay code, có thể dùng upstream trực tiếp thay vì fork. Nhưng nếu đã xác định self-host lâu dài, fork nội bộ để khóa version và kiểm soát source là hợp lý.

### Bước 2 — Chọn cách deploy

#### Cách nhanh nhất: Docker Compose

```bash
cd hosting/docker
cp .env.example .env
```

Sửa `.env` theo môi trường nội bộ của bạn.

Khởi động:

```bash
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d
```

### Bước 2.1 — Xem repo self-host này như platform nội bộ

Sau khi stack chạy, hãy coi instance này như **Trigger Cloud private** của công ty:

- dashboard nội bộ
- API nội bộ
- worker / scheduler / run history nội bộ
- registry nội bộ

Từ thời điểm này, repo self-host không phải nơi bạn viết business automation hằng ngày nữa. Nó là **platform**.

### Bước 3 — Kiểm tra dashboard

Mặc định mở:

```text
http://localhost:8030
```

Nếu chưa cấu hình email, magic link thường xuất hiện trong logs của webapp.

### Bước 4 — Tạo project automation riêng và trỏ CLI vào instance nội bộ

Đây là phần quan trọng nếu bạn muốn dùng Trigger.dev self-host giống hệt Trigger Cloud:

```bash
# Ở repo automation riêng
cd /path/to/your-automation-project

# login vào instance nội bộ
npx trigger.dev@latest login -a http://trigger.internal.company.com --profile internal

# init project vào instance nội bộ
npx trigger.dev@latest init --javascript -p <project-ref> -a http://trigger.internal.company.com

# chạy local dev
npx trigger.dev@latest dev --profile internal

# deploy
npx trigger.dev@latest deploy --profile internal
```

Nếu bạn chưa có domain nội bộ, có thể thay bằng URL local/self-host thực tế của bạn, ví dụ:

```bash
npx trigger.dev@latest login -a http://localhost:8030 --profile internal
```

> Tóm lại: **có thể dùng self-host Trigger.dev đúng hệt workflow của Trigger Cloud**. Khác biệt chủ yếu là `-a <api-url>` / `--profile <name>` để trỏ CLI vào instance nội bộ.

---

## 6. Browser automation logic nên đặt ở đâu?

Khuyến nghị của tài liệu này là: **repo self-host Trigger.dev chỉ làm platform**, còn browser automation logic nên nằm trong **repo automation riêng** của bạn.

Ví dụ:

```text
your-automation-app/
  trigger.config.mjs
  trigger/
    booking.js
    price-sync.js
    cancel-booking.js
```

Trong repo automation riêng, bạn giữ:
- task orchestration
- adapter logic
- browser automation logic
- config riêng theo domain/flow

Trong mô hình “internal Trigger Cloud”, browser automation sẽ chạy **trực tiếp trong task của repo automation**.

### Browser automation chạy trực tiếp trong task của repo automation

Ví dụ:

```text
your-automation-app/
  trigger.config.mjs
  trigger/
    booking.js     # trong file này có Playwright logic trực tiếp
```

Pattern này nghĩa là:
- platform self-host Trigger.dev chỉ làm dashboard / API / queue / control plane
- repo automation riêng của bạn chứa task code
- task code đó có thể **trực tiếp chạy Playwright / Puppeteer**

Đây là mô hình **phù hợp nhất** nếu bạn muốn:
- log realtime hiện tự nhiên trên dashboard
- ít hệ thống hơn
- không phải bridge logs từ service ngoài

### Nếu bạn có nhiều project automation về sau

Khuyến nghị mạnh:

- **repo self-host Trigger.dev** chỉ làm platform
- mỗi flow family / app automation nên có **repo automation riêng**
- repo automation riêng mới chứa:
  - task code
  - adapter logic
  - browser automation logic
  - config riêng

Lợi ích:
- tránh trộn platform với business logic
- dễ versioning theo từng automation domain
- dễ tách team ownership
- dễ scale lên nhiều project sau này

---

## 7. Realtime logs trong self-host Trigger.dev

Nếu browser automation nằm **trực tiếp trong task** (ví dụ trong `trigger/booking.js` của repo automation riêng):

- `console.log()`
- `logger.info()`
- progress / metadata
- task logs / run logs

**sẽ hiện tự nhiên trên dashboard self-host của Trigger.dev**.

Đây là mô hình gần nhất với trải nghiệm Trigger Cloud chuẩn:

- repo self-host = platform nội bộ
- repo automation = task code
- browser chạy trong chính task code đó

---

## 8. Bảo mật: Trigger.dev team có thấy credentials không?

Nếu bạn **self-host hoàn toàn** và không đẩy dữ liệu ra ngoài:

### Trigger.dev company
**Không thể thấy**:
- credentials
- payload
- logs
- screenshots
- traces

### Supervisor image là gì?

Khi chạy stack self-host của Trigger.dev, bạn sẽ thấy image/container kiểu:

```text
ghcr.io/triggerdotdev/supervisor
```

Đây là thành phần **bình thường** của Trigger.dev v4 self-host.

Vai trò của nó là:

- nhận job từ webapp/API
- kéo image task từ registry nội bộ
- tạo runner container để chạy task code của bạn
- inject environment variables vào runner
- theo dõi/cleanup runner sau khi xong

Nói ngắn gọn:

> **Supervisor = worker controller nội bộ**

Nó không phải task code của bạn, mà là thành phần điều phối runner containers.

### Kiến trúc đơn giản của stack self-host

```text
Trigger.dev Webapp
  -> dashboard / API / queue / metadata
  -> Postgres / Redis / ClickHouse / MinIO / Registry

Supervisor
  -> hỏi webapp có job nào cần chạy không
  -> kéo image task
  -> tạo runner container
  -> truyền env vars vào runner

Runner container
  -> chạy browser automation / task code của bạn
```

### Các container trong Trigger.dev self-host dùng để làm gì?

Đây là cách hiểu ngắn gọn về từng thành phần thường thấy khi chạy stack self-host của Trigger.dev:

| Container / service | Vai trò chính | Bạn nên hiểu nó là gì |
|---|---|---|
| **webapp** | Dashboard, API, auth, project/task/run management | “Bộ não điều phối + giao diện người dùng” |
| **supervisor** | Lấy job từ webapp, kéo image, tạo runner container, truyền env vars, cleanup | “Worker controller” |
| **postgres** | Lưu project, task, run metadata, users, env vars/secrets mã hóa, config hệ thống | “Database chính” |
| **redis** | Queue, cache, coordination tạm thời giữa các thành phần | “Bộ nhớ đệm / queue phụ trợ” |
| **clickhouse** | Lưu logs, traces, metrics/analytics phục vụ dashboard và observability | “Kho analytics / logs nhanh” |
| **minio** | Object storage cho artifacts, payload lớn, outputs, file đính kèm | “S3 nội bộ” |
| **registry** | Container registry nội bộ để lưu image task/deployment | “Docker registry riêng của Trigger.dev” |
| **socket-proxy** | Proxy trung gian để supervisor/worker nói chuyện với Docker socket an toàn hơn | “Lớp giảm rủi ro khi dùng Docker socket” |
| **runner containers** | Container ngắn hạn được spawn ra để chạy task code thật của bạn | “Nơi browser automation thực sự chạy” |
| **electric / realtime layer** | Đồng bộ realtime state để dashboard update trạng thái gần realtime | “Lớp realtime cho UI” |

### Dòng chảy đơn giản giữa các container

```text
webapp
  -> ghi / đọc metadata ở postgres
  -> ghi log / trace vào clickhouse
  -> lưu artifact / output lớn vào minio
  -> đưa job vào queue / coordination qua redis

supervisor
  -> hỏi webapp có job nào cần chạy không
  -> kéo image từ registry nội bộ
  -> qua socket-proxy để tạo runner container

runner container
  -> chạy task code / browser automation của bạn
  -> trả logs / outputs / artifacts về stack nội bộ
```

### Thành phần nào thực sự chạm vào browser automation của bạn?

- **runner container**: chạy code browser automation thật
- **supervisor**: chỉ spawn/điều phối runner, không phải nơi viết logic browser
- **webapp**: không tự chạy browser, chỉ quản lý orchestration/dashboard/API

### Thành phần nào đáng chú ý nhất về bảo mật?

- **supervisor / socket-proxy**: vì liên quan đến việc tạo container chạy task
- **postgres**: vì chứa metadata + secrets/env vars đã mã hóa
- **minio**: vì có thể chứa screenshot, trace, artifact nhạy cảm
- **clickhouse**: vì có thể chứa logs/traces của run

> Nói ngắn gọn: nếu bạn muốn biết “code browser automation của tôi thực sự chạy ở đâu?”, câu trả lời là **runner container**. Nếu muốn biết “ai spawn runner đó?”, câu trả lời là **supervisor**. Nếu muốn biết “dashboard/API của Trigger.dev là gì?”, đó là **webapp**.

### Có rủi ro lộ dữ liệu qua supervisor không?

- **Không có chuyện Trigger.dev team remote vào supervisor/container của bạn** chỉ vì image này tồn tại.
- Nhưng supervisor **có thể thấy secrets ở trong memory** khi nó pass-through env vars vào runner container.
- Nếu ai trong nội bộ công ty có quyền `docker exec`, root access, hoặc đọc network nội bộ giữa các container, họ có thể nhìn thấy nhiều thứ hơn.

Trong phạm vi tiêu chí của bạn (không quan tâm chuyện lộ trong nội bộ công ty), điểm quan trọng là:

> Supervisor **không tự động làm lộ dữ liệu ra ngoài Trigger.dev company**.

### Khi nào supervisor trở thành rủi ro đáng chú ý?

- khi bạn dùng external registry thay vì registry nội bộ
- khi bật exporter/log forwarding ra ngoài
- khi cho quá nhiều người quyền vào Docker host/container
- khi log raw credential/cookie/token vào task logs

---

## 9. Những thứ cần tắt / harden

### Nên làm ngay
- tắt telemetry nếu không muốn bất kỳ metadata nào ra ngoài
- dùng internal registry nếu công ty yêu cầu
- pin version image
- giới hạn ai được vào dashboard
- redact logs
- không lưu password/cookie vào run output
- đặt TTL cho artifacts nếu có thể
- backup DB/object storage có mã hóa

### Không nên làm
- log raw credentials
- để screenshot chứa quá nhiều dữ liệu nhạy cảm mà không kiểm soát access
- dùng tài khoản cá nhân cho bot

### Outbound connections còn tồn tại là gì?

Self-host **không có nghĩa là zero outbound mặc định**. Một số kết nối đi ra ngoài có thể vẫn còn nếu bạn không tắt/cấu hình lại:

- pull Docker image từ `ghcr.io/triggerdotdev/...`
- telemetry / anonymous usage stats nếu chưa tắt
- CLI version check / package metadata check
- exporter/log/tracing sink ra ngoài nếu bạn tự cấu hình
- SMTP / email provider bên ngoài nếu bạn dùng magic link hoặc notification

Điều này **không đồng nghĩa** với việc Trigger.dev team can thiệp được vào máy chủ của bạn.

### Nếu muốn gần như zero-outbound

Bạn nên:

- tắt telemetry
- pin image version và mirror image vào registry nội bộ nếu công ty yêu cầu
- trỏ CLI đúng vào API self-host nội bộ
- không bật OTel exporter / third-party sink nếu không cần
- chỉ dùng object storage / DB / registry nội bộ

---

## 10. Khuyến nghị thực dụng

Với hướng bạn đã chốt, mô hình nên là:

```text
Trigger.dev self-host platform
   -> project automation riêng
      -> task orchestration + browser automation logic
         -> login / navigate / scrape / submit / screenshot / trace
```

Điểm quan trọng:

- repo self-host Trigger.dev chỉ làm platform
- repo automation riêng mới chứa task code thật
- browser automation chạy trực tiếp trong task của repo automation
- logs hiện tự nhiên trên dashboard self-host

---

Nếu bạn đang ở giai đoạn đầu và ưu tiên:

- nhanh triển khai
- tự host trong nội bộ
- dùng Trigger.dev như một platform tập trung cho nhiều project automation
- giữ browser logic trong repo automation riêng

thì nên chọn:

> **Fork (hoặc mirror) Trigger.dev về Git công ty + self-host + dùng nó như một internal Trigger Cloud**

### Khuyến nghị bổ sung nếu bạn muốn nhiều flow automation tương tự trong tương lai

Nếu kế hoạch là:

- self-host Trigger.dev một lần
- sau đó có nhiều repo automation khác nhau cùng dùng platform này

thì đây là cách tổ chức hợp lý:

```text
Repo 1: trigger.dev-platform-selfhost
Repo 2: hotel-booking-automation
Repo 3: hotel-cancel-automation
Repo 4: vendor-portal-automation
```

Trong đó:
- Repo 1 = platform nội bộ giống Trigger Cloud
- Repo 2/3/4 = project automation riêng, dùng `init/dev/deploy` vào platform nội bộ

Trong mỗi repo automation riêng, bạn vẫn có thể:
- import `@trigger.dev/sdk`
- viết task code trực tiếp
- chạy Playwright ngay trong task
- xem logs realtime trên dashboard self-host

Đây là mô hình mình khuyên dùng hơn so với việc nhét tất cả task code vào repo self-host Trigger.dev.
