import { count, sql } from "drizzle-orm";
import { buildSearchText, toSku } from "../../modules/catalog/catalog.search.js";
import type { Database } from "../client.js";
import { bookConditions, books, categories, coupons } from "../schema.js";
import { seedBooks, seedCategories, seedConditions, seedCoupons } from "./data.js";

export interface SeedResult {
  seeded: boolean;
  books: number;
}

/**
 * Dữ liệu nền mà ứng dụng luôn cần: tình trạng sách (không có màn hình quản trị), thể loại mặc định,
 * mã giảm giá chào mừng. Chỉ thêm phần còn thiếu — không ghi đè dữ liệu quản trị viên đã sửa.
 */
export async function seedReferenceData(db: Database): Promise<void> {
  await db.batch([
    db.insert(categories).values(seedCategories).onConflictDoNothing(),
    db.insert(bookConditions).values(seedConditions).onConflictDoNothing(),
    db.insert(coupons).values(seedCoupons).onConflictDoNothing()
  ]);
}

/** Sách mẫu cho dev/demo. Idempotent: bỏ qua nếu đã có sách (trừ khi force). */
export async function seedSampleBooks(db: Database, { force = false } = {}): Promise<SeedResult> {
  const [existing] = await db.select({ n: count() }).from(books);
  if (!force && (existing?.n ?? 0) > 0) return { seeded: false, books: existing?.n ?? 0 };

  const categoryName = new Map(seedCategories.map((c) => [c.id, c.name]));
  await db
    .insert(books)
    .values(
      seedBooks.map((b) => ({
        ...b,
        sku: toSku(b.id!),
        searchText: buildSearchText({
          title: b.title,
          author: b.author,
          publisher: b.publisher,
          categoryName: categoryName.get(b.categoryId) ?? "",
          tags: b.tags ?? []
        })
      }))
    )
    .onConflictDoNothing();
  return { seeded: true, books: seedBooks.length };
}

/** Xoá toàn bộ dữ liệu và đặt lại bộ đếm id (chỉ dùng cho dev/test). */
export async function truncateAll(db: Database): Promise<void> {
  const tables = [
    "admin_sessions",
    "admin_users",
    "order_items",
    "orders",
    "buyback_requests",
    "newsletter_subscribers",
    "books",
    "coupons",
    "book_conditions",
    "categories"
  ];
  await db.batch([
    db.run(sql.raw(`delete from ${tables[0]}`)),
    ...tables.slice(1).map((t) => db.run(sql.raw(`delete from ${t}`))),
    db.run(sql`delete from sqlite_sequence`)
  ]);
}
