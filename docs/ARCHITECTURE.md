# Kiến trúc

## Tổng quan

```
 Trình duyệt ──► apps/web (Vite, TS)  ──HTTP/JSON──►  apps/api (Express 5)  ──►  SQLite: Cloudflare D1
                      │                                      │                 (libsql khi dev/test)
                      └──────────── packages/shared ─────────┘
                       schema Zod · kiểu DTO · calculateTotals · estimateBuyback
```

**Nguyên tắc cốt lõi**

1. **Một nguồn sự thật cho hợp đồng** — request/response được định nghĩa một lần trong `@sct/shared`. Đổi một field mà quên một bên → lỗi biên dịch, không phải lỗi lúc chạy.
2. **Server quyết định tiền và tồn kho** — client chỉ hiển thị. Giá, mã giảm giá, phí ship luôn được tính lại ở API bằng cùng hàm `calculateTotals` mà client dùng để hiển thị.
3. **Phụ thuộc hướng vào trong** — routes → service → repository (interface). Service không biết Express hay SQL, nên test và thay hạ tầng dễ dàng.
4. **Fail fast** — cấu hình môi trường, input request đều được kiểm tra bằng Zod tại biên hệ thống.

## Backend — `apps/api`

```
src/
  main.ts              Entrypoint: khởi động server, graceful shutdown
  bootstrap.ts         DB → migrate → seed → container → app (dùng chung cho main & test)
  container.ts         Composition root: nơi duy nhất khởi tạo & nối phụ thuộc (DI thủ công)
  app.ts               Express app: middleware (log, helmet, CORS, JSON), routes, error handler
  config/env.ts        Biến môi trường, kiểm tra bằng Zod
  core/
    errors.ts          AppError: ValidationError, NotFoundError, OutOfStockError, BusinessRuleError…
    http/problem.ts    Mọi lỗi → RFC 9457 Problem Details
    http/validation.ts parseInput(schema, input) — dùng schema từ @sct/shared
    storage/           Port ObjectStorage (lưu ảnh) + adapter đĩa / bộ nhớ (R2 nằm trong worker/)
  db/
    schema.ts          Lược đồ Drizzle (SQLite — nguồn sinh migration)
    client.ts          libsql cho Node (file hoặc :memory:); D1 được nối trong worker/index.ts
    sql.ts             inList (json_each), likeEscaped, isConstraintViolation, BatchStatements
    migrations/        SQL sinh bởi drizzle-kit — dùng cho cả libsql và `wrangler d1 migrations` — KHÔNG sửa tay
    seed/              Dữ liệu nền + sách mẫu; d1-export.ts sinh file SQL nạp vào D1
  modules/<feature>/
    *.repository.ts    Interface (port) + adapter Drizzle
    *.service.ts       Use-case nghiệp vụ, chỉ phụ thuộc interface
    *.routes.ts        HTTP: parse input → gọi service → trả JSON
  worker/              Entry cho Cloudflare Workers (xem mục "Hai môi trường chạy")
test/                  Integration test (supertest) trên SQLite in-memory thật
```

**Hai môi trường chạy — cùng một Express app, khác "vỏ"**

|                 | Node (`main.ts`: dev, Docker)               | Cloudflare Workers (`worker/index.ts`)                                          |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| Nhận request    | `app.listen(PORT)`                          | `handleAsNodeRequest` (lớp `node:http` của Workers) — chỉ `/api/*`, `/health/*` |
| CSDL            | SQLite qua libsql (`DATABASE_URL`)          | D1 qua binding `DB` (dùng chung cho mọi request)                                |
| Migration, seed | Tự chạy lúc khởi động                       | `wrangler d1 migrations apply` + file SQL từ `cli.ts d1-sql` (`cf:setup`)       |
| Cấu hình        | `.env` (`loadDotenv`) + biến môi trường     | `vars`/secret trong `wrangler.jsonc` → `process.env`                            |
| Rate limit      | Đếm trong bộ nhớ (`memoryRateLimiter`)      | Binding Rate Limiting (`worker/rate-limit.ts`)                                  |
| Log             | pino → stdout                               | pino → `console` (Workers Logs)                                                 |
| Ảnh             | Thư mục `UPLOADS_DIR` (`DiskObjectStorage`) | R2 (`worker/r2-storage.ts`), ảnh bìa cache ở edge bằng Cache API                |

