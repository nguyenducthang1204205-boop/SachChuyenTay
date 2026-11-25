import {
  ERROR_CODES,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  type AdminOrderDetail,
  type AdminOrderSummary,
  type OrderStatus,
  type Paginated,
  type PaymentMethod
} from "@sct/shared";
import { BusinessRuleError, ConflictError, NotFoundError } from "../../core/errors.js";
import type { Logger } from "../../core/logger.js";
import type { OrderAggregate, OrderListRow, OrderRepository } from "./checkout.repository.js";

export function toOrderSummary(o: OrderListRow): AdminOrderSummary {
  return {
    id: o.id,
    code: o.code,
    status: o.status as OrderStatus,
    customerName: o.customerName,
    phone: o.phone,
    paymentMethod: o.paymentMethod as PaymentMethod,
    total: o.total,
    itemCount: o.itemCount,
    createdAt: o.createdAt.toISOString()
  };
}

function toOrderDetail(o: OrderAggregate): AdminOrderDetail {
  return {
    ...toOrderSummary({ ...o, itemCount: o.items.reduce((s, i) => s + i.quantity, 0) }),
    email: o.email,
    address: o.address,
    note: o.note,
    coupon:
      o.couponCode && o.couponPercent != null
        ? { code: o.couponCode, label: o.couponLabel ?? o.couponCode, percent: o.couponPercent }
        : null,
    totals: {
      subtotal: o.subtotal,
      discount: o.discount,
      shippingFee: o.shippingFee,
      total: o.total,
      savings: o.savings
    },
    items: o.items.map((i) => ({
      bookId: i.bookId,
      title: i.title,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal
    })),
    updatedAt: o.updatedAt.toISOString()
  };
}

export class OrderAdminService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly logger: Logger
  ) {}

  async list(query: {
    q?: string | undefined;
    status?: OrderStatus | undefined;
    page: number;
    pageSize: number;
  }): Promise<Paginated<AdminOrderSummary>> {
    const { rows, total } = await this.orders.list(
      { q: query.q, status: query.status },
      { limit: query.pageSize, offset: (query.page - 1) * query.pageSize }
    );
    return {
      data: rows.map(toOrderSummary),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    };
  }

  async get(id: number): Promise<AdminOrderDetail> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError("Không tìm thấy đơn hàng.");
    return toOrderDetail(order);
  }

  /**
   * Đổi trạng thái theo máy trạng thái ORDER_TRANSITIONS.
   * Huỷ đơn → hoàn lại tồn kho trong cùng một batch nguyên tử. Dùng khoá lạc quan: chỉ đổi nếu đơn vẫn ở
   * trạng thái vừa đọc, nên hai quản trị viên thao tác cùng lúc không thể hoàn kho hai lần.
   */
  async changeStatus(id: number, next: OrderStatus, adminId: number): Promise<AdminOrderDetail> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError("Không tìm thấy đơn hàng.");
    const current = order.status as OrderStatus;
    if (current === next) return toOrderDetail(order);
    if (!ORDER_TRANSITIONS[current].includes(next)) {
      throw new BusinessRuleError(
        ERROR_CODES.INVALID_TRANSITION,
        `Không thể chuyển đơn từ “${ORDER_STATUS_LABELS[current]}” sang “${ORDER_STATUS_LABELS[next]}”.`
      );
    }
    const changed = await this.orders.transitionStatus(id, current, next, { restock: next === "cancelled" });
    if (!changed) throw new ConflictError("Đơn hàng vừa được cập nhật ở nơi khác. Hãy tải lại và thử lại.");
    this.logger.info({ orderCode: order.code, from: current, to: next, adminId }, "Order status changed");
    return this.get(id);
  }
}
