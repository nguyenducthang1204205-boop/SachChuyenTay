/**
 * Entry cho Cloudflare Workers.
 *
 * Một Worker phục vụ cả web lẫn API trên cùng domain:
 *  - File tĩnh (apps/web/dist) do Cloudflare phục vụ trực tiếp, không chạy code này.
 *  - /api/*, /health/* và /images/* (`assets.run_worker_first` trong wrangler.jsonc) đi vào đây,
 *    được chuyển sang đúng Express app như khi chạy Node, qua lớp tương thích `node:http` của Workers.
 *
 * Khác biệt so với main.ts (Node):
 *  - CSDL: Cloudflare D1 (SQLite) qua binding `DB` — dùng chung cho mọi request trong isolate.
 *  - Không migrate/seed lúc khởi động → `wrangler d1 migrations apply` + `npm run cf:setup` (xem README).
 *  - Ảnh: R2 thay vì thư mục trên đĩa; ảnh bìa được cache ở edge (Cache API).
 *  - Rate limit: binding Cloudflare thay vì đếm trong bộ nhớ.
 */
import { handleAsNodeRequest } from "cloudflare:node";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createApp } from "../app.js";
import { loadConfig } from "../config/env.js";
import { createContainer } from "../container.js";
import { createLogger } from "../core/logger.js";
import type { Database, DatabaseHandle } from "../db/client.js";
import * as schema from "../db/schema.js";
import { R2ObjectStorage } from "./r2-storage.js";
import { bindingRateLimiter } from "./rate-limit.js";
import type { EdgeCache, Env, ExecutionContext } from "./types.js";

/** Khoá định tuyến nội bộ giữa Worker và server Node ảo — không phải cổng mạng thật. */
const INTERNAL_PORT = 8080;

let started = false;

function d1Database(env: Env): DatabaseHandle {
  const db = drizzle(env.DB as Parameters<typeof drizzle>[0], { schema }) as unknown as Database;
  return {
    db,
    driver: "d1",
    migrate: () => Promise.reject(new Error("D1: chạy migration bằng `wrangler d1 migrations apply DB --remote`")),
    ping: async () => void (await db.run(sql`select 1`)),
    close: async () => {}
  };
}

/** Dựng app một lần cho mỗi isolate (lần request đầu tiên), vì binding chỉ có trong handler. */
function ensureStarted(env: Env) {
  if (started) return;
  const config = loadConfig();
  const logger = createLogger(config, { console: true });
  const container = createContainer(config, d1Database(env), logger, {
    storage: new R2ObjectStorage(env.MEDIA),
    rateLimiter: bindingRateLimiter({ write: env.WRITE_LIMITER, login: env.LOGIN_LIMITER })
  });
  createApp(container).listen(INTERNAL_PORT);
  started = true;
}

function handle(request: Request, env: Env): Promise<Response> {
  ensureStarted(env);
  return handleAsNodeRequest(INTERNAL_PORT, request);
}

const edgeCache = (): EdgeCache | undefined => (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;

/** Ảnh bìa có khoá không đổi → cache tại edge, lần sau không cần chạy Express hay đọc R2. */
async function handleImage(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = edgeCache();
  const cached = await cache?.match(request);
  if (cached) return cached;
  const response = await handle(request, env);
  if (cache && response.status === 200) ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const isImage = request.method === "GET" && new URL(request.url).pathname.startsWith("/images/");
    return isImage ? handleImage(request, env, ctx) : handle(request, env);
  }
};
