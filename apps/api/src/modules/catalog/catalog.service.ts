import {
  toSearchTerms,
  type BookDetail,
  type BookListQuery,
  type BookSummary,
  type Category,
  type Condition,
  type ListResponse,
  type Paginated
} from "@sct/shared";
import { NotFoundError } from "../../core/errors.js";
import { toBookDetail, toBookSummary, toCategory, toCondition } from "./catalog.mapper.js";
import type { CatalogRepository } from "./catalog.repository.js";

/** Use-case của danh mục sách. Không biết gì về HTTP hay SQL. */
export class CatalogService {
  constructor(private readonly repo: CatalogRepository) {}

  async listBooks(query: BookListQuery): Promise<Paginated<BookSummary>> {
    const { page, pageSize } = query;
    const { rows, total } = await this.repo.listBooks(
      {
        terms: toSearchTerms(query.q),
        categoryIds: query.category,
        conditionIds: query.condition,
        ids: query.ids,
        minPrice: query.minPrice,
        maxPrice: query.maxPrice,
        inStock: query.inStock
      },
      query.sort,
      { limit: pageSize, offset: (page - 1) * pageSize }
    );
    return {
      data: rows.map(toBookSummary),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    };
  }

  async getBook(id: number): Promise<BookDetail> {
    const row = await this.repo.findBookById(id);
    if (!row) throw new NotFoundError("Không tìm thấy cuốn sách này — có thể nó đã được chuyền tay.", { bookId: id });
    return toBookDetail(row);
  }

  async getRelated(id: number, limit: number): Promise<ListResponse<BookSummary>> {
    const book = await this.repo.findBookById(id);
    if (!book) throw new NotFoundError("Không tìm thấy cuốn sách này.", { bookId: id });
    const rows = await this.repo.findRelated(book, limit);
    return { data: rows.map(toBookSummary) };
  }

  async listCategories(): Promise<ListResponse<Category>> {
    return { data: (await this.repo.listCategories()).map(toCategory) };
  }

  async listConditions(): Promise<ListResponse<Condition>> {
    return { data: (await this.repo.listConditions()).map(toCondition) };
  }
}
