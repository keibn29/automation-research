# Kestra — News Monitor Approval Bot

Kestra flow definitions for the News Monitor Approval Bot demo.

## File cấu trúc

```
kestra/
├── README.md                  ← File này (tổng quan ngắn)
├── flows/
│   ├── news_scrape_flow.yaml  ← Flow cho một keyword (manual trigger)
│   └── news_scheduled_scan.yaml ← Flow scan định kỳ (cron + manual)
```

## Yêu cầu

- **Docker Desktop** (Kestra chạy trong container)
- **Demo server** tại `http://localhost:3100`

## Quick start

```bash
# 1. Start demo server
npm start

# 2. Start Kestra với Docker Compose
docker compose up -d
# Hoặc: curl -o docker-compose.yml https://raw.githubusercontent.com/kestra-io/kestra/develop/docker-compose.yml
#       docker compose up -d

# 3. Upload flows vào Kestra
#    Mở http://localhost:8080 → Flows → Create → paste nội dung YAML

# 4. Trigger flow manually từ UI
```

## Tài liệu chi tiết

Xem `docs/kestra.md` (tiếng Việt) cho hướng dẫn đầy đủ.
