import type { Express } from "express";
import { createApp } from "./app.js";
import type { AppConfig } from "./config/env.js";
import { createContainer, type Container } from "./container.js";
import { createLogger } from "./core/logger.js";
import { DiskObjectStorage } from "./core/storage/disk-storage.js";
import { MemoryObjectStorage } from "./core/storage/memory-storage.js";
import { createDatabase, type DatabaseHandle } from "./db/client.js";
import { seedReferenceData, seedSampleBooks } from "./db/seed/seed.js";

export interface Application {
  app: Express;
  container: Container;
  database: DatabaseHandle;
}

/** Khởi tạo ứng dụng trên Node (DB → migrate → seed → DI → Express). Dùng chung cho main.ts và test. */
export async function bootstrap(config: AppConfig): Promise<Application> {
  const logger = createLogger(config);
  const database = await createDatabase(config);

  if (config.DB_AUTO_MIGRATE) {
    await database.migrate();
    logger.info({ driver: database.driver }, "Database migrated");
  }
  // Dữ liệu nền (thể loại, tình trạng sách, mã giảm giá) luôn cần; chỉ thêm phần còn thiếu.
  await seedReferenceData(database.db);
  if (config.DB_SEED_IF_EMPTY) {
    const result = await seedSampleBooks(database.db);
    if (result.seeded) logger.info({ books: result.books }, "Database seeded with sample data");
  }

  const storage =
    config.UPLOADS_DIR === "memory://" ? new MemoryObjectStorage() : new DiskObjectStorage(config.UPLOADS_DIR);
  const container = createContainer(config, database, logger, { storage });
  const created = await container.admin.auth.ensureInitialAdmin({
    email: config.ADMIN_EMAIL,
    password: config.ADMIN_PASSWORD,
    name: config.ADMIN_NAME
  });
  if (created && !config.isProduction) {
    logger.warn(`Đã tạo tài khoản quản trị mặc định: ${config.ADMIN_EMAIL} — hãy đổi mật khẩu khi triển khai thật.`);
  }
  return { app: createApp(container), container, database };
}
