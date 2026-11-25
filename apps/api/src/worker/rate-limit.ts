import type { Request } from "express";
import type { RateLimitName, RateLimiterFactory } from "../core/http/rate-limit.js";
import { RateLimitError } from "../core/errors.js";
import type { RateLimit } from "./types.js";

const clientKey = (req: Request) => req.get("cf-connecting-ip") ?? req.ip ?? "unknown";

/**
 * Giới hạn tần suất bằng binding Rate Limiting của Cloudflare (đếm chung mọi isolate trong một vùng).
 * Ngưỡng và chu kỳ cấu hình trong wrangler.jsonc (`ratelimits`), nên tham số `limitPerMinute` bị bỏ qua.
 */
export function bindingRateLimiter(bindings: Record<RateLimitName, RateLimit>): RateLimiterFactory {
  return (name) => async (req, _res, next) => {
    const { success } = await bindings[name].limit({ key: `${name}:${clientKey(req)}` });
    next(success ? undefined : new RateLimitError());
  };
}
