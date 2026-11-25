import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";
import { csvParam, flagParam } from "./common.js";

/* ---------- Resources ---------- */

export const CONDITION_IDS = ["like-new", "good", "fair"] as const;
export type ConditionId = (typeof CONDITION_IDS)[number];

export interface CategoryRef {
  id: string;
  name: string;
}

export interface ConditionRef {
  id: ConditionId;
  label: string;
}

/** Thông tin vẽ bìa sách bằng CSS (khi có ảnh thật, thêm `imageUrl`). */
export interface CoverArt {
  from: string;
  to: string;
  ink: string | null;
  pattern: number;
  imageUrl: string | null;
}

/** Dạng rút gọn — dùng cho thẻ sách, danh sách, giỏ hàng. */
export interface BookSummary {
  id: number;
  sku: string;
  title: string;
  author: string;
  publisher: string;
  category: CategoryRef;
  condition: ConditionRef;
  price: number;
  originalPrice: number | null;
  discountPercent: number;
  cover: CoverArt;
  rating: number;
  reviewCount: number;
  stock: number;
  tags: string[];
}

/** Dạng đầy đủ — trang chi tiết sách. */
export interface BookDetail extends BookSummary {
  description: string;
  inspectionNote: string;
  publishedYear: number | null;
  pages: number | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  colors: { bg: string; fg: string };
  bookCount: number;
}

export interface Condition {
  id: ConditionId;
  label: string;
  level: number;
  shortLabel: string;
  description: string;
  highlights: string[];
  bookCount: number;
}

/* ---------- Queries ---------- */

export const BOOK_SORTS = [
  "featured",
  "newest",
  "price-asc",
  "price-desc",
  "discount",
  "rating",
  "bestseller"
] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export const bookListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: csvParam(z.string().trim().max(40)).optional(),
  condition: csvParam(z.enum(CONDITION_IDS)).optional(),
  ids: csvParam(z.coerce.number().int().positive(), MAX_PAGE_SIZE * 2).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: flagParam.optional(),
  sort: z.enum(BOOK_SORTS).default("featured"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
});

/** Dạng đã parse (đầu ra) — dùng trong service. */
export type BookListQuery = z.output<typeof bookListQuerySchema>;
/** Dạng đầu vào — dùng ở FE khi gọi API. */
export type BookListParams = Partial<{
  q: string;
  category: string[];
  condition: ConditionId[];
  ids: number[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
  sort: BookSort;
  page: number;
  pageSize: number;
}>;

export const bookIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const relatedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(4)
});
