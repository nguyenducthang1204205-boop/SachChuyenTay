import type {
  AdminBook,
  AdminBookListQuery,
  AdminCategory,
  BookCreateCommand,
  BookUpdateCommand,
  CategoryCreateCommand,
  CategoryUpdateCommand,
  ListResponse,
  Paginated
} from "@sct/shared";
import { toSearchTerms } from "@sct/shared";
import { ConflictError, InUseError, NotFoundError, ValidationError } from "../../core/errors.js";
import type { Logger } from "../../core/logger.js";
import type { MediaService } from "../media/media.service.js";
import type { BookWrite, CatalogAdminRepository } from "./catalog-admin.repository.js";
import { toBookDetail, toCategory } from "./catalog.mapper.js";
import type { BookRecord, CatalogRepository } from "./catalog.repository.js";
import { buildSearchText } from "./catalog.search.js";

const toAdminBook = (row: BookRecord): AdminBook => ({
  ...toBookDetail(row),
  isPublished: row.isPublished,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});

/** Chuyển bản ghi hiện có về dạng lệnh đầy đủ — để cập nhật từng phần rồi kiểm tra lại toàn bộ. */
const toCommand = (r: BookRecord): BookCreateCommand => ({
  title: r.title,
  author: r.author,
  publisher: r.publisher,
  categoryId: r.categoryId,
  conditionId: r.conditionId as BookCreateCommand["conditionId"],
  price: r.price,
  originalPrice: r.originalPrice,
  publishedYear: r.publishedYear,
  pages: r.pages,
  stock: r.stock,
  rating: r.rating,
  reviewCount: r.reviewCount,
  tags: r.tags,
  description: r.description,
  inspectionNote: r.inspectionNote,
  isPublished: r.isPublished,
  cover: { from: r.coverFrom, to: r.coverTo, ink: r.coverInk, pattern: r.coverPattern, imageUrl: r.coverImageUrl }
});

/** Use-case quản trị danh mục: CRUD sách & thể loại, giữ toàn vẹn dữ liệu (search_text, ràng buộc tham chiếu). */
export class CatalogAdminService {
  constructor(
    private readonly catalog: CatalogRepository,
    private readonly admin: CatalogAdminRepository,
    private readonly media: Pick<MediaService, "discardCover">,
    private readonly logger: Logger
  ) {}

  /* ---------- Sách ---------- */

