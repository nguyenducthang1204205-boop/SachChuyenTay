import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

/**
 * Tiện ích SQL cho SQLite / Cloudflare D1.
 *
 * D1 giới hạn 100 tham số mỗi câu lệnh, nên danh sách giá trị được truyền dưới dạng MỘT tham số JSON
 * và mở ra bằng `json_each` — không phụ thuộc độ dài danh sách.
 */
export const inList = (column: SQLWrapper, values: readonly (string | number)[]): SQL =>
  sql`${column} in (select value from json_each(${JSON.stringify(values)}))`;

/** LIKE với ký tự escape `\` (SQLite không có ký tự escape mặc định) — dùng cùng `escapeLike`. */
export const likeEscaped = (column: SQLWrapper, pattern: string): SQL => sql`${column} like ${pattern} escape '\\'`;

/** Mảng không rỗng — kiểu mà `db.batch()` yêu cầu. */
export type BatchStatements = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];

/**
 * Lỗi vi phạm ràng buộc (CHECK / UNIQUE…) từ libsql hoặc D1. Drizzle bọc lỗi gốc trong `cause`,
 * và mỗi driver ghi thông điệp hơi khác nhau, nên duyệt cả chuỗi `cause` và so khớp thông điệp SQLite.
 */
export function isConstraintViolation(err: unknown, pattern: RegExp): boolean {
  for (let e = err, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
    if (pattern.test(String((e as { message?: unknown }).message ?? ""))) return true;
  }
  return false;
}
