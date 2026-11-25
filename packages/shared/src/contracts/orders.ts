import { z } from "zod";
import { MAX_CART_LINES } from "../constants.js";
import type { OrderTotals } from "../domain/pricing.js";
import { cartItemSchema, couponCodeSchema, type AppliedCoupon } from "./cart.js";
import { optionalEmailSchema, optionalText, personNameSchema, phoneSchema } from "./common.js";

export const PAYMENT_METHODS = ["cod", "bank", "momo"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_STATUSES = ["pending", "confirmed", "shipping", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const customerSchema = z.object({
  name: personNameSchema,
  phone: phoneSchema,
  email: optionalEmailSchema,
  address: z.string("Vui lòng nhập địa chỉ").trim().min(8, "Vui lòng nhập địa chỉ đầy đủ").max(300, "Địa chỉ quá dài"),
  note: optionalText(500)
});
export type CustomerInput = z.input<typeof customerSchema>;

export const createOrderSchema = z.object({
  customer: customerSchema,
  paymentMethod: z.enum(PAYMENT_METHODS, "Phương thức thanh toán không hợp lệ"),
  items: z.array(cartItemSchema).min(1, "Giỏ hàng đang trống").max(MAX_CART_LINES),
  couponCode: couponCodeSchema
});
export type CreateOrderRequest = z.input<typeof createOrderSchema>;
export type CreateOrderCommand = z.output<typeof createOrderSchema>;

export interface OrderLine {
  bookId: number;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderConfirmation {
  code: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerName: string;
  phone: string;
  items: OrderLine[];
  coupon: AppliedCoupon | null;
  totals: Omit<OrderTotals, "freeShippingRemaining" | "freeShippingThreshold">;
  createdAt: string;
}

/** Header dùng để chống tạo trùng đơn khi người dùng bấm nhiều lần / mạng chập chờn. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
