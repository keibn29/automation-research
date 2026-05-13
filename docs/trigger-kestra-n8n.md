# So sánh nhanh: Trigger.dev vs Kestra vs n8n

So sánh theo thực tế demo/RPA trong repo này, ưu tiên **chạy thử nhanh, UI/history dễ nhìn, approval dễ thao tác, và maintainability thực tế** hơn lý thuyết production.

---

## Kết luận ngắn

- **Kestra**: hợp nhất nếu mục tiêu là **demo rõ ràng, operator dễ theo dõi, nhiều hotel flow về lâu dài**.
- **Trigger.dev**: hợp nhất nếu team muốn **code-first TypeScript, embedded Playwright, HITL linh hoạt**.
- **n8n**: hợp cho **visual automation đơn giản, approval nhẹ, integration nhanh**, nhưng yếu hơn nếu làm core orchestration cho browser automation dài và phức tạp.

---

## 1. Dashboard / History

- **Trigger.dev**: UI hiện đại, xem Runs/Logs/Waitpoints rõ, realtime status tốt. Cần project cloud hoặc self-host.
- **Kestra**: UI tốt nhất cho demo/operator: Flows, Executions, Logs, Gantt, execution tree, Pause/Resume, YAML editor.
- **n8n**: UI visual dễ hiểu nhất với non-dev. Có execution history, node-by-node result rõ. Nhưng khi workflow nhiều nhánh/browser-heavy, canvas dễ rối và khó review như code/YAML.

**Đánh giá thực tế:**  
Nếu cần “mở dashboard cho khách xem flow đang chạy tới đâu”, **Kestra** thường thuyết phục nhất. Nếu cần visual dễ hiểu cho business user, **n8n** dễ demo. Nếu cần task logs/dev tracing, **Trigger.dev** tốt.

## 2. Reliability / Resume

- **Trigger.dev**: mạnh cho durable task, retry, replay, queue/concurrency.
- **Kestra**: mạnh cho restart from failed task, durable execution, queue-backed workflow.
- **n8n**: đủ tốt cho automation/integration thông thường, có execution retry và queue mode khi self-host. Nhưng không nên coi là durable workflow engine mạnh cho browser transaction dài, nhiều checkpoint nghiệp vụ.

**Đánh giá thực tế:**  
Với booking flow có bước irreversible như submit booking/write-back TAVI, **Trigger.dev/Kestra** an toàn hơn. n8n cần thiết kế idempotency kỹ ở service/API bên ngoài.

## 3. Retry / Idempotency

- **Trigger.dev**: retry config linh hoạt, idempotency key built-in, phù hợp code-first.
- **Kestra**: retry policy rõ ở YAML/task level, restart execution tốt.
- **n8n**: có retry/error workflow patterns, nhưng idempotency thường phải tự xử lý bằng database/API/service logic.

**Lưu ý:**  
Không tool nào tự đảm bảo “không book trùng”. Flow phải có booking state machine rõ: `pending → validating → needs_review → submitted → confirmed → written_back → processed`.

## 4. Human-in-the-loop / Approval

- **Trigger.dev**: linh hoạt nhất. Có waitpoint/token/resume với arbitrary JSON. Hợp cho approve/reject, correction payload, retry với selector mới, multi-step review.
- **Kestra**: `Pause` + `onResume` input đủ tốt cho approval/correction đơn giản. Native assignment/governance mạnh hơn nằm ở Enterprise.
- **n8n**: dễ làm approval nhẹ qua Wait node, Webhook, Form, Slack/Email. Rất nhanh cho “approve/reject” đơn giản, nhưng khó maintain nếu approval logic phức tạp, nhiều vòng correction, hoặc cần state transition nghiêm ngặt.

**Đánh giá thực tế:**  
Flow Gonjiam có escalation khi mapping thiếu hoặc giá mismatch. Nếu chỉ cần người chọn “approve/cancel/correct mapping”, cả 3 làm được. Nếu cần correction loop phức tạp, **Trigger.dev** tốt nhất.

## 5. Khi nào HITL thực sự có giá trị

- **Giá trị thấp**: với các tác vụ browser automation lặp đi lặp lại, deterministic cao, HITL chỉ nên là **exception gate / approval gate**.
- **Giá trị cao**: khi flow có **business exceptions, ambiguity, irreversible actions, compliance/quality gate**, nơi con người phải chịu trách nhiệm quyết định cuối.

