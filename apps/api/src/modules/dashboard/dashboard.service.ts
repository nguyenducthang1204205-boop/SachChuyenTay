import { ORDER_STATUSES, type DashboardStats, type OrderStatus } from "@sct/shared";
import { and, count, eq, gte, ne, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { books, buybackRequests, newsletterSubscribers, orders } from "../../db/schema.js";
import type { OrderRepository } from "../checkout/checkout.repository.js";
import { toOrderSummary } from "../checkout/order-admin.service.js";

/** Số liệu tổng quan cho trang quản trị — các truy vấn tổng hợp chỉ đọc, chạy song song. */
export class DashboardService {
  constructor(
    private readonly db: Database,
    private readonly orders: OrderRepository
  ) {}

  async stats(now = new Date()): Promise<DashboardStats> {
    // "Hôm nay" theo giờ Việt Nam (UTC+7) — Workers chạy theo UTC.
    const VN_OFFSET_MS = 7 * 3_600_000;
    const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
    vnNow.setUTCHours(0, 0, 0, 0);
    const startOfDay = new Date(vnNow.getTime() - VN_OFFSET_MS);
    const since30d = new Date(now.getTime() - 30 * 86_400_000);

    const [bookStats, statusRows, today, revenue, buybackNew, subscribers, recent] = await Promise.all([
      this.db
        .select({
          total: count(),
          published: sql<number>`count(*) filter (where ${books.isPublished})`.mapWith(Number),
          outOfStock: sql<number>`count(*) filter (where ${books.stock} <= 0)`.mapWith(Number)
        })
        .from(books),
      this.db.select({ status: orders.status, n: count() }).from(orders).groupBy(orders.status),
      this.db.select({ n: count() }).from(orders).where(gte(orders.createdAt, startOfDay)),
      this.db
        .select({ sum: sql<number>`coalesce(sum(${orders.total}), 0)`.mapWith(Number) })
        .from(orders)
        .where(and(gte(orders.createdAt, since30d), ne(orders.status, "cancelled"))),
      this.db.select({ n: count() }).from(buybackRequests).where(eq(buybackRequests.status, "new")),
      this.db.select({ n: count() }).from(newsletterSubscribers),
      this.orders.list({}, { limit: 5, offset: 0 })
    ]);

    const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
    for (const r of statusRows) if (r.status in byStatus) byStatus[r.status as OrderStatus] = r.n;
    const b = bookStats[0] ?? { total: 0, published: 0, outOfStock: 0 };

    return {
      books: { total: b.total, published: b.published, hidden: b.total - b.published, outOfStock: b.outOfStock },
      orders: { pending: byStatus.pending, today: today[0]?.n ?? 0, revenue30d: revenue[0]?.sum ?? 0, byStatus },
      buyback: { new: buybackNew[0]?.n ?? 0 },
      newsletter: { subscribers: subscribers[0]?.n ?? 0 },
      recentOrders: recent.rows.map(toOrderSummary)
    };
  }
}
