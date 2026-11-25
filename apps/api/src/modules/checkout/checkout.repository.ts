import { normalizeText } from "@sct/shared";
import { and, count, desc, eq, gt, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import {
  books,
  coupons,
  orderItems,
  orders,
  type CouponRow,
  type OrderItemRow,
  type OrderRow
} from "../../db/schema.js";
import { inList, isConstraintViolation, likeEscaped, type BatchStatements } from "../../db/sql.js";
import { escapeLike } from "../catalog/catalog.search.js";

/* ---------- Ports ---------- */

export interface CouponRepository {
  /** Tìm mã đang hiệu lực tại thời điểm `at`. */
  findActive(code: string, at: Date): Promise<CouponRow | null>;
}

export type NewOrder = Omit<OrderRow, "id" | "status" | "searchText" | "createdAt" | "updatedAt">;
export type NewOrderItem = Omit<OrderItemRow, "id" | "orderId">;
export type OrderAggregate = OrderRow & { items: OrderItemRow[] };

export interface OrderListFilter {
  q?: string | undefined;
  status?: string | undefined;
}

export type OrderListRow = OrderRow & { itemCount: number };

/** Không đủ tồn kho tại thời điểm ghi (có người mua trước trong tích tắc) — cả đơn đã bị huỷ, không ghi gì. */
export class StockConflictError extends Error {
  constructor() {
    super("Tồn kho đã thay đổi trong lúc đặt hàng");
  }
}

/** Đã có đơn với cùng Idempotency-Key (hai request trùng chạy song song). */
export class DuplicateOrderError extends Error {
  constructor() {
    super("Đơn hàng với Idempotency-Key này đã tồn tại");
  }
}

export interface OrderRepository {
  /**
   * Ghi đơn NGUYÊN TỬ trong một batch: trừ kho mọi cuốn + tạo đơn + tạo dòng đơn.
   * Ném `StockConflictError` nếu kho không đủ, `DuplicateOrderError` nếu trùng Idempotency-Key.
   */
  place(order: NewOrder, items: NewOrderItem[]): Promise<OrderAggregate>;
  findByIdempotencyKey(key: string): Promise<OrderAggregate | null>;
  /* --- Quản trị --- */
  list(
    filter: OrderListFilter,
    page: { limit: number; offset: number }
  ): Promise<{ rows: OrderListRow[]; total: number }>;
  findById(id: number): Promise<OrderAggregate | null>;
  /**
   * Đổi trạng thái chỉ khi đơn VẪN đang ở trạng thái `from` (khoá lạc quan); `restock` cộng lại tồn kho
   * trong cùng batch. Trả về false nếu đơn đã bị người khác đổi trước — khi đó không có gì thay đổi.
   */
  transitionStatus(id: number, from: string, to: string, options: { restock: boolean }): Promise<boolean>;
}

/** Nội dung tìm kiếm của đơn: mã, tên (bỏ dấu), số điện thoại (cả dạng chỉ có chữ số). */
export const buildOrderSearchText = (o: Pick<OrderRow, "code" | "customerName" | "phone">) =>
  normalizeText(`${o.code} ${o.customerName} ${o.phone} ${o.phone.replace(/\D/g, "")}`);

/** 6 cột + 1 tham số mã đơn mỗi dòng → 12 dòng/câu lệnh = 84 tham số, dưới giới hạn 100 của D1. */
const ORDER_ITEMS_PER_INSERT = 12;

const chunk = <T>(list: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/* ---------- Adapters ---------- */

export class DrizzleCouponRepository implements CouponRepository {
  constructor(private readonly db: Database) {}

  async findActive(code: string, at: Date) {
    const [row] = await this.db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.code, code),
          eq(coupons.isActive, true),
          or(isNull(coupons.startsAt), lte(coupons.startsAt, at)),
          or(isNull(coupons.endsAt), gt(coupons.endsAt, at))
        )
      )
      .limit(1);
    return row ?? null;
  }
}

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: Database) {}

  async place(order: NewOrder, items: NewOrderItem[]) {
    const now = new Date();
    const qty = JSON.stringify(items.map((i) => ({ id: i.bookId, q: i.quantity })));
    const orderId = sql<number>`(select ${orders.id} from ${orders} where ${orders.code} = ${order.code})`;
    // Chỉ dùng query builder trong batch (driver D1 không nhận SQL thô trong batch).
    const statements: BatchStatements = [
      // 1. Trừ kho mọi cuốn trong MỘT câu lệnh. Ràng buộc CHECK (stock >= 0) làm câu lệnh thất bại nếu thiếu hàng
      //    → D1/libsql huỷ toàn bộ batch: không trừ kho, không có đơn nửa vời.
      this.db
        .update(books)
        .set({
          stock: sql`${books.stock} - (select json_extract(l.value, '$.q') from json_each(${qty}) l
                                       where json_extract(l.value, '$.id') = ${books.id})`,
          updatedAt: now
        })
        .where(
          inList(
            books.id,
            items.map((i) => i.bookId)
          )
        ),
      // 2. Tạo đơn
      this.db
        .insert(orders)
        .values({ ...order, searchText: buildOrderSearchText(order), createdAt: now, updatedAt: now }),
      // 3. Dòng đơn (ảnh chụp tên & giá), liên kết theo mã đơn vừa tạo. Chia nhóm để mỗi câu lệnh < 100 tham số (giới hạn D1).
      ...chunk(items, ORDER_ITEMS_PER_INSERT).map((group) =>
        this.db.insert(orderItems).values(group.map((it) => ({ ...it, orderId })))
      )
    ];

    try {
      await this.db.batch(statements);
    } catch (err) {
      if (isConstraintViolation(err, /CHECK constraint failed: books_stock_non_negative/))
        throw new StockConflictError();
      if (isConstraintViolation(err, /UNIQUE constraint failed: orders\.idempotency_key/))
        throw new DuplicateOrderError();
      throw err;
    }

    const created = await this.withItems(
      (await this.db.select().from(orders).where(eq(orders.code, order.code)).limit(1))[0]
    );
    if (!created) throw new Error("Không đọc lại được đơn hàng vừa tạo");
    return created;
  }

  private async withItems(order: OrderRow | undefined): Promise<OrderAggregate | null> {
    if (!order) return null;
    const items = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(orderItems.id);
    return { ...order, items };
  }

  async findByIdempotencyKey(key: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.idempotencyKey, key)).limit(1);
    return this.withItems(order);
  }

  async list(filter: OrderListFilter, page: { limit: number; offset: number }) {
    const conditions: (SQL | undefined)[] = [];
    if (filter.status) conditions.push(eq(orders.status, filter.status));
    if (filter.q) {
      const term = likeEscaped(orders.searchText, `%${escapeLike(normalizeText(filter.q))}%`);
      // Gõ số điện thoại có dấu cách/chấm ("0912 345") → so với dạng chỉ có chữ số
      const digits = /^[\d\s.+-]+$/.test(filter.q) ? filter.q.replace(/\D/g, "") : "";
      conditions.push(digits ? or(term, likeEscaped(orders.searchText, `%${digits}%`)) : term);
    }
    const where = and(...conditions);
    const itemCount =
      sql<number>`(select coalesce(sum(${orderItems.quantity}), 0) from ${orderItems} where ${orderItems.orderId} = ${orders.id})`.mapWith(
        Number
      );
    const [rows, totals] = await Promise.all([
      this.db
        .select({ order: orders, itemCount })
        .from(orders)
        .where(where)
        .orderBy(desc(orders.createdAt), desc(orders.id))
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ total: count() }).from(orders).where(where)
    ]);
    return { rows: rows.map((r) => ({ ...r.order, itemCount: r.itemCount })), total: totals[0]?.total ?? 0 };
  }

  async findById(id: number) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return this.withItems(order);
  }

  async transitionStatus(id: number, from: string, to: string, { restock }: { restock: boolean }) {
    const now = new Date();
    const update = this.db
      .update(orders)
      .set({ status: to, updatedAt: now })
      .where(and(eq(orders.id, id), eq(orders.status, from)))
      .returning({ id: orders.id });

    if (!restock) return (await update).length === 1;

    // Hoàn kho TRƯỚC khi đổi trạng thái, cùng điều kiện "đơn vẫn ở trạng thái cũ" → hai người huỷ cùng lúc
    // thì batch chạy sau thấy đơn đã huỷ và không cộng kho lần hai.
    const [, updated] = await this.db.batch([
      this.db
        .update(books)
        .set({
          stock: sql`${books.stock} + (select coalesce(sum(${orderItems.quantity}), 0) from ${orderItems}
                                       where ${orderItems.orderId} = ${id} and ${orderItems.bookId} = ${books.id})`,
          updatedAt: now
        })
        .where(
          and(
            sql`${books.id} in (select ${orderItems.bookId} from ${orderItems} where ${orderItems.orderId} = ${id})`,
            sql`exists (select 1 from ${orders} where ${orders.id} = ${id} and ${orders.status} = ${from})`
          )
        ),
      update
    ]);
    return updated.length === 1;
  }
}