Cùng một lược đồ SQLite và cùng thư mục migration cho cả hai môi trường, nên test chạy trên libsql
phản ánh đúng hành vi trên D1. Điểm khác duy nhất cần nhớ: driver D1 của Drizzle chỉ nhận query builder
trong `batch()` (không nhận `db.run(sql)` thô) — luôn viết lệnh ghi bằng `insert/update/delete` + biểu thức `sql`.

**Luồng đặt hàng** (`CheckoutService.placeOrder`)

D1 không có giao dịch tương tác (`BEGIN…COMMIT`, `SELECT … FOR UPDATE`), chỉ có `batch()` — nhiều câu lệnh chạy trong MỘT giao dịch nguyên tử, lỗi một câu thì huỷ cả batch. Thiết kế dựa trên điều đó:

1. Có `Idempotency-Key` đã dùng → trả lại đơn cũ (HTTP 200), không tạo mới.
2. Đọc sách → kiểm tra tồn kho → kiểm tra mã giảm giá → tính tiền (chỉ đọc).
3. Một batch: trừ kho mọi cuốn (một câu lệnh, danh sách truyền qua `json_each`) + ghi `orders` + ghi `order_items` (ảnh chụp tên & giá).
4. Chốt chặn: ràng buộc `CHECK (stock >= 0)`. Nếu ai đó mua mất hàng giữa bước 2 và 3, câu trừ kho vi phạm CHECK → cả batch bị huỷ → đọc lại tồn kho và trả `409 OUT_OF_STOCK` kèm `shortages`. Không bao giờ có đơn nửa vời hay tồn kho âm.
5. Trùng `Idempotency-Key` khi hai request chạy song song → vi phạm UNIQUE → trả đơn của request thắng.

**Huỷ đơn** (`OrderAdminService.changeStatus`) dùng khoá lạc quan: một batch gồm "hoàn kho nếu đơn vẫn ở trạng thái cũ" + "đổi trạng thái nếu vẫn ở trạng thái cũ". Hai quản trị viên huỷ cùng lúc → batch thứ hai không thay đổi gì (409), tồn kho chỉ được hoàn một lần.

**Giới hạn của D1 đã tính tới:** tối đa 100 tham số mỗi câu lệnh (danh sách id truyền bằng một tham số JSON; dòng đơn chia nhóm 12 dòng/câu); gói Free tối đa 50 truy vấn mỗi request (đặt hàng chỉ ~5 truy vấn).

**Ảnh** (`modules/media`)

1. Trình duyệt nén ảnh trước khi gửi (`apps/web/src/lib/image.ts`: thu nhỏ, xoay theo EXIF, xuất WEBP) → server không phải xử lý ảnh, hợp với giới hạn CPU của Workers.
2. `MediaService.store` kiểm tra dung lượng, nhận diện định dạng bằng magic bytes (không tin `Content-Type`), sinh khoá `<nhóm>/<năm>/<tháng>/<uuid>.<đuôi>` rồi ghi qua `ObjectStorage`.
3. Ảnh bìa: công khai tại `/images/covers/…`, cache `immutable` (khoá không bao giờ đổi). Ảnh khách gửi: chỉ qua `/api/v1/admin/media/…` (sau `requireAdmin`).
4. Dọn ảnh: `CatalogAdminService` xoá ảnh bìa cũ sau khi đổi ảnh/xoá sách; `BuybackService` xoá ảnh đã lưu nếu ghi yêu cầu thất bại. Ảnh admin tải lên nhưng không bấm lưu sẽ còn lại (ít, chấp nhận được).

## Frontend — `apps/web`

