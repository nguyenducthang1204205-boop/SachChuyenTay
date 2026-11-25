import { rateLimit } from "express-rate-limit";
import type { RequestHandler } from "express";
import { RateLimitError } from "../errors.js";

/** Các nhóm endpoint có giới hạn tần suất riêng. */
export type RateLimitName = "write" | "login";

/**
 * Nhà máy tạo middleware giới hạn tần suất — tách thành "port" để đổi hạ tầng mà không sửa route:
 *  - Node (server, docker): đếm trong bộ nhớ tiến trình (`memoryRateLimiter`).
 *  - Cloudflare Workers: binding Rate Limiting của Cloudflare (`src/worker/rate-limit.ts`).
 */
export type RateLimiterFactory = (name: RateLimitName, limitPerMinute: number) => RequestHandler;

export const noRateLimit: RequestHandler = (_req, _res, next) => next();

/** Giới hạn trong bộ nhớ, cửa sổ 1 phút — đủ dùng khi chạy một tiến trình. */
export const memoryRateLimiter: RateLimiterFactory = (_name, limitPerMinute) =>
  rateLimit({
    windowMs: 60_000,
    limit: limitPerMinute,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new RateLimitError())
  });
