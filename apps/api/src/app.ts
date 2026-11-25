import { randomUUID } from "node:crypto";
import { API_VERSION_PREFIX } from "@sct/shared";
import cors from "cors";
import express, { Router, type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Container } from "./container.js";
import { errorHandler, notFoundHandler } from "./core/http/problem.js";
import { authRoutes, requireAdmin } from "./modules/auth/auth.routes.js";
import { buybackAdminRoutes } from "./modules/buyback/buyback-admin.routes.js";
import { buybackRoutes } from "./modules/buyback/buyback.routes.js";
import { catalogAdminRoutes } from "./modules/catalog/catalog-admin.routes.js";
import { catalogRoutes } from "./modules/catalog/catalog.routes.js";
import { checkoutRoutes } from "./modules/checkout/checkout.routes.js";
import { orderAdminRoutes } from "./modules/checkout/order-admin.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { mediaAdminRoutes, publicImageRoutes } from "./modules/media/media.routes.js";
import { newsletterRoutes } from "./modules/newsletter/newsletter.routes.js";

export const APP_VERSION = process.env.npm_package_version ?? "0.1.0";
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Tạo Express app từ container — không mở cổng, nên test có thể gọi trực tiếp bằng supertest. */
export function createApp({
  config,
  logger,
  database,
  services,
  admin,
  writeLimiter,
  loginLimiter
}: Container): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY);
  app.set("query parser", "simple");

  /* ---- Cross-cutting middleware ---- */
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader("X-Request-Id", id);
        return id;
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      autoLogging: { ignore: (req) => req.url?.startsWith("/health") ?? false },
      // Chỉ ghi thông tin cần để truy vết — không ghi header (cookie phiên, IP, user-agent…)
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode })
      }
    })
  );
  app.use(helmet());
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Idempotency-Key", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy"],
      maxAge: 600
    })
  );
  // Yêu cầu thu mua có thể kèm tối đa 4 ảnh (base64) → giới hạn riêng; mọi endpoint khác giữ 64 KB.
  app.use(`${API_VERSION_PREFIX}/buyback-requests`, express.json({ limit: "3mb" }));
  app.use(express.json({ limit: "64kb" }));

  /* ---- Routes ---- */
  app.use("/health", healthRoutes(database, APP_VERSION));
  app.use("/images", publicImageRoutes(services.media));

  const v1 = Router();
  v1.use(catalogRoutes(services.catalog));
  v1.use(checkoutRoutes(services.checkout, writeLimiter));
  v1.use(buybackRoutes(services.buyback, writeLimiter));
  v1.use(newsletterRoutes(services.newsletter, writeLimiter));

  /* ---- Khu vực quản trị: đăng nhập công khai, còn lại bắt buộc phiên hợp lệ ---- */
  v1.use("/admin/auth", authRoutes(admin.auth, loginLimiter, config.isProduction));
  const adminRouter = Router();
  adminRouter.use(requireAdmin(admin.auth));
  adminRouter.use(dashboardRoutes(admin.dashboard));
  adminRouter.use(catalogAdminRoutes(admin.catalog));
  adminRouter.use(orderAdminRoutes(admin.orders));
  adminRouter.use(buybackAdminRoutes(admin.buyback));
  adminRouter.use(mediaAdminRoutes(services.media));
  v1.use("/admin", adminRouter);
  app.use(API_VERSION_PREFIX, v1);

  /* ---- Errors (luôn đặt cuối) ---- */
  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
