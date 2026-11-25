import { z } from "zod";
import { emailSchema, personNameSchema, phoneSchema } from "./common.js";
import { BUYBACK_PHOTO_LIMIT, imageDataUrlSchema } from "./media.js";

/* ---------- Thu mua / ký gửi sách cũ ---------- */

export const BUYBACK_CITIES = [
  { id: "hcm", label: "TP. Hồ Chí Minh" },
  { id: "hn", label: "Hà Nội" },
  { id: "dn", label: "Đà Nẵng" },
  { id: "other", label: "Tỉnh/thành khác" }
] as const;

export const BUYBACK_METHODS = [
  { id: "sell", label: "Bán đứt (nhận tiền)" },
  { id: "credit", label: "Đổi điểm mua sách (+20%)" },
  { id: "consign", label: "Ký gửi" }
] as const;

type Ids<T extends readonly { id: string }[]> = { [K in keyof T]: T[K]["id"] };
const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as unknown as Ids<T>;

export const buybackRequestSchema = z.object({
  name: personNameSchema,
  phone: phoneSchema,
  city: z.enum(ids(BUYBACK_CITIES)).default("hcm"),
  method: z.enum(ids(BUYBACK_METHODS)).default("sell"),
  bookList: z
    .string("Hãy cho chúng tôi biết bạn có những cuốn nào")
    .trim()
    .min(3, "Hãy cho chúng tôi biết bạn có những cuốn nào")
    .max(5000, "Danh sách quá dài — hãy gửi ảnh qua Zalo giúp chúng tôi nhé"),
  pickup: z.boolean().default(false),
  /** Ảnh sách (data URL, đã nén ở trình duyệt) — tuỳ chọn. */
  photos: z.array(imageDataUrlSchema).max(BUYBACK_PHOTO_LIMIT, `Tối đa ${BUYBACK_PHOTO_LIMIT} ảnh`).default([])
});
export type BuybackRequestInput = z.input<typeof buybackRequestSchema>;
export type BuybackRequestCommand = z.output<typeof buybackRequestSchema>;

export interface BuybackRequestReceipt {
  id: number;
  reference: string;
  bookCount: number;
  photoCount: number;
  createdAt: string;
}

/* ---------- Bản tin ---------- */

export const subscribeSchema = z.object({ email: emailSchema });
export type SubscribeRequest = z.input<typeof subscribeSchema>;

export interface SubscribeResult {
  email: string;
  alreadySubscribed: boolean;
  welcomeCouponCode: string | null;
}
