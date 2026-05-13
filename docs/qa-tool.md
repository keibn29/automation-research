# Tài liệu Yêu cầu Sản phẩm (PRD): Công cụ Kiểm thử AI Tự động (API Focus)

## 1. Overview (Tổng quan)
*   **Mục tiêu**: Xây dựng một công cụ kiểm thử tự động có khả năng đánh giá chất lượng phản hồi của bất kỳ sản phẩm AI nào (chatbot, trợ lý ảo, text generator) thông qua giao tiếp API. 
*   **Vấn đề cốt lõi**: QA đang tốn quá nhiều thời gian để kiểm thử thủ công từng câu hỏi với AI. Công cụ này sẽ tự động hóa việc gọi API gửi câu hỏi và tự động chấm điểm câu trả lời theo các tiêu chuẩn định trước.
*   **Đối tượng phục vụ chính**: QA/Tester. Tập trung vào luồng **API Testing** (không qua giao diện UI) nhằm đảm bảo tốc độ thực thi, tính ổn định và sự tự chủ cho QA (không phụ thuộc vào Developer).

## 2. User Stories & Acceptance Criteria

### User story 1: Chạy kiểm thử tự động từ Testcase (Input Reader & Runner)
**User Story**: Là một QA, tôi muốn công cụ tự động nạp danh sách câu hỏi từ file Testcase, tự gọi API và nhận kết quả.

**Acceptance Criteria**:
```gherkin
Given QA đã đặt file testcase (chứa Input và Expected Result) vào thư mục đầu vào
When QA gõ lệnh thực thi công cụ
Then công cụ duyệt qua tuần tự từng dòng dữ liệu trong testcase
And gọi API tới hệ thống AI cho từng câu hỏi
And bóc tách (extract) câu trả lời của AI từ trong JSON Response trả về
```

### User story 2: Chấm điểm tự động
**User Story**: Là một QA, tôi muốn sử dụng một AI thông minh khác (VD: GPT-4, Minimax) để làm "Giám khảo" chấm điểm câu trả lời của AI mục tiêu đối với các câu hỏi mở.

**Acceptance Criteria**:
```gherkin
Given câu trả lời thực tế từ AI mục tiêu đã được nhận về thành công
When phương pháp kiểm tra (Checking Method) trong testcase được đặt là "Smart AI Judge"
Then công cụ sẽ gửi bộ 3 dữ liệu: "Câu hỏi", "Câu trả lời thực tế", "Kết quả mong đợi" tới AI Giám khảo
    And AI Giám khảo phải trả về phán quyết cuối cùng (PASS, WARNING, hoặc FAIL) kèm theo Lý do giải thích chi tiết
```

### User story 3: Xem báo cáo kết quả chi tiết
**User Story**: Là một QA, tôi muốn xem báo cáo kết quả kiểm thử một cách chi tiết để đánh giá được chất lượng mô hình AI và dễ dàng phân tích nguyên nhân lỗi.

**Acceptance Criteria**:
```gherkin
Given hệ thống đã hoàn tất việc chạy và đánh giá toàn bộ các testcase trong phiên kiểm thử
When hệ thống tiến hành tổng hợp dữ liệu đầu ra
Then xuất ra báo cáo tổng quan bao gồm Tổng số testcase, Số lượng Pass/Warning/Fail, Tỷ lệ Pass Rate
    And liệt kê chi tiết từng testcase với thông tin: Input, Expected, Actual Output, và Trạng thái (Pass/ Warning/ Fail)
    And cung cấp lý do (Reason) rõ ràng đối với tất cả các testcase bị đánh giá là Warning hoặc Fail
```

## 3. Functional Requirements (Yêu cầu Chức năng)
1. **Input Reader**: Hỗ trợ nạp và phân tích cú pháp (parse) dữ liệu từ file định dạng YAML. Có khả năng tự động bóc tách các trường thông tin lõi (như Input, Expected Result, Checking Method) của từng block testcase để chuyển vào luồng kiểm thử.
2. **API Connector**: Giao tiếp thông qua giao thức REST API. Hỗ trợ cấu hình Headers động và chèn biến linh hoạt vào Payload Body.
3. **Evaluation Engine**: Hỗ trợ tối thiểu 3 phương pháp xác thực kết quả:
   - *Exact Match*: Khớp chuỗi ký tự tuyệt đối (100%).
   - *Keyword Match*: Tìm kiếm sự tồn tại của (các) từ khóa bắt buộc trong câu trả lời.
   - *Smart AI Judge*: Sử dụng LLM-as-a-judge để chấm điểm ngữ nghĩa.