**Đánh giá thực tế:**  
Case Gonjiam là kiểu HITL có giá trị ở chỗ: thiếu mapping, lệch giá, hoặc cần xác nhận trước khi submit booking.

## 6. Browser Automation / Playwright

- **Trigger.dev**: mạnh nhất nếu chạy Playwright trực tiếp trong task TypeScript. Code tự nhiên, logs gắn với run.
- **Kestra**: thường nên gọi browser script/container/service riêng. Hợp với orchestration layer hơn là nhúng browser logic dài trong YAML.
- **n8n**: không phải platform browser automation chính. Có thể gọi external browser service, Execute Command, Code node, hoặc custom container, nhưng visual workflow không phù hợp để chứa logic Playwright phức tạp.

**Khuyến nghị architecture:**  
Với nhiều hotel adapters, nên tách:
- Orchestrator: Trigger.dev/Kestra/n8n
- Browser automation service: Playwright, selector, login/session, site adapter
- Business state DB: booking status, idempotency, mapping, audit result

## 7. Scheduling

- **Trigger.dev**: scheduled task tốt, nhưng cloud/dev behavior cần hiểu rõ.
- **Kestra**: cron YAML rõ, chạy khi server online.
- **n8n**: Schedule Trigger rất dễ dùng, hợp demo và automation định kỳ.

**Đánh giá thực tế:**  
Nếu chỉ “mỗi X phút kéo booking mới”, cả 3 đều đủ.

## 8. Giao diện trigger / start / stop / cancel

- **Trigger.dev**: dashboard/API trigger, cancel, replay, wait token.
- **Kestra**: UI/API execute, kill, restart, pause/resume, input flow rất trực quan.
- **n8n**: manual run, webhook trigger, schedule trigger rất dễ demo; control execution đủ tốt cho automation phổ thông.

## 9. AI integration / runtime / agent orchestration

Trước hết cần tách rõ hai bài toán khác nhau:

- **“Gọi LLM”**: chỉ là một bước trong workflow — ví dụ dùng model để chuẩn hóa tên package, phân loại mismatch, trích xuất dữ liệu từ email/log/HTML.
- **“Agent orchestration”**: agent có memory/RAG, gọi tools/API/MCP, chạy nhiều vòng, chờ human review, retry khi tool fail, kiểm soát cost, và không được tự ý làm hành động irreversible nếu chưa qua guardrail.

Nếu roadmap sau này có thêm nhiều flow AI như **RAG, embeddings/indexing, AI enrichment/extraction, MCP/tool calling, human review loop**, thì tiêu chí này không còn là “nice to have” nữa mà ảnh hưởng trực tiếp đến việc chọn nền orchestration.

### Trigger.dev

- **Mạnh nhất ở hướng code-first AI runtime**:
  - Hợp với team muốn viết agent bằng **TypeScript** và dùng trực tiếp OpenAI SDK, Anthropic SDK, Vercel AI SDK, LangChain hoặc custom tool loop trong code.
  - AI flow được viết như code bình thường: dễ refactor, test, chia module, reuse với browser/task code đang có.
  - Hợp với pattern: `fetch context -> call model -> evaluate confidence -> wait human input -> retry with corrections -> commit`.

- **Streaming / realtime tốt nhất trong 3 tool**:
  - Có lợi thế rõ nếu muốn stream output agent ra frontend/operator UI thay vì đợi xong cả task.
  - Realtime streams, metadata, logs, waitpoints rất hợp với flow kiểu:
    - agent đang phân tích booking;
    - update progress theo bước;
    - stream suy luận/kết quả tạm thời;
    - chờ human xác nhận rồi chạy tiếp.
  - Nếu sau này muốn làm chat-like operator console hoặc live AI review UX, Trigger.dev là lựa chọn thuận nhất.

- **Human-in-the-loop cho agent correction loop linh hoạt nhất**:
  - `waitpoint` / resume bằng **arbitrary JSON** là lợi thế lớn.
  - Human có thể gửi dữ liệu kiểu:
    - `correctedPackageName`
    - `correctedSelector`
    - `approvedPrice`
    - `forceContinueReason`
  - Điều này hợp với agent loop nhiều vòng hơn kiểu approve/reject đơn giản.