````
*.html                 Mỗi trang một file (MPA) — tốt cho SEO, mỗi trang tải ít JS
src/
  api/http.ts          fetch có timeout/abort, chuẩn hoá lỗi thành ApiError
  api/endpoints.ts     Bản đồ endpoint, kiểu từ @sct/shared
  services/            Cache & gộp request (thể loại, tình trạng), ghi nhớ sách đã tải
  stores/              cartStore, wishlistStore (localStorage + đồng bộ giữa các tab)
  ui/                  Component thuần: dữ liệu → HTML an toàn (book card, toast, form…)
  layout/              Header, footer, giỏ trượt, hành vi toàn cục (data-* delegation)
  pages/               Logic riêng của từng trang
  lib/html.ts          Template `html```: tự escape mọi giá trị → chống XSS
````

- **Giỏ hàng** lưu ở client kèm "ảnh chụp" sách để hiện ngay; trang thanh toán gọi `/cart/quote` để server xác nhận và `cartStore.reconcile()` cập nhật giá/tồn kho mới, báo người dùng khi có thay đổi.
- **Validation form** dùng chính schema Zod của server → thông điệp lỗi giống nhau ở cả hai phía; lỗi 400 từ server cũng được gắn vào đúng ô nhập.
- **Mỗi khối dữ liệu tự xử lý loading/lỗi** (skeleton, nút "Thử lại"), một API chậm không làm hỏng cả trang.

## Khu vực quản trị

- **Xác thực:** mật khẩu băm bằng scrypt (`modules/auth/password.ts`). Đăng nhập tạo phiên trong bảng `admin_sessions`; cookie `sct_admin` là `HttpOnly` (JS không đọc được) + `SameSite=Strict` (chống CSRF) + `Secure` ở production. DB chỉ lưu SHA-256 của token. Endpoint đăng nhập có rate-limit riêng và trả cùng một thông báo cho sai email / sai mật khẩu.
- **Phân quyền:** `requireAdmin` bọc toàn bộ router `/api/v1/admin` (trừ `/admin/auth/login|logout`).
- **Toàn vẹn dữ liệu:**
  - Không xoá được sách đã có trong đơn hàng (409 `IN_USE`), nên ẩn sách thay vì xoá.
  - Không xoá được thể loại còn sách.
  - Đổi tên thể loại sẽ cập nhật lại `search_text` của sách thuộc thể loại đó.
  - Trạng thái đơn đi theo máy trạng thái `ORDER_TRANSITIONS` (`@sct/shared`). Huỷ đơn thì cộng lại tồn kho trong cùng giao dịch, có khoá dòng đơn.
- **Frontend:** `apps/web/admin.html` + `src/admin/` là một SPA nhỏ, định tuyến bằng hash.
  - Mỗi màn hình là một hàm `view(root, params)` trong `src/admin/views/`.
  - Form dùng chính schema Zod của server (`bookInputSchema`, `categoryInputSchema`).
  - Gặp 401 thì tự quay về màn hình đăng nhập.

## Hướng dẫn mở rộng

**Thêm endpoint / module mới** (ví dụ `reviews`)

1. Định nghĩa schema & kiểu trong `packages/shared/src/contracts/`.
2. Thêm bảng vào `db/schema.ts` → `npm run db:generate`.
3. Tạo `modules/reviews/{reviews.repository,reviews.service,reviews.routes}.ts`.
4. Nối trong `container.ts` và `app.ts`; viết test trong `apps/api/test/`.
5. Thêm hàm vào `apps/web/src/api/endpoints.ts`.

**Lộ trình nâng cấp gợi ý**

| Nhu cầu                                           | Hướng làm                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| Nhiều vai trò quản trị (chủ shop, nhân viên kho…) | Thêm cột `role` vào `admin_users` + middleware `requireRole`             |
| Tài khoản người dùng                              | Module `auth`; đồng bộ giỏ hàng & yêu thích lên server                   |
| Thanh toán online                                 | Port `PaymentGateway` (interface) + adapter VNPay/MoMo, webhook xác nhận |
| Email / Zalo thông báo                            | Phát domain event sau khi đặt hàng → hàng đợi (BullMQ/pg-boss)           |
| SEO trang chi tiết sách                           | Chuyển `apps/web` sang Astro/Next.js (SSR); API & shared giữ nguyên      |
| Tìm kiếm nâng cao                                 | SQLite FTS5 trên cột `search_text` hoặc Cloudflare Vectorize/Meilisearch |
| Tài liệu API                                      | Sinh OpenAPI từ schema Zod                                               |
