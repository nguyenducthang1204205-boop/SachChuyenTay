import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Lược đồ cơ sở dữ liệu (SQLite — Cloudflare D1 khi chạy thật, libsql khi dev/test).
 * Sửa file này rồi chạy `npm run db:generate` để sinh migration SQL mới trong ./migrations —
 * không sửa migration đã phát hành.
 *
 * Quy ước:
 *  - Tiền tệ lưu số nguyên VND.
 *  - Thời gian lưu số mili-giây (integer, mode "timestamp_ms") → Drizzle trả về Date.
 *  - Mảng lưu dạng JSON text; boolean lưu 0/1.
 */

/** Mặc định phía DB (cho câu lệnh SQL viết tay); ứng dụng luôn tự điền thời gian chính xác tới ms. */
const NOW_MS = sql`(cast(strftime('%s','now') as integer) * 1000)`;

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(NOW_MS)
    .$defaultFn(() => new Date());

const timestamps = {
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(NOW_MS)
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
};

const bool = (name: string) => integer(name, { mode: "boolean" });
const stringArray = (name: string) =>
  text(name, { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`)
    .$defaultFn(() => []);

/* ---------- Catalog ---------- */

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull(),
  bgColor: text("bg_color").notNull(),
  fgColor: text("fg_color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps
});

export const bookConditions = sqliteTable("book_conditions", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  level: integer("level").notNull(),
  shortLabel: text("short_label").notNull(),
  description: text("description").notNull(),
  highlights: stringArray("highlights"),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const books = sqliteTable(
  "books",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sku: text("sku").notNull().unique(),
    title: text("title").notNull(),
    author: text("author").notNull(),
    publisher: text("publisher").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onUpdate: "cascade" }),
    conditionId: text("condition_id")
      .notNull()
      .references(() => bookConditions.id),
    price: integer("price").notNull(),
    originalPrice: integer("original_price"),
    publishedYear: integer("published_year"),
    pages: integer("pages"),
    coverFrom: text("cover_from").notNull(),
    coverTo: text("cover_to").notNull(),
    coverInk: text("cover_ink"),
    coverPattern: integer("cover_pattern").notNull().default(0),
    coverImageUrl: text("cover_image_url"),
    rating: real("rating").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    stock: integer("stock").notNull().default(0),
    tags: stringArray("tags"),
    description: text("description").notNull().default(""),
    inspectionNote: text("inspection_note").notNull().default(""),
    /** Văn bản đã bỏ dấu (title, tác giả, NXB, thể loại, tag) phục vụ tìm kiếm không dấu. */
    searchText: text("search_text").notNull().default(""),
    isPublished: bool("is_published").notNull().default(true),
    ...timestamps
  },
  (t) => [
    index("books_category_idx").on(t.categoryId),
    index("books_condition_idx").on(t.conditionId),
    index("books_price_idx").on(t.price),
    index("books_created_at_idx").on(t.createdAt),
    check("books_price_non_negative", sql`${t.price} >= 0`),
    // Chốt chặn chống bán quá số lượng: lệnh trừ kho làm stock < 0 sẽ thất bại → cả batch đặt hàng bị huỷ.
    check("books_stock_non_negative", sql`${t.stock} >= 0`),
    check("books_rating_range", sql`${t.rating} >= 0 AND ${t.rating} <= 5`)
  ]
);

/* ---------- Checkout ---------- */

export const coupons = sqliteTable(
  "coupons",
  {
    code: text("code").primaryKey(),
    label: text("label").notNull(),
    percent: integer("percent").notNull(),
    isActive: bool("is_active").notNull().default(true),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }),
    ...timestamps
  },
  (t) => [check("coupons_percent_range", sql`${t.percent} > 0 AND ${t.percent} <= 100`)]
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    status: text("status").notNull().default("pending"),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address").notNull(),
    note: text("note"),
    paymentMethod: text("payment_method").notNull(),
    couponCode: text("coupon_code").references(() => coupons.code),
    couponLabel: text("coupon_label"),
    couponPercent: integer("coupon_percent"),
    subtotal: integer("subtotal").notNull(),
    discount: integer("discount").notNull(),
    shippingFee: integer("shipping_fee").notNull(),
    total: integer("total").notNull(),
    savings: integer("savings").notNull().default(0),
    idempotencyKey: text("idempotency_key").unique(),
    /** Mã đơn + tên khách (bỏ dấu, chữ thường) + số điện thoại — tìm đơn không dấu ở trang quản trị. */
    searchText: text("search_text").notNull().default(""),
    ...timestamps
  },
  (t) => [index("orders_phone_idx").on(t.phone), index("orders_created_at_idx").on(t.createdAt)]
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    bookId: integer("book_id")
      .notNull()
      .references(() => books.id),
    /** Ảnh chụp tên & giá tại thời điểm mua — không đổi khi sách được sửa sau này. */
    title: text("title").notNull(),
    unitPrice: integer("unit_price").notNull(),
    originalPrice: integer("original_price"),
    quantity: integer("quantity").notNull(),
    lineTotal: integer("line_total").notNull()
  },
  (t) => [index("order_items_order_idx").on(t.orderId), check("order_items_qty_positive", sql`${t.quantity} > 0`)]
);

/* ---------- Engagement ---------- */

export const buybackRequests = sqliteTable(
  "buyback_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reference: text("reference").notNull().unique(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    city: text("city").notNull(),
    method: text("method").notNull(),
    bookList: text("book_list").notNull(),
    bookCount: integer("book_count").notNull(),
    pickup: bool("pickup").notNull().default(false),
    /** Khoá ảnh khách gửi trong kho lưu trữ (R2 / đĩa), ví dụ "buyback/2026/11/<uuid>.webp". */
    photoKeys: stringArray("photo_keys"),
    status: text("status").notNull().default("new"),
    ...timestamps
  },
  (t) => [index("buyback_requests_status_idx").on(t.status)]
);

export const newsletterSubscribers = sqliteTable("newsletter_subscribers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("website"),
  createdAt: createdAt()
});

/* ---------- Quản trị ---------- */

export const adminUsers = sqliteTable("admin_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Định dạng: scrypt$N$r$p$salt$hash (base64url). Không bao giờ lưu mật khẩu gốc. */
  passwordHash: text("password_hash").notNull(),
  isActive: bool("is_active").notNull().default(true),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  ...timestamps
});

export const adminSessions = sqliteTable(
  "admin_sessions",
  {
    /** SHA-256 của token trong cookie — lộ DB cũng không dùng lại được phiên. */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt()
  },
  (t) => [index("admin_sessions_user_idx").on(t.userId), index("admin_sessions_expires_idx").on(t.expiresAt)]
);

/* ---------- Row types ---------- */

export type CategoryRow = typeof categories.$inferSelect;
export type ConditionRow = typeof bookConditions.$inferSelect;
export type BookRow = typeof books.$inferSelect;
export type NewBookRow = typeof books.$inferInsert;
export type CouponRow = typeof coupons.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type AdminUserRow = typeof adminUsers.$inferSelect;
export type BuybackRequestRow = typeof buybackRequests.$inferSelect;
