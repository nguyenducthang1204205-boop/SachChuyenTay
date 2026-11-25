import { z } from "zod";
import { MAX_CART_LINES, MAX_LINE_QUANTITY } from "../constants.js";
import type { OrderTotals } from "../domain/pricing.js";
import type { BookSummary } from "./catalog.js";

export const cartItemSchema = z.object({
  bookId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY)
});
export type CartItemInput = z.input<typeof cartItemSchema>;

/** Mã giảm giá: chuẩn hoá in hoa; chuỗi rỗng → không dùng mã. */
export const couponCodeSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .toUpperCase()
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, "Mã giảm giá không hợp lệ")
    .optional()
);

export const cartQuoteRequestSchema = z.object({
  items: z.array(cartItemSchema).max(MAX_CART_LINES),
  couponCode: couponCodeSchema
});
export type CartQuoteRequest = z.input<typeof cartQuoteRequestSchema>;

/** Lý do một dòng trong giỏ bị điều chỉnh khi báo giá. */
export type CartLineIssue = "NOT_FOUND" | "SOLD_OUT" | "QUANTITY_ADJUSTED";

export interface CartQuoteLine {
  bookId: number;
  requestedQuantity: number;
  /** Số lượng thực tế có thể mua (đã giới hạn theo tồn kho). */
  quantity: number;
  book: BookSummary | null;
  lineTotal: number;
  issue: CartLineIssue | null;
}

export interface AppliedCoupon {
  code: string;
  label: string;
  percent: number;
}

export interface CartQuote {
  lines: CartQuoteLine[];
  coupon: AppliedCoupon | null;
  /** Thông điệp khi mã giảm giá gửi lên không dùng được. */
  couponError: string | null;
  totals: OrderTotals;
}
