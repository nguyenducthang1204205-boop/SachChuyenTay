import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { AppConfig } from "../config/env.js";
import * as schema from "./schema.js";

export type Schema = typeof schema;

/**
 * Kiểu DB chung — repository chỉ phụ thuộc vào kiểu này.
 * Cả hai driver đều là SQLite bất đồng bộ và có `batch()` (chạy nhiều lệnh trong MỘT giao dịch nguyên tử):
 *  - Cloudflare D1 (Workers, production) — xem src/worker/index.ts
 *  - libsql (Node: dev, test, Docker) — file cục bộ hoặc ":memory:"
 * D1 không hỗ trợ giao dịch tương tác (BEGIN…COMMIT), nên mọi thao tác ghi nhiều bước dùng `batch()`.
 */
export type Database = BaseSQLiteDatabase<"async", unknown, Schema> & Pick<LibSQLDatabase<Schema>, "batch">;

export interface DatabaseHandle {
  readonly db: Database;
  readonly driver: "libsql" | "d1";
  migrate(): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}

/** Thư mục migration: src/db/migrations khi dev, dist/migrations khi đã build. */
const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Kết nối SQLite cho tiến trình Node: `file:.data/sct.db` (mặc định), `:memory:` (test).
 * Cùng lược đồ & cùng SQL với D1 trên Cloudflare, nên hành vi dev và production giống nhau.
 */
export async function createDatabase(
  config: Pick<AppConfig, "DATABASE_URL">,
  migrationsFolder = DEFAULT_MIGRATIONS_DIR
): Promise<DatabaseHandle> {
  const url = config.DATABASE_URL;
  if (url.startsWith("file:")) mkdirSync(dirname(url.slice("file:".length)), { recursive: true });

  const client = createClient({ url });
  // SQLite mặc định KHÔNG kiểm tra khoá ngoại; D1 thì luôn bật → bật cho giống nhau.
  await client.execute("PRAGMA foreign_keys = ON");
  const db = drizzle(client, { schema });

  return {
    db: db as unknown as Database,
    driver: "libsql",
    migrate: () => migrate(db, { migrationsFolder }),
    ping: async () => void (await db.run(sql`select 1`)),
    close: async () => client.close()
  };
}
