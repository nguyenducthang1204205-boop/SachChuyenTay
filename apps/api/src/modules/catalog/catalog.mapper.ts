import {
  discountPercent,
  type BookDetail,
  type BookSummary,
  type Category,
  type Condition,
  type ConditionId
} from "@sct/shared";
import type { CategoryRow, ConditionRow } from "../../db/schema.js";
import type { BookRecord } from "./catalog.repository.js";

/**
 * Mapper: chuyển bản ghi CSDL → DTO công khai. Tách riêng để lược đồ DB
 * có thể thay đổi mà không phá vỡ hợp đồng API.
 */

export function toBookSummary(row: BookRecord): BookSummary {
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    author: row.author,
    publisher: row.publisher,
    category: { id: row.categoryId, name: row.categoryName },
    condition: { id: row.conditionId as ConditionId, label: row.conditionLabel },
    price: row.price,
    originalPrice: row.originalPrice,
    discountPercent: discountPercent(row.price, row.originalPrice),
    cover: {
      from: row.coverFrom,
      to: row.coverTo,
      ink: row.coverInk,
      pattern: row.coverPattern,
      imageUrl: row.coverImageUrl
    },
    rating: row.rating,
    reviewCount: row.reviewCount,
    stock: Math.max(0, row.stock),
    tags: row.tags
  };
}

export function toBookDetail(row: BookRecord): BookDetail {
  return {
    ...toBookSummary(row),
    description: row.description,
    inspectionNote: row.inspectionNote,
    publishedYear: row.publishedYear,
    pages: row.pages
  };
}

export function toCategory(row: CategoryRow & { bookCount: number }): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    colors: { bg: row.bgColor, fg: row.fgColor },
    bookCount: row.bookCount
  };
}

export function toCondition(row: ConditionRow & { bookCount: number }): Condition {
  return {
    id: row.id as ConditionId,
    label: row.label,
    level: row.level,
    shortLabel: row.shortLabel,
    description: row.description,
    highlights: row.highlights,
    bookCount: row.bookCount
  };
}
