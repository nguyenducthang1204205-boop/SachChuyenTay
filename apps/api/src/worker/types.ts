/** Kiểu của các binding Cloudflare mà Worker dùng — khớp với wrangler.jsonc. */

/** Binding Cloudflare D1 — Drizzle (drizzle-orm/d1) dùng trực tiếp, không cần khai báo chi tiết. */
export type D1Database = object;

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface R2ObjectBody {
  readonly size: number;
  readonly httpEtag: string;
  readonly httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2Bucket {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** Cache API của Workers (`caches.default`) — chỉ có hiệu lực trên domain riêng, không có trên *.workers.dev. */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  WRITE_LIMITER: RateLimit;
  LOGIN_LIMITER: RateLimit;
}
