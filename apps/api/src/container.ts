import type { AppConfig } from "./config/env.js";
import { memoryRateLimiter, noRateLimit, type RateLimiterFactory } from "./core/http/rate-limit.js";
import type { Logger } from "./core/logger.js";
import type { ObjectStorage } from "./core/storage/object-storage.js";
import type { DatabaseHandle } from "./db/client.js";
import { DrizzleAuthRepository } from "./modules/auth/auth.repository.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { BuybackAdminService } from "./modules/buyback/buyback-admin.service.js";
import { DrizzleBuybackRepository } from "./modules/buyback/buyback.repository.js";
import { BuybackService } from "./modules/buyback/buyback.service.js";
import { DrizzleCatalogAdminRepository } from "./modules/catalog/catalog-admin.repository.js";
import { CatalogAdminService } from "./modules/catalog/catalog-admin.service.js";
import { DrizzleCatalogRepository } from "./modules/catalog/catalog.repository.js";
import { CatalogService } from "./modules/catalog/catalog.service.js";
import { DrizzleCouponRepository, DrizzleOrderRepository } from "./modules/checkout/checkout.repository.js";
import { CheckoutService } from "./modules/checkout/checkout.service.js";
import { OrderAdminService } from "./modules/checkout/order-admin.service.js";
import { DashboardService } from "./modules/dashboard/dashboard.service.js";
import { MediaService } from "./modules/media/media.service.js";
import { DrizzleNewsletterRepository } from "./modules/newsletter/newsletter.repository.js";
import { NewsletterService } from "./modules/newsletter/newsletter.service.js";

export interface ContainerOptions {
  /** Kho lưu ảnh: R2 trên Workers, thư mục trên đĩa khi chạy Node, bộ nhớ khi test. */
  storage: ObjectStorage;
  /** Cách giới hạn tần suất; mặc định đếm trong bộ nhớ tiến trình. */
  rateLimiter?: RateLimiterFactory;
}

/**
 * Composition root — nơi DUY NHẤT khởi tạo và nối các phụ thuộc (Dependency Injection thủ công).
 * Muốn thay CSDL / kho ảnh bằng hệ khác, hay mock trong test, chỉ cần sửa ở đây.
 */
export function createContainer(
  config: AppConfig,
  database: DatabaseHandle,
  logger: Logger,
  options: ContainerOptions
) {
  const { db } = database;
  const repos = {
    catalog: new DrizzleCatalogRepository(db),
    coupons: new DrizzleCouponRepository(db),
    orders: new DrizzleOrderRepository(db)
  };
  const buybackRepo = new DrizzleBuybackRepository(db);
  const media = new MediaService(options.storage, logger);
  const rateLimiter: RateLimiterFactory = config.isTest
    ? () => noRateLimit
    : (options.rateLimiter ?? memoryRateLimiter);

  return {
    config,
    logger,
    database,
    writeLimiter: rateLimiter("write", config.WRITE_RATE_LIMIT_PER_MINUTE),
    loginLimiter: rateLimiter("login", 10),
    services: {
      catalog: new CatalogService(repos.catalog),
      checkout: new CheckoutService({ ...repos, logger }),
      buyback: new BuybackService(buybackRepo, media, logger),
      media,
      newsletter: new NewsletterService(new DrizzleNewsletterRepository(db), config.WELCOME_COUPON_CODE || null)
    },
    admin: {
      auth: new AuthService(new DrizzleAuthRepository(db), config.ADMIN_SESSION_TTL_HOURS, logger),
      catalog: new CatalogAdminService(repos.catalog, new DrizzleCatalogAdminRepository(db), media, logger),
      orders: new OrderAdminService(repos.orders, logger),
      buyback: new BuybackAdminService(buybackRepo),
      dashboard: new DashboardService(db, repos.orders)
    }
  };
}

export type Container = ReturnType<typeof createContainer>;