- **Durable execution hợp cho long-running agent flows**:
  - Agent có thể chạy lâu, chờ external event/human input, rồi resume.
  - Hợp với pipeline dài như:
    - embed/index hàng loạt tài liệu;
    - enrichment nhiều batch;
    - agent gọi nhiều tool tuần tự;
    - browser automation kết hợp AI validation.
  - Tuy nhiên durability không thay thế cho guardrail: vẫn phải có `max iterations`, `cost budget`, `fallback-to-human`, `idempotency`.

- **Điểm yếu / trade-off**:
  - Không phải “AI platform built-in” hoàn chỉnh theo kiểu chỉ cấu hình là có RAG/memory/MCP đầy đủ.
  - Embeddings, indexing, retrieval, vector DB, memory, MCP client/tools… thường phải **tự code** hoặc ghép thư viện/service ngoài.
  - Điều này rất mạnh nếu team dev giỏi, nhưng tốn công hơn nếu mục tiêu là “bật AI platform nhanh bằng config”.

**Kết luận cho AI scenario:** Trigger.dev thắng khi cần **custom AI agent bằng TypeScript, streaming, human correction loop linh hoạt, và integration sâu với Playwright / task code**.

### Kestra

- **Mạnh ở declarative AI orchestration cấp platform**:
  - Kestra có hướng đi rõ hơn về **AI workflows như một phần của orchestration platform**, không chỉ là gọi một model API.
  - Có thể cấu hình AI/agent, tools, retrieval, memory, downstream flows theo kiểu YAML-first.
  - Phù hợp nếu muốn operator nhìn thấy agent cũng là một execution tree giống ETL/job khác.

- **Hợp với roadmap nhiều flow AI về lâu dài**:
  - Nếu repo sau này có thêm:
    - indexing jobs cho docs/mapping;
    - nightly embedding refresh;
    - extraction/enrichment batch;
    - retrieval + review + publish pipeline;
    - AI-assisted routing cho exception cases;
    thì Kestra là orchestration layer khá tự nhiên.
  - Đặc biệt hợp khi AI không đứng một mình, mà nằm trong **một chuỗi flow lớn** gồm ingest, validate, review, write-back, notify.

- **RAG / indexing / enrichment pipeline dễ nhìn và dễ vận hành**:
  - Kestra có lợi thế khi cần tổ chức pipeline kiểu:
    - ingest source docs/history/mapping;
    - chunk + embed;
    - update vector index;
    - run retrieval;
    - gọi agent/extractor;
    - validate output;
    - pause cho human review;
    - resume downstream.
  - Đây là kiểu việc mà execution tree, schedule, retry, flow decomposition của Kestra phát huy rất rõ.

- **MCP / tool calling / agent-as-platform story tốt hơn**:
  - Nếu tương lai có nhiều agent gọi nhiều tool/service/flow khác nhau, Kestra hợp với mô hình “tool/flow là primitive của platform”.
  - Hợp với tư duy: agent không chỉ là code trong một repo, mà là một phần của hệ orchestration nội bộ.

- **Human review đủ tốt, nhưng kém linh hoạt hơn Trigger.dev**:
  - `Pause` + `onResume` đủ tốt cho:
    - approve/reject;
    - nhập correction có schema tương đối cố định;
    - escalation có operator form rõ ràng.
  - Nhưng nếu agent cần payload động, nhiều vòng hội thoại/correction loop, hoặc resume với schema thay đổi liên tục, Trigger.dev vẫn mềm hơn.

- **Điểm yếu / trade-off**:
  - Không mạnh bằng Trigger.dev nếu cần stream output token-by-token ra frontend.
  - Nếu agent logic quá phức tạp mà cố nhồi hết vào YAML, maintainability sẽ giảm.
  - Cách dùng tốt hơn thường là: **Kestra orchestrate agent jobs**, còn reasoning/runtime phức tạp nằm ở service hoặc code riêng.

**Kết luận cho AI scenario:** Kestra thắng khi cần **AI orchestration ở cấp platform, nhiều flow, RAG/indexing/enrichment định kỳ, operator visibility, và execution management dài hạn**.

### n8n

