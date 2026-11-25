import supertest from "supertest";
import { bootstrap, type Application } from "../src/bootstrap.js";
import { loadConfig } from "../src/config/env.js";

/** Ứng dụng hoàn chỉnh chạy trên SQLite in-memory (libsql — cùng SQL với Cloudflare D1), đã migrate + seed. */
export async function createTestApp(): Promise<Application & { http: ReturnType<typeof supertest> }> {
  const config = loadConfig({
    NODE_ENV: "test",
    UPLOADS_DIR: "memory://",
    DATABASE_URL: ":memory:",
    DB_AUTO_MIGRATE: "true",
    DB_SEED_IF_EMPTY: "true"
  });
  const application = await bootstrap(config);
  return { ...application, http: supertest(application.app) };
}

export const API = "/api/v1";

export const validCustomer = {
  name: "Nguyễn Văn An",
  phone: "0909 123 456",
  email: "an@example.com",
  address: "123 Nguyễn Văn Cừ, Quận 5, TP.HCM"
};
