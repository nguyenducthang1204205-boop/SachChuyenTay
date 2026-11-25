import { z } from "zod";
import { BOOK_SORTS, CONDITION_IDS, type BookDetail, type Category } from "./catalog.js";
import type { AppliedCoupon } from "./cart.js";
import { emailSchema } from "./common.js";
import { coverImageUrlSchema } from "./media.js";
import { ORDER_STATUSES, type OrderLine, type OrderStatus, type PaymentMethod } from "./orders.js";

/* ==========================================================================
   Hợp đồng cho khu vực quản trị (/api/v1/admin/*)
   ========================================================================== */

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(20);
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Màu phải có dạng #RRGGBB");

/** Tham số truy vấn phía client: các trường số phân trang là number (z.input của coerce là unknown). */
type ListParams<T extends z.ZodObject> = Partial<
  Omit<z.input<T>, "page" | "pageSize"> & { page: number; pageSize: number }
>;

/* ---------- Xác thực ---------- */

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string("Vui lòng nhập mật khẩu").min(1, "Vui lòng nhập mật khẩu").max(200)
});
export type LoginRequest = z.input<typeof loginSchema>;

export interface AdminUser {
  id: number;
  email: string;
  name: string;
}

/* ---------- Sách ---------- */

export const bookInputSchema = z.object({
  title: z.string("Vui lòng nhập tên sách").trim().min(1, "Vui lòng nhập tên sách").max(200, "Tên sách quá dài"),
  author: z.string("Vui lòng nhập tác giả").trim().min(1, "Vui lòng nhập tác giả").max(120),
  publisher: z.string("Vui lòng nhập nhà xuất bản").trim().min(1, "Vui lòng nhập nhà xuất bản").max(120),
  categoryId: z.string("Vui lòng chọn thể loại").trim().min(1, "Vui lòng chọn thể loại"),
  conditionId: z.enum(CONDITION_IDS, "Vui lòng chọn tình trạng"),
  price: z.number("Giá bán không hợp lệ").int("Giá phải là số nguyên").min(0, "Giá không được âm").max(100_000_000),
  originalPrice: z.number("Giá bìa không hợp lệ").int().min(0).max(100_000_000).nullable(),
  publishedYear: z
    .number("Năm không hợp lệ")
    .int()
    .min(1800, "Năm không hợp lệ")
    .max(2100, "Năm không hợp lệ")
    .nullable(),
  pages: z.number("Số trang không hợp lệ").int().min(1, "Số trang không hợp lệ").max(20_000).nullable(),
  stock: z.number("Tồn kho không hợp lệ").int().min(0, "Tồn kho không được âm").max(100_000),
  rating: z.number().min(0).max(5, "Đánh giá tối đa 5").default(0),
  reviewCount: z.number().int().min(0).default(0),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  description: z.string().trim().max(5000, "Giới thiệu quá dài").default(""),
  inspectionNote: z.string().trim().max(1000, "Ghi chú quá dài").default(""),
  isPublished: z.boolean().default(true),
  cover: z.object({
    from: hexColor,
    to: hexColor,
    ink: hexColor.nullable(),
    pattern: z.number().int().min(0).max(3),
    imageUrl: coverImageUrlSchema.nullable()
  })
});
export const bookUpdateSchema = bookInputSchema.partial();
export type BookInput = z.input<typeof bookInputSchema>;
export type BookCreateCommand = z.output<typeof bookInputSchema>;
export type BookUpdateCommand = z.output<typeof bookUpdateSchema>;

export const BOOK_VISIBILITIES = ["all", "published", "hidden"] as const;
export const STOCK_FILTERS = ["all", "in-stock", "out-of-stock"] as const;

export const adminBookListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(40).optional(),
  visibility: z.enum(BOOK_VISIBILITIES).default("all"),
  stock: z.enum(STOCK_FILTERS).default("all"),
  sort: z.enum(BOOK_SORTS).default("newest"),
  page,
  pageSize
});
export type AdminBookListQuery = z.output<typeof adminBookListQuerySchema>;
export type AdminBookListParams = ListParams<typeof adminBookListQuerySchema>;