- **Nhanh nhất cho AI automation đơn giản / visual**:
  - n8n hợp với low-code AI workflow như:
    - gọi LLM để chuẩn hóa dữ liệu;
    - AI extraction từ email/PDF/text;
    - classify booking issue;
    - gửi kết quả sang Slack/Email/Google Sheet/DB;
    - approval đơn giản qua form/webhook.
  - Rất hợp để demo nhanh cho non-dev hoặc business user.

- **Tốt cho integration-heavy AI workflows**:
  - Nếu AI chủ yếu là một bước trong luồng integration giữa nhiều SaaS/API, n8n rất nhanh.
  - Ví dụ:
    - nhận booking;
    - gọi LLM chuẩn hóa tên package;
    - nếu confidence thấp thì gửi form cho human;
    - ghi kết quả về API/DB;
    - notify team qua Slack.

- **Có ecosystem AI đủ dùng nhưng sẽ đụng trần sớm hơn**:
  - n8n có AI nodes, AI Agent patterns, vector store integrations, tool patterns.
  - Nhưng khi flow bắt đầu có:
    - nhiều branch;
    - nhiều retry;
    - correction loop;
    - browser state;
    - nhiều sub-agents / sub-tools;
    - cần state machine rõ;
    thì canvas dễ phình to và khó review/versioning.

- **Không phải lựa chọn tốt nhất cho long-running agent core**:
  - Nếu agent vừa điều khiển Playwright, vừa gọi RAG, vừa chờ human, vừa retry nhiều vòng, n8n sẽ nhanh chóng trở thành nơi khó giữ flow rõ ràng.
  - Thực tế hơn là để browser/agent runtime ở service ngoài; n8n chỉ xử lý integration và approval nhẹ.

- **Human review nhanh nhưng thường dừng ở simple approval pattern**:
  - Form/Wait/Webhook/Slack approval rất tiện.
  - Nhưng correction loop nhiều vòng, schema động, audit/guardrail nghiêm túc thì n8n kém phù hợp hơn Trigger.dev/Kestra.

**Kết luận cho AI scenario:** n8n thắng khi cần **AI workflow visual, integration nhanh, approval nhẹ, và prototype/demo cho non-dev**; yếu hơn cho **agent orchestration dài, browser-heavy, nhiều state/checkpoint**.

### Đánh giá thực tế nếu roadmap sau này AI-heavy

Nếu repo sau này thêm nhiều flow cần agent intervention — **RAG, embeddings/indexing, AI extraction, MCP/tool calling, human review, long-running agent loops** — thì không nên nghĩ theo kiểu “chỉ cần thêm một LLM node/task”. Cần thiết kế như một hệ thống hoàn chỉnh:

- **Agent không được tự quyết định hành động irreversible**:
  - submit booking;
  - write-back TAVI;
  - mark Paragon processed;
  - thay đổi mapping production.
  - Các bước này nên có deterministic validation + human/guardrail gate khi confidence thấp.

- **RAG / indexing nên là pipeline riêng**:
  - ingest docs/mapping/history;
  - generate embeddings;
  - update vector DB;
  - version index;
  - monitor retrieval/extraction quality.
  - Đây là nơi **Kestra** thường hợp nhất nếu cần schedule, operator visibility, và execution management rõ.

- **Agent runtime phải có state rõ**:
  - current step;
  - tool calls;
  - retrieved context;
  - confidence;
  - human review payload;
  - cost/token budget;
  - retry count;
  - final decision.
  - Trigger.dev làm tốt nếu state sống trong code/task. Kestra làm tốt nếu state nằm ở flow/service boundary. n8n cần kỷ luật cao nếu không sẽ biến canvas thành state machine khó đọc.

- **MCP / tool calling phải có guardrail**:
  - tool không nên có quyền rộng mặc định;
  - tool gọi booking/write-back phải idempotent, logged, và có permission boundary;
  - với nhiều tools, Kestra có lợi thế orchestration/platform; Trigger.dev có lợi thế custom code; n8n có lợi thế nối nhanh nhưng cần giới hạn scope.

- **Long-running agent loops cần hard limits**:
  - max iterations;
  - timeout;
  - max cost;
  - fallback to human;
  - deterministic stop conditions.
  - Không tool nào tự chữa được chất lượng agent nếu không có guardrail rõ.

### Khuyến nghị theo AI scenario

