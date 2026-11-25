import {
  calculateTotals,
  ERROR_CODES,
  type AppliedCoupon,
  type CartLineIssue,
  type CartQuote,
  type CartQuoteLine,
  type CreateOrderCommand,
  type OrderConfirmation,
  type OrderStatus,
  type PaymentMethod
} from "@sct/shared";
import { BusinessRuleError, OutOfStockError, type StockShortage } from "../../core/errors.js";
import { referenceCode } from "../../core/ids.js";
import type { Logger } from "../../core/logger.js";
import { toBookSummary } from "../catalog/catalog.mapper.js";
import type { BookRecord, CatalogRepository } from "../catalog/catalog.repository.js";
import {
  DuplicateOrderError,
  StockConflictError,
  type CouponRepository,
  type NewOrderItem,
  type OrderAggregate,
  type OrderRepository
} from "./checkout.repository.js";

interface CartItem {
  bookId: number;
  quantity: number;
}

export interface CheckoutDeps {
  catalog: CatalogRepository;
  coupons: CouponRepository;
  orders: OrderRepository;
  logger: Logger;
  clock?: () => Date;
}

/** Gộp các dòng trùng sách (client có thể gửi trùng). */
function mergeItems(items: readonly CartItem[]): CartItem[] {
  const map = new Map<number, number>();
  for (const it of items) map.set(it.bookId, (map.get(it.bookId) ?? 0) + it.quantity);
  return [...map].map(([bookId, quantity]) => ({ bookId, quantity }));
}

const INVALID_COUPON_MESSAGE = (code: string) => `Mã “${code}” không hợp lệ hoặc đã hết hạn.`;

/**
 * Use-case thanh toán. Giá & tồn kho LUÔN được tính lại ở server — không tin dữ liệu giá từ client.
 */
export class CheckoutService {
  private readonly now: () => Date;

  constructor(private readonly deps: CheckoutDeps) {
    this.now = deps.clock ?? (() => new Date());
  }

  private async resolveCoupon(coupons: CouponRepository, code: string | undefined): Promise<AppliedCoupon | null> {
    if (!code) return null;
    const row = await coupons.findActive(code, this.now());
    return row ? { code: row.code, label: row.label, percent: row.percent } : null;
  }

  /** Báo giá giỏ hàng: kiểm tra tồn kho, áp mã giảm, tính tổng. Không thay đổi dữ liệu. */
  async quote(input: { items: CartItem[]; couponCode?: string | undefined }): Promise<CartQuote> {
    const items = mergeItems(input.items);
    const [rows, coupon] = await Promise.all([
      this.deps.catalog.findBooksByIds(items.map((i) => i.bookId)),
      this.resolveCoupon(this.deps.coupons, input.couponCode)
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));

    const lines: CartQuoteLine[] = items.map(({ bookId, quantity }) => {
      const row = byId.get(bookId);
      const available = row?.isPublished ? Math.max(0, row.stock) : 0;
      const finalQty = Math.min(quantity, available);
      let issue: CartLineIssue | null = null;
      if (!row || !row.isPublished) issue = "NOT_FOUND";
      else if (available === 0) issue = "SOLD_OUT";
      else if (finalQty < quantity) issue = "QUANTITY_ADJUSTED";
      return {
        bookId,
        requestedQuantity: quantity,
        quantity: finalQty,
        book: row?.isPublished ? toBookSummary(row) : null,
        lineTotal: row ? row.price * finalQty : 0,
        issue
      };
    });

    const totals = calculateTotals({
      lines: lines
        .filter((l) => l.book && l.quantity > 0)
        .map((l) => ({ unitPrice: l.book!.price, originalPrice: l.book!.originalPrice, quantity: l.quantity })),
      couponPercent: coupon?.percent
    });

    return {
      lines,
      coupon,
      couponError: input.couponCode && !coupon ? INVALID_COUPON_MESSAGE(input.couponCode) : null,
      totals
    };
  }

  /** Kiểm tra tồn kho của từng dòng với dữ liệu sách hiện tại. */
  private findShortages(items: readonly CartItem[], rows: readonly BookRecord[]): StockShortage[] {
    const byId = new Map(rows.map((r) => [r.id, r]));
    return items.flatMap(({ bookId, quantity }) => {
      const book = byId.get(bookId);
      const available = book?.isPublished ? book.stock : 0;
      return !book || available < quantity
        ? [{ bookId, title: book?.title ?? null, requested: quantity, available: Math.max(0, available) }]
        : [];
    });
  }

