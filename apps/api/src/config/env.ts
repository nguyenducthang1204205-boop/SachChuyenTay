import { z } from "zod";

/**
 * Cấu hình ứng dụng — đọc từ biến môi trường, kiểm tra bằng Zod và đóng băng.
 * Ứng dụng KHÔNG khởi động nếu cấu hình sai (fail fast), thay vì lỗi ngầm lúc chạy.
 */

const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    /** SQLite (libsql) khi chạy bằng Node: "file:<đường dẫn>" hoặc ":memory:" (test). Workers dùng D1. */
    DATABASE_URL: z
      .string()
      .regex(/^(file:.+|:memory:)$/, 'DATABASE_URL phải có dạng "file:<đường dẫn>" hoặc ":memory:"')
      .default("file:.data/sct.db"),
    DB_AUTO_MIGRATE: z.string().optional(),
    /** Thư mục lưu ảnh tải lên khi chạy bằng Node ("memory://" = trong bộ nhớ, cho test). Workers dùng R2. */
    UPLOADS_DIR: z.string().default(".data/uploads"),
    DB_SEED_IF_EMPTY: z.string().optional(),

    CORS_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    WRITE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),

    WELCOME_COUPON_CODE: z.string().trim().toUpperCase().default("CHUYENTAY10"),

    /** Tài khoản quản trị đầu tiên — chỉ được tạo khi hệ thống chưa có tài khoản nào. */
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD phải có ít nhất 8 ký tự").optional(),
    ADMIN_NAME: z.string().default("Quản trị viên"),
    ADMIN_SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(12)
  })
  .transform((env) => {
    const isProd = env.NODE_ENV === "production";
    return {
      ...env,
      // Dev/test có sẵn tài khoản mặc định để dùng ngay; production BẮT BUỘC tự đặt qua biến môi trường.
      ADMIN_EMAIL: env.ADMIN_EMAIL ?? (isProd ? undefined : "admin@sachchuyentay.vn"),
      ADMIN_PASSWORD: env.ADMIN_PASSWORD ?? (isProd ? undefined : "admin12345"),
      DB_AUTO_MIGRATE: bool(true).parse(env.DB_AUTO_MIGRATE),
      DB_SEED_IF_EMPTY: bool(!isProd).parse(env.DB_SEED_IF_EMPTY),
      isProduction: isProd,
      isTest: env.NODE_ENV === "test"
    };
  });

export type AppConfig = Readonly<z.output<typeof envSchema>>;

/**
 * Đọc cấu hình từ process.env (+ overrides cho test).
 * Không tự đọc file .env: tiến trình Node gọi `loadDotenv()` trước; trên Cloudflare Workers,
 * process.env được nạp từ `vars`/secret trong wrangler.jsonc.
 */
export function loadConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  const result = envSchema.safeParse({ ...process.env, ...overrides });
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${issues}`);
  }
  return Object.freeze(result.data);
}