- **Chọn Trigger.dev nếu**:
  - muốn viết custom agent bằng TypeScript;
  - cần streaming/realtime UI;
  - cần human correction loop linh hoạt bằng arbitrary JSON;
  - agent gắn chặt với Playwright/task code;
  - team dev muốn kiểm soát sâu logic, retries, tool calls.

- **Chọn Kestra nếu**:
  - roadmap có nhiều AI pipelines/flows;
  - cần RAG/indexing/enrichment chạy định kỳ;
  - cần operator nhìn rõ execution tree;
  - muốn orchestrate nhiều agent/service/tool ở cấp platform;
  - muốn mô hình phù hợp hơn cho multi-hotel, multi-adapter, internal operations.

- **Chọn n8n nếu**:
  - cần prototype AI workflow nhanh;
  - workflow chủ yếu là SaaS/API integration;
  - approval đơn giản qua form/webhook/Slack/email;
  - AI chỉ làm extraction/enrichment nhẹ, không phải long-running agent core.

**Khuyến nghị mặc định cho repo này nếu AI-heavy thật sự:**

- **Kestra** nên là lựa chọn mặc định nếu muốn xây một orchestration platform cho nhiều flow AI + non-AI cùng tồn tại lâu dài.
- **Trigger.dev** là runner-up rất mạnh nếu team nghiêng code-first và muốn agent logic nằm trong TypeScript, đặc biệt khi cần streaming và correction loop linh hoạt.
- **n8n** chỉ nên dùng cho visual/lightweight integration hoặc demo approval đơn giản, không nên là lõi cho agent/browser automation dài và nhiều checkpoint.

## 10. Learning curve

- **Trigger.dev**: dễ nếu biết TypeScript/Node.
- **Kestra**: trung bình; phải làm quen YAML flow, plugin, namespace.
- **n8n**: dễ nhất để bắt đầu nếu chỉ làm workflow đơn giản.

## 11. Plugin / integration

- **Trigger.dev**: integration chủ yếu qua code/npm packages.
- **Kestra**: plugin model rõ cho HTTP, script, schedule, pause, flow composition.
- **n8n**: mạnh nhất về số lượng app integrations sẵn có: HTTP, Slack, Google, Email, DB, webhook, SaaS nodes.

**Đánh giá thực tế:**  
Nếu flow chủ yếu là gọi API/SaaS + approval, n8n rất nhanh. Nếu flow là browser RPA có state phức tạp, app integrations không phải yếu tố quyết định.

## 12. Developer Experience (local + coding style)

- **Trigger.dev**: code-first JS/TS, refactor/test thuận lợi nhất cho dev.
- **Kestra**: config-first YAML, ít code cho orchestration, rõ cho operator.
- **n8n**: visual-first, nhanh cho prototype nhưng workflow lớn dễ khó review và versioning.

## 13. MCP / AI coding workflow / rules support

- **Trigger.dev**: thân thiện hơn với AI coding workflow/code-agent ecosystem.
- **Kestra**: có AI authoring aids riêng, nhưng vẫn thiên về flow orchestration hơn dev-centric code workflow.
- **n8n**: không phải lựa chọn nổi bật nếu mục tiêu là AI coding workflow/rules support.

## 14. Kiến trúc triển khai + cấu hình realtime logs cho từng mô hình

### Nguyên tắc chung

- **Chạy browser bên trong orchestrator task/node/container** → log `stdout/stderr` thường lên dashboard trực tiếp (ít hoặc không cần log bridge).
- **Chạy browser ở service riêng (HTTP job service)** → orchestrator **không tự nghe** stdout/stderr của service đó, cần **log bridge**.

---

### Trigger.dev – 3 mô hình thực tế + cách nhận logs realtime

1. **Cloud + browser chạy trực tiếp trong `task()`**
   - Mục tiêu: nhanh nhất, DX tốt nhất.
   - Logs realtime:
     - Dùng `logger.info()/warn()/error()` trong task.
     - Có thể dùng metadata/streams cho progress chi tiết.
   - Cần log bridge? **Không** (vì browser chạy trong task).

