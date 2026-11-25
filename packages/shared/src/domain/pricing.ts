import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from "../constants.js";

/** Phần trăm giảm so với giá bìa (làm tròn). Trả 0 nếu không có giá bìa. */
export function discountPercent(price: number, originalPrice: number | null | undefined): number {
  if (!originalPrice || originalPrice <= 0 || price >= originalPrice) return 0;
  return Math.round((1 - price / originalPrice) * 100);
}

export interface PricedLine {
  unitPrice: number;
  originalPrice: number | null;
  quantity: number;
}

export interface OrderTotals {
  /** Tổng tiền hàng trước giảm giá. */
  subtotal: number;
  /** Tiền giảm từ mã giảm giá. */
  discount: number;
  shippingFee: number;
  total: number;
  /** Tổng tiết kiệm so với mua sách mới (chênh lệch giá bìa + mã giảm giá). */
  savings: number;
  /** Còn thiếu bao nhiêu để được miễn phí giao hàng (0 nếu đã đạt / giỏ trống). */
  freeShippingRemaining: number;
  freeShippingThreshold: number;
}

export interface TotalsInput {
  lines: readonly PricedLine[];
  couponPercent?: number | null;
}

/**
 * Quy tắc tính tiền DUY NHẤT của hệ thống.
 * - BE dùng để tính giá chính thức khi báo giá / tạo đơn.
 * - FE dùng để hiển thị tức thời (thanh tiến độ freeship trong giỏ trượt).
 */
export function calculateTotals({ lines, couponPercent }: TotalsInput): OrderTotals {
  let subtotal = 0;
  let listSavings = 0;
  for (const line of lines) {
    subtotal += line.unitPrice * line.quantity;
    if (line.originalPrice && line.originalPrice > line.unitPrice) {
      listSavings += (line.originalPrice - line.unitPrice) * line.quantity;
    }
  }

  const pct = Math.min(100, Math.max(0, couponPercent ?? 0));
  const discount = Math.round((subtotal * pct) / 100);
  const qualifiesFreeShipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD;
  const shippingFee = qualifiesFreeShipping ? 0 : SHIPPING_FEE;

  return {
    subtotal,
    discount,
    shippingFee,
    total: subtotal - discount + shippingFee,
    savings: listSavings + discount,
    freeShippingRemaining: subtotal === 0 ? 0 : Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal),
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD
  };
}
