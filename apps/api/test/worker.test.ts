import express from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { errorHandler } from "../src/core/http/problem.js";
import { createLogger } from "../src/core/logger.js";
import { R2ObjectStorage } from "../src/worker/r2-storage.js";
import { bindingRateLimiter } from "../src/worker/rate-limit.js";
import type { R2Bucket, R2ObjectBody, RateLimit } from "../src/worker/types.js";

/* Các phần chạy riêng trên Cloudflare Workers — kiểm thử trên Node (src/worker/index.ts cần runtime workerd;
   luồng đầy đủ với D1 + R2 thật được kiểm tra bằng `npm run cf:dev`). */

describe("R2ObjectStorage", () => {
  it("ghi, đọc (kèm content-type, etag) và xoá qua binding R2", async () => {
    const objects = new Map<string, { body: Uint8Array; contentType?: string }>();
    const bucket: R2Bucket = {
      put: async (key, value, opts) =>
        void objects.set(key, { body: value, contentType: opts?.httpMetadata?.contentType }),
      get: async (key) => {
        const o = objects.get(key);
        if (!o) return null;
        const body: R2ObjectBody = {
          size: o.body.byteLength,
          httpEtag: '"etag-1"',
          httpMetadata: { contentType: o.contentType },
          arrayBuffer: async () => o.body.slice().buffer
        };
        return body;
      },
      delete: async (keys) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
      }
    };
    const storage = new R2ObjectStorage(bucket);
    await storage.put("covers/2026/01/a.webp", new Uint8Array([1, 2, 3]), "image/webp");
    expect(await storage.get("covers/2026/01/a.webp")).toMatchObject({
      contentType: "image/webp",
      size: 3,
      etag: '"etag-1"',
      body: new Uint8Array([1, 2, 3])
    });
    await storage.delete(["covers/2026/01/a.webp"]);
    expect(await storage.get("covers/2026/01/a.webp")).toBeNull();
  });
});

describe("bindingRateLimiter", () => {
  it("trả 429 khi binding Cloudflare báo vượt ngưỡng, đếm theo nhóm + IP", async () => {
    const seen: string[] = [];
    const binding = (max: number): RateLimit => {
      const counts = new Map<string, number>();
      return {
        limit: async ({ key }) => {
          seen.push(key);
          const n = (counts.get(key) ?? 0) + 1;
          counts.set(key, n);
          return { success: n <= max };
        }
      };
    };
    const limiter = bindingRateLimiter({ write: binding(2), login: binding(1) });
    const app = express();
    app.post("/write", limiter("write", 2), (_req, res) => void res.sendStatus(204));
    app.use(errorHandler(createLogger({ NODE_ENV: "test", LOG_LEVEL: "silent" })));
    const http = supertest(app);

    const ip = { "CF-Connecting-IP": "203.0.113.7" };
    await http.post("/write").set(ip).expect(204);
    await http.post("/write").set(ip).expect(204);
    const blocked = await http.post("/write").set(ip).expect(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    await http.post("/write").set({ "CF-Connecting-IP": "198.51.100.1" }).expect(204);
    expect(seen[0]).toBe("write:203.0.113.7");
  });
});
