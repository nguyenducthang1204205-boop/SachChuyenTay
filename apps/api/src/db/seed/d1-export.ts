import { sql } from "drizzle-orm";
import type { AppConfig } from "../../config/env.js";
import type { Logger } from "../../core/logger.js";
import { DrizzleAuthRepository } from "../../modules/auth/auth.repository.js";
import { AuthService } from "../../modules/auth/auth.service.js";
import { createDatabase } from "../client.js";
import { seedReferenceData, seedSampleBooks } from "./seed.js";

/**
 * Sinh file SQL để nạp dữ liệu ban đầu vào Cloudflare D1 (`wrangler d1 execute --file`).
 *
 * D1 không kết nối được từ Node, nên dữ liệu được tạo trên một SQLite tạm trong bộ nhớ bằng CHÍNH code seed
 * và AuthService (băm mật khẩu scrypt) của ứng dụng, rồi xuất thành câu lệnh INSERT. Chạy lại an toàn:
 *  - dữ liệu nền / sách mẫu: INSERT OR IGNORE (không ghi đè dữ liệu đã có)
 *  - tài khoản quản trị: chỉ tạo khi D1 chưa có tài khoản nào
 */
export async function buildD1SeedSql(
  config: Pick<AppConfig, "ADMIN_EMAIL" | "ADMIN_PASSWORD" | "ADMIN_NAME" | "ADMIN_SESSION_TTL_HOURS">,
  options: { sample: boolean; logger: Logger }
): Promise<{ sql: string; admin: boolean; books: number }> {
  const handle = await createDatabase({ DATABASE_URL: ":memory:" });
  try {
    await handle.migrate();
    const { db } = handle;
    await seedReferenceData(db);
    const sample = options.sample ? await seedSampleBooks(db) : { books: 0 };
    const admin = await new AuthService(
      new DrizzleAuthRepository(db),
      config.ADMIN_SESSION_TTL_HOURS,
      options.logger
    ).ensureInitialAdmin({ email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD, name: config.ADMIN_NAME });

    const out: string[] = ["-- Sinh bởi: tsx src/db/cli.ts d1-sql — dữ liệu ban đầu cho Cloudflare D1", ""];
    for (const table of ["categories", "book_conditions", "coupons", "books"]) {
      for (const row of await rows(db, table)) {
        const cols = Object.keys(row);
        out.push(
          `INSERT OR IGNORE INTO "${table}" (${cols.map(quoteId).join(", ")}) VALUES (${cols.map((c) => literal(row[c])).join(", ")});`
        );
      }
    }
    for (const row of await rows(db, "admin_users")) {
      const cols = Object.keys(row).filter((c) => c !== "id");
      out.push(
        `INSERT INTO "admin_users" (${cols.map(quoteId).join(", ")}) SELECT ${cols.map((c) => literal(row[c])).join(", ")} ` +
          `WHERE NOT EXISTS (SELECT 1 FROM "admin_users");`
      );
    }
    return { sql: out.join("\n") + "\n", admin, books: sample.books };
  } finally {
    await handle.close();
  }
}

type Row = Record<string, unknown>;

const rows = (db: Awaited<ReturnType<typeof createDatabase>>["db"], table: string) =>
  db.all<Row>(sql.raw(`select * from "${table}" order by rowid`));

const quoteId = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Giá trị SQLite → literal SQL an toàn (chuỗi được nhân đôi dấu nháy đơn). */
function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}