  async listBooks(q: AdminBookListQuery): Promise<Paginated<AdminBook>> {
    const { rows, total } = await this.catalog.listBooks(
      {
        terms: toSearchTerms(q.q),
        categoryIds: q.category ? [q.category] : undefined,
        visibility: q.visibility,
        inStock: q.stock === "in-stock",
        outOfStock: q.stock === "out-of-stock"
      },
      q.sort,
      { limit: q.pageSize, offset: (q.page - 1) * q.pageSize }
    );
    return {
      data: rows.map(toAdminBook),
      meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) }
    };
  }

  private async requireBook(id: number): Promise<BookRecord> {
    const row = await this.catalog.findBookById(id, { includeHidden: true });
    if (!row) throw new NotFoundError("Không tìm thấy sách.", { bookId: id });
    return row;
  }

  async getBook(id: number): Promise<AdminBook> {
    return toAdminBook(await this.requireBook(id));
  }

  private async toWrite(cmd: BookCreateCommand): Promise<BookWrite> {
    const category = await this.admin.findCategory(cmd.categoryId);
    if (!category) throw new ValidationError([{ path: "body.categoryId", message: "Thể loại không tồn tại" }]);
    if (cmd.originalPrice != null && cmd.originalPrice < cmd.price) {
      throw new ValidationError([{ path: "body.originalPrice", message: "Giá bìa phải lớn hơn hoặc bằng giá bán" }]);
    }
    const tags = [...new Set(cmd.tags.map((t) => t.toLowerCase()))];
    return {
      title: cmd.title,
      author: cmd.author,
      publisher: cmd.publisher,
      categoryId: cmd.categoryId,
      conditionId: cmd.conditionId,
      price: cmd.price,
      originalPrice: cmd.originalPrice,
      publishedYear: cmd.publishedYear,
      pages: cmd.pages,
      stock: cmd.stock,
      rating: cmd.rating,
      reviewCount: cmd.reviewCount,
      tags,
      description: cmd.description,
      inspectionNote: cmd.inspectionNote,
      isPublished: cmd.isPublished,
      coverFrom: cmd.cover.from,
      coverTo: cmd.cover.to,
      coverInk: cmd.cover.ink,
      coverPattern: cmd.cover.pattern,
      coverImageUrl: cmd.cover.imageUrl,
      searchText: buildSearchText({ ...cmd, tags, categoryName: category.name })
    };
  }

  async createBook(cmd: BookCreateCommand): Promise<AdminBook> {
    const id = await this.admin.createBook(await this.toWrite(cmd));
    this.logger.info({ bookId: id }, "Book created");
    return this.getBook(id);
  }

  async updateBook(id: number, patch: BookUpdateCommand): Promise<AdminBook> {
    const current = await this.requireBook(id);
    const merged: BookCreateCommand = { ...toCommand(current), ...stripUndefined(patch) };
    await this.admin.updateBook(id, await this.toWrite(merged));
    this.logger.info({ bookId: id, fields: Object.keys(patch) }, "Book updated");
    // Đã thay/bỏ ảnh bìa → xoá ảnh cũ khỏi kho lưu trữ (sau khi DB đã ghi thành công).
    if (current.coverImageUrl !== merged.cover.imageUrl) await this.media.discardCover(current.coverImageUrl);
    return this.getBook(id);
  }

  async deleteBook(id: number): Promise<void> {
    const book = await this.requireBook(id);
    const orderLines = await this.admin.countOrderItemsForBook(id);
    if (orderLines > 0) {
      throw new InUseError(
        `Sách đã có trong ${orderLines} đơn hàng nên không thể xoá (cần giữ lịch sử đơn). Hãy chuyển sang "Ẩn" thay vì xoá.`
      );
    }
    await this.admin.deleteBook(id);
    this.logger.info({ bookId: id }, "Book deleted");
    await this.media.discardCover(book.coverImageUrl);
  }

  /* ---------- Thể loại ---------- */

  async listCategories(): Promise<ListResponse<AdminCategory>> {
    const rows = await this.admin.listCategoriesWithTotals();
    return { data: rows.map((r) => ({ ...toCategory(r), sortOrder: r.sortOrder, totalBooks: r.totalBooks })) };
  }

  async createCategory(cmd: CategoryCreateCommand): Promise<void> {
    if (await this.admin.findCategory(cmd.id)) throw new ConflictError(`Mã thể loại “${cmd.id}” đã tồn tại.`);
    await this.admin.createCategory({
      id: cmd.id,
      name: cmd.name,
      icon: cmd.icon,
      bgColor: cmd.colors.bg,
      fgColor: cmd.colors.fg,
      sortOrder: cmd.sortOrder
    });
  }

  async updateCategory(id: string, cmd: CategoryUpdateCommand): Promise<void> {
    const current = await this.admin.findCategory(id);
    if (!current) throw new NotFoundError("Không tìm thấy thể loại.");
    await this.admin.updateCategory(id, {
      ...(cmd.name !== undefined && { name: cmd.name }),
      ...(cmd.icon !== undefined && { icon: cmd.icon }),
      ...(cmd.colors && { bgColor: cmd.colors.bg, fgColor: cmd.colors.fg }),
      ...(cmd.sortOrder !== undefined && { sortOrder: cmd.sortOrder })
    });
    // Tên thể loại là một phần của từ khoá tìm kiếm → cập nhật lại search_text của các sách thuộc thể loại.
    if (cmd.name && cmd.name !== current.name) {
      for (const book of await this.admin.findBooksByCategory(id)) {
        await this.admin.updateBook(book.id, { searchText: buildSearchText({ ...book, categoryName: cmd.name }) });
      }
    }
  }

  async deleteCategory(id: string): Promise<void> {
    if (!(await this.admin.findCategory(id))) throw new NotFoundError("Không tìm thấy thể loại.");
    const n = await this.admin.countBooksInCategory(id);
    if (n > 0)
      throw new InUseError(`Thể loại còn ${n} cuốn sách. Hãy chuyển các sách sang thể loại khác trước khi xoá.`);
    await this.admin.deleteCategory(id);
  }
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