  /**
   * Đặt hàng:
   *  1. Idempotency — cùng key → trả lại đơn đã tạo (không tạo trùng).
   *  2. Đọc sách, kiểm tra tồn kho & mã giảm giá, tính tiền (chỉ đọc).
   *  3. Ghi NGUYÊN TỬ một batch: trừ kho + tạo đơn + dòng đơn. Ràng buộc CHECK stock >= 0 là chốt chặn cuối:
   *     nếu ai đó mua mất hàng giữa bước 2 và 3, cả batch bị huỷ → báo hết hàng, không có đơn nửa vời.
   */
  async placeOrder(
    command: CreateOrderCommand,
    idempotencyKey?: string
  ): Promise<{ order: OrderConfirmation; created: boolean }> {
    if (idempotencyKey) {
      const existing = await this.deps.orders.findByIdempotencyKey(idempotencyKey);
      if (existing) return { order: toConfirmation(existing), created: false };
    }

    const items = mergeItems(command.items);
    const ids = items.map((i) => i.bookId);
    const rows = await this.deps.catalog.findBooksByIds(ids);
    const shortages = this.findShortages(items, rows);
    if (shortages.length) throw new OutOfStockError(shortages);

    const coupon = await this.resolveCoupon(this.deps.coupons, command.couponCode);
    if (command.couponCode && !coupon) {
      throw new BusinessRuleError(ERROR_CODES.INVALID_COUPON, INVALID_COUPON_MESSAGE(command.couponCode));
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines: NewOrderItem[] = items.map(({ bookId, quantity }) => {
      const book = byId.get(bookId)!;
      return {
        bookId,
        title: book.title,
        unitPrice: book.price,
        originalPrice: book.originalPrice,
        quantity,
        lineTotal: book.price * quantity
      };
    });
    const totals = calculateTotals({
      lines: lines.map((l) => ({ unitPrice: l.unitPrice, originalPrice: l.originalPrice, quantity: l.quantity })),
      couponPercent: coupon?.percent
    });

    const { customer } = command;
    try {
      const order = await this.deps.orders.place(
        {
          code: referenceCode("SCT", this.now()),
          customerName: customer.name,
          phone: customer.phone,
          email: customer.email ?? null,
          address: customer.address,
          note: customer.note ?? null,
          paymentMethod: command.paymentMethod,
          couponCode: coupon?.code ?? null,
          couponLabel: coupon?.label ?? null,
          couponPercent: coupon?.percent ?? null,
          subtotal: totals.subtotal,
          discount: totals.discount,
          shippingFee: totals.shippingFee,
          total: totals.total,
          savings: totals.savings,
          idempotencyKey: idempotencyKey ?? null
        },
        lines
      );
      this.deps.logger.info({ orderCode: order.code, total: order.total, lines: order.items.length }, "Order placed");
      return { order: toConfirmation(order), created: true };
    } catch (err) {
      if (err instanceof StockConflictError) {
        // Có người mua trước trong tích tắc → đọc lại tồn kho mới nhất để báo chính xác cuốn nào thiếu.
        const latest = this.findShortages(items, await this.deps.catalog.findBooksByIds(ids));
        throw new OutOfStockError(
          latest.length
            ? latest
            : items.map((i) => ({
                ...i,
                title: byId.get(i.bookId)?.title ?? null,
                requested: i.quantity,
                available: 0
              }))
        );
      }
      // Hai request cùng idempotency key chạy song song: request thua trả về đơn của request thắng.
      if (err instanceof DuplicateOrderError && idempotencyKey) {
        const existing = await this.deps.orders.findByIdempotencyKey(idempotencyKey);
        if (existing) return { order: toConfirmation(existing), created: false };
      }
      throw err;
    }
  }
}

function toConfirmation(order: OrderAggregate): OrderConfirmation {
  return {
    code: order.code,
    status: order.status as OrderStatus,
    paymentMethod: order.paymentMethod as PaymentMethod,
    customerName: order.customerName,
    phone: order.phone,
    items: order.items.map((i) => ({
      bookId: i.bookId,
      title: i.title,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal
    })),
    coupon:
      order.couponCode && order.couponPercent != null
        ? { code: order.couponCode, label: order.couponLabel ?? order.couponCode, percent: order.couponPercent }
        : null,
    totals: {
      subtotal: order.subtotal,
      discount: order.discount,
      shippingFee: order.shippingFee,
      total: order.total,
      savings: order.savings
    },
    createdAt: order.createdAt.toISOString()
  };
}