export interface AdminBook extends BookDetail {
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ---------- Thể loại ---------- */

export const categoryInputSchema = z.object({
  id: z
    .string("Vui lòng nhập mã thể loại")
    .trim()
    .regex(/^[a-z0-9-]{2,40}$/, "Mã chỉ gồm chữ thường không dấu, số và dấu gạch (2–40 ký tự)"),
  name: z.string("Vui lòng nhập tên").trim().min(2, "Vui lòng nhập tên thể loại").max(60),
  icon: z.string().trim().min(1).max(30).default("book"),
  colors: z.object({ bg: hexColor, fg: hexColor }),
  sortOrder: z.number().int().min(0).max(1000).default(0)
});
export const categoryUpdateSchema = categoryInputSchema.omit({ id: true }).partial();
export type CategoryInput = z.input<typeof categoryInputSchema>;
export type CategoryCreateCommand = z.output<typeof categoryInputSchema>;
export type CategoryUpdateCommand = z.output<typeof categoryUpdateSchema>;

export interface AdminCategory extends Category {
  sortOrder: number;
  /** Tổng số sách (kể cả sách đang ẩn). */
  totalBooks: number;
}

/* ---------- Đơn hàng ---------- */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao",
  completed: "Hoàn tất",
  cancelled: "Đã huỷ"
};

/** Máy trạng thái đơn hàng: chỉ cho phép chuyển theo các hướng này. */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["shipping", "cancelled"],
  shipping: ["completed", "cancelled"],
  completed: [],
  cancelled: []
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod: "COD",
  bank: "Chuyển khoản",
  momo: "Ví điện tử"
};

export const adminOrderListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  page,
  pageSize
});
export type AdminOrderListParams = ListParams<typeof adminOrderListQuerySchema>;

export const orderStatusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES, "Trạng thái không hợp lệ")
});

export interface AdminOrderSummary {
  id: number;
  code: string;
  status: OrderStatus;
  customerName: string;
  phone: string;
  paymentMethod: PaymentMethod;
  total: number;
  itemCount: number;
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  email: string | null;
  address: string;
  note: string | null;
  coupon: AppliedCoupon | null;
  totals: { subtotal: number; discount: number; shippingFee: number; total: number; savings: number };
  items: OrderLine[];
  updatedAt: string;
}

/* ---------- Yêu cầu thu mua ---------- */

export const BUYBACK_STATUSES = ["new", "contacted", "completed", "rejected"] as const;
export type BuybackStatus = (typeof BUYBACK_STATUSES)[number];
export const BUYBACK_STATUS_LABELS: Record<BuybackStatus, string> = {
  new: "Mới",
  contacted: "Đã liên hệ",
  completed: "Đã thu mua",
  rejected: "Từ chối"
};

export const adminBuybackListQuerySchema = z.object({
  status: z.enum(BUYBACK_STATUSES).optional(),
  page,
  pageSize
});
export type AdminBuybackListParams = ListParams<typeof adminBuybackListQuerySchema>;

export const buybackStatusUpdateSchema = z.object({
  status: z.enum(BUYBACK_STATUSES, "Trạng thái không hợp lệ")
});

export interface AdminBuybackRequest {
  id: number;
  reference: string;
  name: string;
  phone: string;
  city: string;
  method: string;
  bookList: string;
  bookCount: number;
  pickup: boolean;
  /** Khoá ảnh khách gửi — xem qua GET /admin/media/<key> (chỉ quản trị). */
  photoKeys: string[];
  status: BuybackStatus;
  createdAt: string;
}

/* ---------- Dashboard ---------- */

export interface DashboardStats {
  books: { total: number; published: number; hidden: number; outOfStock: number };
  orders: { pending: number; today: number; revenue30d: number; byStatus: Record<OrderStatus, number> };
  buyback: { new: number };
  newsletter: { subscribers: number };
  recentOrders: AdminOrderSummary[];
}