4. **Report Generator**: Xuất báo cáo trực tiếp ra giao diện Console hiển thị: Tổng số Testcase, Số lượng Pass/Fail/Warning, và chi tiết nguyên nhân (Lý do) của các case bị Fail.

### 3.1. User Flow (Luồng xử lý)
1. **Start**: QA thực thi lệnh khởi chạy công cụ (Ví dụ: qua Terminal/Console).
2. **Read**: Công cụ đọc file cấu hình API và nạp toàn bộ danh sách Testcase.
3. **Loop**: Duyệt qua từng Testcase:
   - **Send**: Nhúng câu hỏi vào Payload Template và gọi API request tới AI mục tiêu.
   - **Receive**: Nhận kết quả phản hồi (JSON Response) từ AI.
   - **Evaluate**: Chuyển câu trả lời thực tế vào Evaluation Engine để so khớp với kết quả mong đợi.
   - **Log**: Ghi nhận trạng thái PASS/WARNING/FAIL cho testcase hiện tại.
4. **End**: Kết thúc vòng lặp, tổng hợp dữ liệu và in báo cáo cuối cùng.

### 3.2. Input & Output
**Dữ liệu Đầu vào (Input)**:
- **File Testcase (`.yaml` / `.csv`)**: Danh sách các kịch bản kiểm thử (bao gồm Câu hỏi, Kết quả mong đợi, và Phương pháp chấm).
- **File Cấu hình (Config)**: Các tham số kết nối API (Endpoint URL, Token/API Key, Payload Template).

**Dữ liệu Đầu ra (Output)**:
- **Real-time Log**: Log chi tiết theo thời gian thực trên màn hình Console (đang chạy case nào, câu trả lời của AI là gì, kết quả tức thời).
- **Summary Report**: Báo cáo tổng kết khi kết thúc phiên kiểm thử. Định dạng báo cáo cần bao gồm các thông tin:
  - **Execution Summary (Tổng quan):** 
    - Tổng số Testcase đã chạy.
    - Số lượng Passed / Warning / Failed.
  - **Testcase Details (Chi tiết kết quả):**
    - ID/Name Testcase.
    - Câu hỏi / Prompt (Input).
    - Kết quả mong đợi (Expected).
    - Phản hồi thực tế của AI mục tiêu (Actual Output).
    - Trạng thái đánh giá (PASS /WARNING / FAIL ).
    - **Lý do (Reason):** Bắt buộc hiển thị chi tiết nguyên nhân đối với các case Warning và Fail (Ví dụ: Thiếu từ khóa mong đợi, Trả lời đúng một phần, Nhận xét chi tiết từ AI Judge, mã lỗi API).
  - **Export Format (Định dạng xuất):** In ra Console Text trực quan (mặc định), có thể mở rộng lưu thành file (Markdown, HTML, CSV, EXCEL).

## 4. Business Rules & Error Handling 

| Condition (Điều kiện) | Action (Hành động của Hệ thống) | Notification / Log Message (Thông báo) |
| :--- | :--- | :--- |
| File testcase bị thiếu, trống hoặc sai định dạng YAML | Dừng chạy toàn bộ process và báo lỗi | `[ERROR] Không tìm thấy test case hoặc file sai định dạng. Vui lòng kiểm tra lại.` |
| AI mục tiêu không phản hồi (API Timeout) | Đánh dấu bài test hiện tại là **"Fail (Timeout)"** và nhảy sang chạy câu hỏi tiếp theo | `[WARN] API Timeout. AI không phản hồi trong thời gian giới hạn.` |
| AI mục tiêu trả về mã lỗi HTTP (VD: 500, 401, 403) | Đánh dấu bài test là **"Fail (API Error)"**, ghi nhận mã lỗi và nhảy sang câu tiếp theo | `[WARN] API Error: Hệ thống trả về mã lỗi [HTTP Status Code].` |
| Luật kiểm tra là "Keyword Match" nhưng AI trả lời thiếu từ khóa | Đánh dấu bài test là **"Fail"** | `[RESULT] Fail: Không tìm thấy từ khóa mong đợi '[Keyword]'.` |
| "Smart AI Judge" đánh giá câu trả lời đúng một phần, hoặc có chứa thông tin thừa rủi ro | Đánh dấu bài test là **"Warning"** | `[RESULT] Warning: Câu trả lời tạm chấp nhận nhưng có rủi ro/thiếu sót. Lý do: [Reason]` |
| "Smart AI Judge" đánh giá câu trả lời không chính xác/lạc đề | Đánh dấu bài test là **"Fail (Low Quality)"** | `[RESULT] Fail: Giám khảo AI xác định câu trả lời không chính xác. Lý do: [Reason]` |