2. **Trigger.dev Cloud + browser automation service riêng**
   - Mục tiêu: giữ credentials/session trong mạng nội bộ.
   - Logs realtime:
     - Browser service emit sự kiện progress dạng JSON (webhook/SSE/poll endpoint).
     - Task Trigger.dev nhận event và re-emit qua `logger`/metadata/streams.
   - Cần log bridge? **Có**.
   - Cấu hình khuyến nghị:
     - Chuẩn event: `{jobId, step, status, message, ts, screenshotUrl?}`
     - Tần suất poll 1–3s hoặc callback theo step.
     - Chỉ đẩy milestone quan trọng để tránh noisy logs.

3. **Trigger.dev self-host/internal + browser chạy trực tiếp trong task**
   - Mục tiêu: code-first + giữ dữ liệu nội bộ.
   - Logs realtime:
     - Giống mô hình (1), logs đi thẳng lên dashboard self-host.
   - Cần log bridge? **Không**.

---

### Kestra – 3 mô hình thực tế + cách nhận logs realtime

1. **Kestra self-host + browser script/container ngay trong flow**
   - Mục tiêu: dễ demo, ít thành phần.
   - Logs realtime:
     - In log từ script trực tiếp (`print`, stdout/stderr) để Kestra execution logs nhận theo thời gian chạy.
     - Có thể chia task nhỏ (login/search/compare/submit) để log dễ đọc hơn.
   - Cần log bridge? **Không**.

2. **Kestra self-host + browser automation service riêng**
   - Mục tiêu: bền vững cho nhiều hotel adapters.
   - Logs realtime:
     - Flow Kestra gọi `startJob` → poll `getJobStatus` hoặc nhận callback.
     - Mỗi lần poll/callback, ghi milestone vào execution logs (Log task / output mapping).
   - Cần log bridge? **Có**.
   - Cấu hình khuyến nghị:
     - Browser service trả `progressPercent`, `currentStep`, `lastMessage`, `artifacts`.
     - Kestra poll đều (vd 2s) + timeout rõ ràng.
     - Không bơm raw HTML/log dài; chỉ lưu milestone + artifact URL.

3. **Kestra Cloud/Enterprise + browser service nội bộ**
   - Mục tiêu: control plane cloud, browser vẫn ở nội bộ.
   - Logs realtime:
     - Tương tự mô hình (2): bắt buộc log bridge qua polling/callback.
   - Cần log bridge? **Có**.

---

### n8n – 3 mô hình thực tế + cách nhận logs realtime

1. **n8n + HTTP/API integration + approval nhẹ**
   - Logs realtime:
     - N8n chủ yếu hiển thị kết quả theo node/execution.
     - Với job dài, nên update trạng thái qua các node polling định kỳ.
   - Cần log bridge? **Thường có** nếu browser ở service riêng.

2. **n8n + browser automation service riêng**
   - Logs realtime:
     - Webhook/poll status từ browser service rồi map vào node data.
   - Cần log bridge? **Có**.

3. **n8n + chạy Playwright trực tiếp qua Code node / Execute Command node / custom node-container**
   - Logs realtime:
     - Có thể gói trọn flow Playwright end-to-end trong một node duy nhất.
     - Output browser hiện trực tiếp trong execution log của node đó.
   - Cần log bridge? **Không** – browser chạy ngay trong n8n, không có service riêng.
   - Lưu ý: n8n coi node này là black box; nếu sau này cần chèn human approval ở giữa flow, buộc phải split node và refactor.

---

### Mẫu cấu hình log bridge tối thiểu (khuyên dùng cho cả 3 tool)

```json
{
  "jobId": "gjm-2026-0001",
  "step": "compare_price",
  "status": "running",
  "message": "Compared Gonjiam vs TAVI",
  "progress": 62,
  "ts": "2026-05-13T10:30:00Z",
  "artifact": {
    "screenshotUrl": "https://...",
    "htmlSnapshotUrl": "https://..."
  }
}
```

**Khuyến nghị vận hành logs:**
- Chỉ ghi milestone: `login_ok`, `search_ok`, `mapping_done`, `price_checked`, `needs_review`, `submitted`, `reservation_captured`, `writeback_done`.
- Sanitize data nhạy cảm trước khi đẩy vào orchestrator logs.
- Bật timeout + retry rõ cho poll/callback path để tránh execution treo.

### Tóm tắt lựa chọn mặc định

- Muốn **ít hệ thống nhất + code-first mạnh** → **Trigger.dev**
- Muốn **operator UI mạnh, orchestration rõ, nhiều hotel flow lâu dài** → **Kestra**
- Muốn **prototype nhanh, visual, approval nhẹ, integration nhanh** → **n8n**

