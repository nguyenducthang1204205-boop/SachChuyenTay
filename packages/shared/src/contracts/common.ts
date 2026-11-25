import { z } from "zod";

/* ---------- Reusable field schemas (thông điệp lỗi tiếng Việt, dùng chung FE/BE) ---------- */

const VN_PHONE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

export const personNameSchema = z
  .string("Vui lòng nhập họ tên")
  .trim()
  .min(2, "Vui lòng nhập họ tên")
  .max(100, "Họ tên quá dài");

/** Số điện thoại di động VN. Đầu ra đã bỏ khoảng trắng / dấu chấm / gạch. */
export const phoneSchema = z
  .string("Vui lòng nhập số điện thoại")
  .transform((v) => v.replace(/[\s.-]/g, ""))
  .pipe(z.string().regex(VN_PHONE, "Số điện thoại chưa hợp lệ (10 số)"));

export const emailSchema = z
  .string("Email chưa hợp lệ")
  .trim()
  .toLowerCase()
  .pipe(z.email("Email chưa hợp lệ").max(254, "Email quá dài"));

/** Email không bắt buộc: chuỗi rỗng được coi như không nhập. */
export const optionalEmailSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  emailSchema.optional()
);

/** Chuỗi tuỳ chọn: chuỗi rỗng → undefined. */
export const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

/** Tham số query dạng "a,b,c" → ["a","b","c"]. */
export const csvParam = <T extends z.ZodType>(item: T, max = 50) =>
  z.preprocess(
    (v) =>
      typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : v,
    z.array(item).max(max)
  );

/** Tham số query dạng cờ: "1" | "true" → true. */
export const flagParam = z.preprocess((v) => v === true || v === "1" || v === "true", z.boolean());

/* ---------- Envelope & lỗi ---------- */

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface ListResponse<T> {
  data: T[];
}

export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  INVALID_COUPON: "INVALID_COUPON",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  IN_USE: "IN_USE",
  RATE_LIMITED: "RATE_LIMITED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  INTERNAL: "INTERNAL"
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface FieldError {
  path: string;
  message: string;
}

/** RFC 9457 — Problem Details for HTTP APIs (mở rộng thêm `code`, `errors`, `requestId`). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: ErrorCode;
  errors?: FieldError[];
  requestId?: string;
  /** Thông tin thiếu hàng khi code = OUT_OF_STOCK. */
  shortages?: Array<{ bookId: number; title: string | null; requested: number; available: number }>;
}

/** Tham số đường dẫn :id dạng số nguyên dương. */
export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
