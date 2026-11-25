/* eslint-disable no-console */
/**
 * CLI quản trị CSDL:  tsx src/db/cli.ts <lệnh>
 *
 * CSDL SQLite cục bộ (DATABASE_URL, mặc định file:.data/sct.db) — dev, test, Docker:
 *  - migrate : chạy migration + dữ liệu nền + tài khoản quản trị đầu tiên (ADMIN_EMAIL / ADMIN_PASSWORD)
 *  - seed    : như migrate + sách mẫu (nếu đang trống)
 *  - reset   : migrate + xoá sạch + seed lại (KHÔNG dùng ở production)
 *
 * Cloudflare D1:
 *  - d1-sql --out <file> [--sample] : sinh file SQL dữ liệu ban đầu để chạy bằng `wrangler d1 execute`
 *    (migration của D1 chạy bằng `wrangler d1 migrations apply`, xem scripts/cf-setup.mjs)
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { loadDotenv } from "../config/dotenv.js";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../core/logger.js";
import { DrizzleAuthRepository } from "../modules/auth/auth.repository.js";
import { AuthService } from "../modules/auth/auth.service.js";
import { createDatabase } from "./client.js";
import { buildD1SeedSql } from "./seed/d1-export.js";
import { seedReferenceData, seedSampleBooks, truncateAll } from "./seed/seed.js";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" }, sample: { type: "boolean", default: false } }
});
const command = positionals[0] ?? "migrate";
loadDotenv();
const config = loadConfig();
const logger = createLogger({ ...config, LOG_LEVEL: "warn" });

if (command === "d1-sql") {
  if (!values.out) {
    console.error("✖ Thiếu --out <file>");
    process.exit(1);
  }
  const result = await buildD1SeedSql(config, { sample: values.sample, logger });
  writeFileSync(values.out, result.sql, "utf8");
  console.log(
    `✔ Đã sinh ${values.out}: dữ liệu nền${result.books ? ` + ${result.books} sách mẫu` : ""}` +
      (result.admin
        ? ` + tài khoản quản trị ${config.ADMIN_EMAIL}`
        : " (không có tài khoản quản trị — thiếu ADMIN_EMAIL/ADMIN_PASSWORD)")
  );
  process.exit(0);
}

if (command === "reset" && config.isProduction) {
  console.error("✖ Không cho phép reset CSDL ở môi trường production.");
  process.exit(1);
}

const handle = await createDatabase(config);
try {
  await handle.migrate();
  console.log(`✔ Đã chạy migration (${handle.driver}).`);
  if (command === "reset") await truncateAll(handle.db);
  await seedReferenceData(handle.db);

  const created = await new AuthService(
    new DrizzleAuthRepository(handle.db),
    config.ADMIN_SESSION_TTL_HOURS,
    logger
  ).ensureInitialAdmin({ email: config.ADMIN_EMAIL, password: config.ADMIN_PASSWORD, name: config.ADMIN_NAME });
  if (created) console.log(`✔ Đã tạo tài khoản quản trị ${config.ADMIN_EMAIL}.`);

  if (command === "seed" || command === "reset") {
    const result = await seedSampleBooks(handle.db);
    console.log(
      result.seeded ? `✔ Đã seed ${result.books} đầu sách.` : `• Đã có ${result.books} đầu sách — bỏ qua seed.`
    );
  }
} catch (err) {
  console.error("✖ Lỗi:", err);
  process.exitCode = 1;
} finally {
  await handle.close();
}
