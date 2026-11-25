import type { BookSort } from "@sct/shared";
import { and, asc, count, desc, eq, getTableColumns, gte, lte, ne, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { inList, likeEscaped } from "../../db/sql.js";
import {
  bookConditions,
  books,
  categories,
  type BookRow,
  type CategoryRow,
  type ConditionRow
} from "../../db/schema.js";
import { escapeLike } from "./catalog.search.js";

/* ---------- Port (interface) — service chỉ biết đến phần này ---------- */

export type BookRecord = BookRow & { categoryName: string; conditionLabel: string };

export interface BookFilter {
  terms: string[];
  categoryIds?: string[];
  conditionIds?: string[];
  ids?: number[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  outOfStock?: boolean;
  /** Mặc định chỉ lấy sách đang hiển thị; trang quản trị dùng "all" / "hidden". */
  visibility?: "published" | "hidden" | "all";
}

export interface PageRequest {
  limit: number;
  offset: number;
}

export interface CatalogRepository {
  listBooks(filter: BookFilter, sort: BookSort, page: PageRequest): Promise<{ rows: BookRecord[]; total: number }>;
  findBookById(id: number, options?: { includeHidden?: boolean }): Promise<BookRecord | null>;
  findBooksByIds(ids: readonly number[]): Promise<BookRecord[]>;
  findRelated(book: Pick<BookRow, "id" | "categoryId">, limit: number): Promise<BookRecord[]>;
  listCategories(): Promise<Array<CategoryRow & { bookCount: number }>>;
  listConditions(): Promise<Array<ConditionRow & { bookCount: number }>>;
}

/* ---------- Adapter: Drizzle / SQLite (D1, libsql) ---------- */

const bookColumns = {
  ...getTableColumns(books),
  categoryName: categories.name,
  conditionLabel: bookConditions.label
};

const SORTS: Record<BookSort, SQL[]> = {
  // Điểm đánh giá có trọng số theo số lượt đánh giá (ít lượt → kém tin cậy), không cần hàm toán học của SQL.
  featured: [
    desc(sql`(${books.stock} > 0)`),
    desc(sql`${books.rating} * ${books.reviewCount} / (${books.reviewCount} + 10.0)`),
    asc(books.id)
  ],
  newest: [desc(books.createdAt), desc(books.id)],
  "price-asc": [asc(books.price), asc(books.id)],
  "price-desc": [desc(books.price), asc(books.id)],
  discount: [
    desc(sql`case when ${books.originalPrice} > 0 then 1.0 - ${books.price} * 1.0 / ${books.originalPrice} else 0 end`),
    asc(books.id)
  ],
  rating: [desc(books.rating), desc(books.reviewCount), asc(books.id)],
  bestseller: [desc(sql`${books.reviewCount} * ${books.rating}`), asc(books.id)]
};

/** Truy vấn sách kèm tên thể loại & nhãn tình trạng (dùng chung cho repository công khai và quản trị). */
export function selectBookRecords(db: Database) {
  return db
    .select(bookColumns)
    .from(books)
    .innerJoin(categories, eq(books.categoryId, categories.id))
    .innerJoin(bookConditions, eq(books.conditionId, bookConditions.id));
}

export class DrizzleCatalogRepository implements CatalogRepository {
  constructor(private readonly db: Database) {}

  private selectBooks() {
    return selectBookRecords(this.db);
  }

  private where(filter: BookFilter): SQL | undefined {
    const visibility = filter.visibility ?? "published";
    const conditions: (SQL | undefined)[] = [
      visibility === "all" ? undefined : eq(books.isPublished, visibility === "published")
    ];
    for (const term of filter.terms) conditions.push(likeEscaped(books.searchText, `%${escapeLike(term)}%`));
    if (filter.categoryIds?.length) conditions.push(inList(books.categoryId, filter.categoryIds));
    if (filter.conditionIds?.length) conditions.push(inList(books.conditionId, filter.conditionIds));
    if (filter.ids?.length) conditions.push(inList(books.id, filter.ids));
    if (filter.minPrice != null) conditions.push(gte(books.price, filter.minPrice));
    if (filter.maxPrice != null) conditions.push(lte(books.price, filter.maxPrice));
    if (filter.inStock) conditions.push(sql`${books.stock} > 0`);
    if (filter.outOfStock) conditions.push(sql`${books.stock} <= 0`);
    return and(...conditions);
  }

  async listBooks(filter: BookFilter, sort: BookSort, page: PageRequest) {
    const where = this.where(filter);
    const [rows, totals] = await Promise.all([
      this.selectBooks()
        .where(where)
        .orderBy(...SORTS[sort])
        .limit(page.limit)
        .offset(page.offset),
      this.db.select({ total: count() }).from(books).where(where)
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  }

  async findBookById(id: number, options: { includeHidden?: boolean } = {}) {
    const [row] = await this.selectBooks()
      .where(and(eq(books.id, id), options.includeHidden ? undefined : eq(books.isPublished, true)))
      .limit(1);
    return row ?? null;
  }

  async findBooksByIds(ids: readonly number[]) {
    if (!ids.length) return [];
    return this.selectBooks().where(inList(books.id, ids));
  }

  async findRelated(book: Pick<BookRow, "id" | "categoryId">, limit: number) {
    return this.selectBooks()
      .where(and(ne(books.id, book.id), eq(books.isPublished, true)))
      .orderBy(
        desc(sql`(${books.categoryId} = ${book.categoryId})`),
        desc(sql`(${books.stock} > 0)`),
        desc(books.rating),
        asc(books.id)
      )
      .limit(limit);
  }

  async listCategories() {
    return this.db
      .select({ ...getTableColumns(categories), bookCount: count(books.id) })
      .from(categories)
      .leftJoin(books, and(eq(books.categoryId, categories.id), eq(books.isPublished, true)))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder));
  }

  async listConditions() {
    return this.db
      .select({ ...getTableColumns(bookConditions), bookCount: count(books.id) })
      .from(bookConditions)
      .leftJoin(books, and(eq(books.conditionId, bookConditions.id), eq(books.isPublished, true)))
      .groupBy(bookConditions.id)
      .orderBy(asc(bookConditions.sortOrder));
  }
}
