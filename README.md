# Sách Chuyền Tay

Nền tảng mua bán sách cũ: **web storefront** (Vite + TypeScript) và **REST API** (Express 5 + Drizzle ORM + SQLite), tổ chức thành monorepo. Chạy thật trên **Cloudflare**: Workers + D1 (CSDL) + R2 (ảnh).

```
apps/
  web/        @sct/web    — giao diện người dùng (multi-page, không framework)
  api/        @sct/api    — REST API /api/v1
packages/
  shared/     @sct/shared — hợp đồng dùng chung: schema Zod, kiểu dữ liệu, quy tắc tính tiền
docs/ARCHITECTURE.md      — kiến trúc, quy ước, hướng dẫn mở rộng
```

## Yêu cầu

- Node.js ≥ 22.12 (khuyến nghị 24, xem `.nvmrc`)
- Không cần cài CSDL khi dev: API dùng **SQLite** (libsql) lưu ở `apps/api/.data/sct.db` — cùng lược đồ & SQL với Cloudflare D1.

## Chạy dự án

```bash
npm install
npm run dev          # API :4000 + Web :5173 (Vite proxy /api → API)
```

Mở http://localhost:5173. Lần chạy đầu API tự chạy migration và seed 24 đầu sách mẫu.

**Trang quản trị:** http://localhost:5173/admin.html — tài khoản dev mặc định `admin@sachchuyentay.vn` / `admin12345`.
Quản lý sách (thêm / sửa / ẩn / xoá, xem trước bìa), thể loại, đơn hàng (đổi trạng thái, huỷ đơn tự hoàn kho), yêu cầu thu mua và dashboard.
Production: đặt `ADMIN_EMAIL` + `ADMIN_PASSWORD` để tạo tài khoản đầu tiên.

| Lệnh                             | Việc                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                    | Chạy cả web và api ở chế độ dev (hot reload)                                   |
| `npm run check`                  | Lint + typecheck + test toàn bộ (giống CI)                                     |
| `npm test`                       | Test (shared: unit, api: integration trên SQLite in-memory)                    |
| `npm run build`                  | Build production (`apps/api/dist`, `apps/web/dist`)                            |
| `npm run db:generate`            | Sinh migration SQL sau khi sửa `apps/api/src/db/schema.ts`                     |
| `npm run db:migrate` / `db:seed` | Chạy migration / seed dữ liệu mẫu                                              |
| `npm run db:reset -w @sct/api`   | Xoá sạch và seed lại DB dev                                                    |
| `docker compose up --build`      | Chạy bằng Node trong Docker: API (SQLite) + Nginx (http://localhost:8080)      |
| `npm run cf:dev`                 | Chạy bản Cloudflare trên máy: Worker + D1 + R2 giả lập (http://localhost:8788) |
| `npm run cf:setup`               | Triển khai lần đầu lên Cloudflare (xem mục bên dưới)                           |
| `npm run cf:deploy`              | Migration D1 + build web + deploy Worker (các lần sau)                         |

Cấu hình qua biến môi trường — xem [apps/api/.env.example](apps/api/.env.example) và [apps/web/.env.example](apps/web/.env.example). API kiểm tra cấu hình lúc khởi động và dừng ngay nếu sai.

## Triển khai lên Cloudflare

Toàn bộ nằm trong Cloudflare — một Worker phục vụ web, API và ảnh trên cùng domain ([wrangler.jsonc](wrangler.jsonc)):

```
Trình duyệt ──► Cloudflare ──┬─ /api/*, /health/*, /images/* ──► Worker (Express, apps/api/src/worker) ──┬─► D1 (SQLite: sách, đơn hàng…)
                             │                                                                            └─► R2 (ảnh)
                             └─ còn lại ─────────────────────► file tĩnh apps/web/dist (/shop → shop.html)
```

**Lần đầu**

1. Đăng nhập Cloudflare: `npx wrangler login`.
2. `cp .env.production.example .env.production` rồi điền `ADMIN_EMAIL`, `ADMIN_PASSWORD` (≥ 12 ký tự); đặt `SEED_SAMPLE_DATA=true` nếu muốn có sẵn 24 sách mẫu. File này không được commit.
3. `npm run cf:setup` — tạo CSDL D1 (vùng châu Á – Thái Bình Dương) và ghi `database_id` vào `wrangler.jsonc`, chạy migration, nạp dữ liệu nền + tài khoản quản trị, tạo bucket R2 `sach-chuyen-tay-media`, build và deploy. Commit `wrangler.jsonc` sau bước này. Chạy lại lệnh này bất cứ lúc nào cũng an toàn.

**Các lần sau:** `npm run cf:deploy` (tự chạy migration D1 mới rồi deploy) — hoặc workflow **Deploy** trên GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)).

**Chạy thử bản Cloudflare trên máy:** `npm run cf:dev` → http://localhost:8788 (D1 và R2 giả lập trong `.wrangler/state`, tài khoản dev mặc định).

**Lưu ý**