## 15. Can thiệp vào luồng Playwright automation khi sau này muốn sửa đổi

Đây là tiêu chí rất quan trọng nếu flow hôm nay chạy ổn nhưng mai business đổi yêu cầu.

Ví dụ ban đầu viết một script Playwright monolithic:

```text
login → chọn ngày → chọn phòng → so giá → submit → lấy mã đặt phòng → update TAVI
```

Sau đó business yêu cầu thêm bước:

```text
login → chọn ngày → chọn phòng → so giá
→ nếu giá gần ngưỡng, chờ người approve
→ submit → lấy mã đặt phòng → update TAVI
```

### Vấn đề nếu bắt đầu bằng monolithic Playwright script

Nếu toàn bộ browser automation là một “black box task”, orchestrator chỉ thấy:

```text
start browser job → wait done/failed
```

Khi cần thêm approval ở giữa, bạn buộc phải refactor:

- tách script thành nhiều step có checkpoint;
- hoặc cho script gọi callback ra ngoài;
- hoặc script phải tự pause/wait;
- hoặc browser service phải expose state machine/job API.

Nói ngắn gọn: **tool orchestration không thể tự chèn approval vào giữa một hàm Playwright đã chạy nguyên khối**.

### Trigger.dev

Trigger.dev thuận lợi nhất nếu Playwright nằm trực tiếp trong task code. Bạn có thể đặt waitpoint ngay giữa code:

```text
compare price → wait for human input → continue submit
```

**Ưu điểm:**
- dễ truyền arbitrary JSON khi resume;
- dễ làm correction loop;
- code TypeScript giữ browser state/logic gần nhau.

**Nhược điểm:**
- nếu script đã monolithic, vẫn phải refactor;

### Kestra

Kestra hợp nếu flow được thiết kế từ đầu thành các task rõ:

```text
start browser job
→ poll until price compared
→ pause for approval if needed
→ call browser service continue-submit
→ write back
```

**Ưu điểm:**
- operator nhìn rõ từng step;
- pause/resume dễ demo;
- tốt cho nhiều hotel flow/adapters.

**Nhược điểm:**
- nếu browser service chỉ có một endpoint `runEverything()`, Kestra không thể chèn approval ở giữa;
- cần thiết kế browser service có checkpoint/continue API.

### n8n

n8n dễ thêm approval node nếu workflow đã chia nhỏ thành nhiều HTTP/API node. Nhưng nếu Playwright là một Code/Command node chạy nguyên khối, n8n cũng gặp cùng vấn đề black box.

**Ưu điểm:**
- thêm Wait/Form/Slack approval rất nhanh;
- business user dễ hiểu flow đơn giản.

**Nhược điểm:**
- browser state phức tạp không hợp để kéo-thả;
- correction loop nhiều bước dễ làm canvas rối;
- không nên biến n8n thành nơi chứa core Playwright logic dài.

### Hệ quả kiến trúc

Nếu có khả năng requirement sẽ thay đổi, **đừng bắt đầu bằng một Playwright script nguyên khối không checkpoint**.

Thiết kế tốt hơn:

```text
Orchestrator
→ start search/session
→ compare price
→ pause/escalate if needed
→ continue submit
→ capture reservation
→ write back
```

Browser service nên hỗ trợ:
- `startJob`
- `getJobStatus`
- `approveAndContinue`
- `cancelJob`
- `retryWithCorrection`
- structured progress events

Cách này giúp cả Trigger.dev, Kestra, và n8n có thể can thiệp giữa flow khi business đổi yêu cầu.

---

## Kết luận / khuyến nghị

- Nếu mục tiêu là **demo nhanh, nhìn UI rõ, operator experience trực quan, nhiều hotel flow lâu dài**: chọn **Kestra**.
- Nếu team nghiêng **TypeScript + code-first**, cần **embedded Playwright**, hoặc cần **HITL linh hoạt với arbitrary JSON / correction loop**: chọn **Trigger.dev**.
- Nếu mục tiêu là **visual automation đơn giản, approval nhẹ, integration nhanh**, và browser automation chỉ là một service ngoài khá đơn giản: có thể chọn **n8n**.
