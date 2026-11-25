import { randomUUID } from "node:crypto";
import { asc, count, eq, getTableColumns, sql } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { books, categories, orderItems, type CategoryRow, type NewBookRow } from "../../db/schema.js";
import type { BookRecord } from "./catalog.repository.js";
import { selectBookRecords } from "./catalog.repository.js";

export type BookWrite = Omit<NewBookRow, "id" | "sku" | "createdAt" | "updatedAt">;
export type CategoryWrite = typeof categories.$inferInsert;

/** Thao tác ghi cho khu vực quản trị — tách khỏi repository đọc công khai (CQRS nhẹ). */
export interface CatalogAdminRepository {
  createBook(input: BookWrite): Promise<number>;
  updateBook(id: number, input: Partial<BookWrite>): Promise<void>;
  deleteBook(id: number): Promise<void>;
  countOrderItemsForBook(id: number): Promise<number>;
  findBooksByCategory(categoryId: string): Promise<BookRecord[]>;

  listCategoriesWithTotals(): Promise<Array<CategoryRow & { bookCount: number; totalBooks: number }>>;
  findCategory(id: string): Promise<CategoryRow | null>;
  createCategory(input: CategoryWrite): Promise<void>;
  updateCategory(id: string, input: Partial<CategoryWrite>): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  countBooksInCategory(id: string): Promise<number>;
}

export class DrizzleCatalogAdminRepository implements CatalogAdminRepository {
  constructor(private readonly db: Database) {}

  async createBook(input: BookWrite) {
    // SKU phụ thuộc id tự tăng → chèn với SKU tạm duy nhất rồi đổi thành SCT-xxxxx, trong cùng một batch (nguyên tử).
    const tempSku = `pending-${randomUUID()}`;
    const [inserted] = await this.db.batch([
      this.db
        .insert(books)
        .values({ ...input, sku: tempSku })
        .returning({ id: books.id }),
      this.db
        .update(books)
        .set({ sku: sql`'SCT-' || printf('%05d', ${books.id})` })
        .where(eq(books.sku, tempSku))
    ]);
    const id = inserted[0]?.id;
    if (!id) throw new Error("Không tạo được sách");
    return id;
  }

  async updateBook(id: number, input: Partial<BookWrite>) {
    await this.db.update(books).set(input).where(eq(books.id, id));
  }

  async deleteBook(id: number) {
    await this.db.delete(books).where(eq(books.id, id));
  }

  async countOrderItemsForBook(id: number) {
    const [row] = await this.db.select({ n: count() }).from(orderItems).where(eq(orderItems.bookId, id));
    return row?.n ?? 0;
  }

  async findBooksByCategory(categoryId: string) {
    return selectBookRecords(this.db).where(eq(books.categoryId, categoryId));
  }

  async listCategoriesWithTotals() {
    return this.db
      .select({
        ...getTableColumns(categories),
        bookCount: sql<number>`count(${books.id}) filter (where ${books.isPublished})`.mapWith(Number),
        totalBooks: count(books.id)
      })
      .from(categories)
      .leftJoin(books, eq(books.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async findCategory(id: string) {
    const [row] = await this.db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return row ?? null;
  }

  async createCategory(input: CategoryWrite) {
    await this.db.insert(categories).values(input);
  }

  async updateCategory(id: string, input: Partial<CategoryWrite>) {
    await this.db.update(categories).set(input).where(eq(categories.id, id));
  }

  async deleteCategory(id: string) {
    await this.db.delete(categories).where(eq(categories.id, id));
  }

  async countBooksInCategory(id: string) {
    const [row] = await this.db.select({ n: count() }).from(books).where(eq(books.categoryId, id));
    return row?.n ?? 0;
  }
}