- **Gói Workers Free giới hạn 10 ms CPU mỗi request.** Đăng nhập quản trị băm mật khẩu bằng scrypt (~40 ms CPU), nên có thể bị Cloudflare từ chối (lỗi 1102). Trang bán hàng thường nằm trong giới hạn. Dùng gói Workers Paid (5 USD/tháng, 30 giây CPU) cho production.
- D1 gói miễn phí: 5 GB, 5 triệu lượt đọc dòng và 100.000 lượt ghi dòng mỗi ngày. R2 gói miễn phí: 10 GB, 1 triệu lượt ghi, 10 triệu lượt đọc mỗi tháng, không tính phí băng thông.
- Sao lưu D1: Cloudflare tự giữ lịch sử 30 ngày (Time Travel) — khôi phục bằng `npx wrangler d1 time-travel restore DB --timestamp=…`; xuất file: `npx wrangler d1 export DB --remote --output=backup.sql`.
- Xem/sửa dữ liệu trực tiếp: `npx wrangler d1 execute DB --remote --command "select count(*) from orders"`, hoặc Dashboard → D1.
- Rate limit dùng binding Cloudflare (ngưỡng đặt trong `wrangler.jsonc` → `ratelimits`), đếm gần đúng theo từng vùng.
- Ảnh bìa được cache ở edge khi dùng tên miền riêng (Cache API không hoạt động trên `*.workers.dev`).
- Log xem ở Cloudflare Dashboard → Workers → `sach-chuyen-tay` → Logs (đã bật `observability`).
- Gắn tên miền riêng: Dashboard → Worker → Settings → Domains & Routes.

## Ảnh

- **Ảnh bìa** — trong form sách (admin) bấm **Tải ảnh lên**: trình duyệt nén về WEBP (cạnh dài ≤ 1200px, ≤ 2 MB), gửi lên `POST /api/v1/admin/uploads/cover`, rồi điền URL `/images/covers/…` vào ô ảnh bìa. Vẫn có thể dán URL `https://` bên ngoài. Thay ảnh hoặc xoá sách thì ảnh cũ được xoá khỏi kho lưu trữ.
- **Ảnh khách gửi** — trang Bán sách cho đính kèm tối đa 4 ảnh (nén ≤ 1600px, ≤ 450 KB/ảnh), gửi cùng yêu cầu thu mua. Chỉ quản trị xem được (`/api/v1/admin/media/…`). Lưu yêu cầu thất bại thì ảnh đã lưu bị xoá theo.
- **An toàn:** server nhận diện định dạng bằng nội dung file (magic bytes), chỉ nhận WEBP/JPEG/PNG (không SVG), tên file do server sinh (UUID).
- **Nơi lưu:** R2 trên Cloudflare; `apps/api/.data/uploads` khi chạy `npm run dev` (đổi bằng `UPLOADS_DIR`); volume `data` khi chạy Docker.

## API

Tiền tố `/api/v1`. Lỗi luôn trả về dạng [RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457) (`application/problem+json`) kèm `code` và `requestId`.

| Method | Endpoint                         | Mô tả                                                                                                                                                                                                                   |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/books`                         | Danh sách sách. Query: `q` (không dấu), `category`, `condition` (csv), `ids`, `minPrice`, `maxPrice`, `inStock=1`, `sort` (`featured\|newest\|price-asc\|price-desc\|discount\|rating\|bestseller`), `page`, `pageSize` |
| GET    | `/books/:id`                     | Chi tiết sách                                                                                                                                                                                                           |
| GET    | `/books/:id/related?limit=4`     | Sách liên quan                                                                                                                                                                                                          |
| GET    | `/categories` · `/conditions`    | Thể loại / tình trạng kèm số đầu sách                                                                                                                                                                                   |
| POST   | `/cart/quote`                    | Báo giá giỏ: kiểm tra tồn kho, áp mã giảm giá, tính tổng                                                                                                                                                                |
| POST   | `/orders`                        | Đặt hàng (header `Idempotency-Key` để chống tạo trùng)                                                                                                                                                                  |
| POST   | `/buyback-requests`              | Gửi yêu cầu thu mua sách cũ, kèm tối đa 4 ảnh (`photos`: data URL base64)                                                                                                                                               |
| POST   | `/newsletter/subscriptions`      | Đăng ký bản tin                                                                                                                                                                                                         |
| GET    | `/health/live` · `/health/ready` | Health check (ngoài tiền tố `/api/v1`)                                                                                                                                                                                  |
| GET    | `/images/covers/…`               | Ảnh bìa đã tải lên (ngoài tiền tố `/api/v1`, cache `immutable`)                                                                                                                                                         |

**API quản trị** (`/api/v1/admin/*`, yêu cầu đăng nhập — cookie phiên HttpOnly): `POST /admin/auth/login|logout`, `GET /admin/auth/me`, `GET /admin/dashboard`, CRUD `/admin/books` và `/admin/categories`, `GET /admin/orders`, `PATCH /admin/orders/:id/status`, `GET /admin/buyback-requests`, `PATCH /admin/buyback-requests/:id/status`, `POST /admin/uploads/cover` (body là file ảnh, `Content-Type: image/webp|jpeg|png`), `GET /admin/media/<key>`.

Mã giảm giá mẫu: `CHUYENTAY10` (10%), `DOCXANH` (15%).

## Thư mục `_legacy-static/`

Bản web tĩnh cũ, giữ lại để đối chiếu. Đã bị `.gitignore`; xoá khi không cần nữa.
# SachChuyenTay
