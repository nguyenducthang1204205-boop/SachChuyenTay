import type { BookDetail, BookListParams, BookSummary, Category, Condition, Paginated } from "@sct/shared";
import { catalogApi } from "../api/endpoints.js";

/**
 * Service danh mục phía client:
 *  - cache + gộp request trùng cho dữ liệu tham chiếu (thể loại, tình trạng)
 *  - ghi nhớ sách đã tải để các hành động (thêm giỏ theo id) không phải gọi lại API
 */

const memo = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().catch((err) => {
      memo.delete(key); // lỗi thì không cache, lần sau thử lại
      throw err;
    });
    memo.set(key, p);
  }
  return p;
}

const knownBooks = new Map<number, BookSummary>();
const remember = <T extends BookSummary>(books: T[]): T[] => {
  for (const b of books) knownBooks.set(b.id, b);
  return books;
};

export const catalogService = {
  categories: (): Promise<Category[]> => cached("categories", async () => (await catalogApi.listCategories()).data),
  conditions: (): Promise<Condition[]> => cached("conditions", async () => (await catalogApi.listConditions()).data),

  async books(params: BookListParams, signal?: AbortSignal): Promise<Paginated<BookSummary>> {
    const res = await catalogApi.listBooks(params, signal);
    remember(res.data);
    return res;
  },

  async book(id: number, signal?: AbortSignal): Promise<BookDetail> {
    const [book] = remember([await catalogApi.getBook(id, signal)]);
    return book!;
  },

  async related(id: number, limit = 4): Promise<BookSummary[]> {
    return remember((await catalogApi.getRelated(id, limit)).data);
  },

  /** Sách đã từng được tải trong phiên (đồng bộ, không gọi mạng). */
  known: (id: number): BookSummary | undefined => knownBooks.get(id)
};
