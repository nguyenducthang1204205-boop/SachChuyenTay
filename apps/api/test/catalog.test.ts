import type { BookDetail, BookSummary, Category, Paginated } from "@sct/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, createTestApp } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.database.close());

describe("GET /books", () => {
  it("trả danh sách có phân trang", async () => {
    const res = await ctx.http.get(`${API}/books?pageSize=5`).expect(200);
    const body = res.body as Paginated<BookSummary>;
    expect(body.data).toHaveLength(5);
    expect(body.meta).toEqual({ page: 1, pageSize: 5, total: 24, totalPages: 5 });
    expect(body.data[0]).toMatchObject({
      sku: expect.stringMatching(/^SCT-\d{5}$/),
      category: { id: expect.any(String) }
    });
  });

  it("tìm kiếm không dấu theo tác giả", async () => {
    const res = await ctx.http.get(`${API}/books`).query({ q: "nguyen nhat anh" }).expect(200);
    const titles = (res.body as Paginated<BookSummary>).data.map((b) => b.title);
    expect(titles.sort()).toEqual(["Mắt Biếc", "Tôi Thấy Hoa Vàng Trên Cỏ Xanh"]);
  });

  it("tìm “sách hiếm” ra sách có tag rare", async () => {
    const res = await ctx.http.get(`${API}/books`).query({ q: "hiếm" }).expect(200);
    expect((res.body as Paginated<BookSummary>).data.map((b) => b.id)).toEqual([22]);
  });

  it("lọc theo thể loại, tình trạng, giá, còn hàng và sắp xếp", async () => {
    const res = await ctx.http
      .get(`${API}/books`)
      .query({ category: "vhvn,vhnn", condition: "good,like-new", maxPrice: 60000, inStock: "1", sort: "price-asc" })
      .expect(200);
    const books = (res.body as Paginated<BookSummary>).data;
    expect(books.length).toBeGreaterThan(0);
    for (const b of books) {
      expect(["vhvn", "vhnn"]).toContain(b.category.id);
      expect(["good", "like-new"]).toContain(b.condition.id);
      expect(b.price).toBeLessThanOrEqual(60000);
      expect(b.stock).toBeGreaterThan(0);
    }
    const prices = books.map((b) => b.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it("lấy theo danh sách id (wishlist)", async () => {
    const res = await ctx.http.get(`${API}/books?ids=3,1`).expect(200);
    expect((res.body as Paginated<BookSummary>).data.map((b) => b.id).sort()).toEqual([1, 3]);
  });

  it("trả 400 dạng Problem Details khi tham số sai", async () => {
    const res = await ctx.http.get(`${API}/books?sort=hot&pageSize=999`).expect(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({ code: "VALIDATION_FAILED", status: 400 });
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(["query.sort", "query.pageSize"])
    );
  });
});

describe("GET /books/:id", () => {
  it("trả chi tiết sách", async () => {
    const res = await ctx.http.get(`${API}/books/1`).expect(200);
    const book = res.body as BookDetail;
    expect(book).toMatchObject({ id: 1, title: "Nhà Giả Kim", discountPercent: 43, pages: 228 });
    expect(book.inspectionNote).toBeTruthy();
  });

  it("404 khi không có sách", async () => {
    const res = await ctx.http.get(`${API}/books/99999`).expect(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("sách liên quan ưu tiên cùng thể loại", async () => {
    const res = await ctx.http.get(`${API}/books/2/related?limit=4`).expect(200);
    const related = res.body.data as BookSummary[];
    expect(related).toHaveLength(4);
    expect(related.map((b) => b.id)).not.toContain(2);
    expect(related[0]!.category.id).toBe("vhvn");
  });
});

describe("Danh mục tham chiếu", () => {
  it("thể loại kèm số đầu sách", async () => {
    const res = await ctx.http.get(`${API}/categories`).expect(200);
    const cats = res.body.data as Category[];
    expect(cats).toHaveLength(7);
    expect(cats.reduce((s, c) => s + c.bookCount, 0)).toBe(24);
    expect(res.headers["cache-control"]).toContain("max-age");
  });

  it("tình trạng kèm highlights", async () => {
    const res = await ctx.http.get(`${API}/conditions`).expect(200);
    expect(res.body.data.map((c: { id: string }) => c.id)).toEqual(["like-new", "good", "fair"]);
    expect(res.body.data[0].highlights).toHaveLength(3);
  });
});

describe("Hạ tầng", () => {
  it("health check", async () => {
    await ctx.http.get("/health/live").expect(200);
    const res = await ctx.http.get("/health/ready").expect(200);
    expect(res.body).toEqual({ status: "ok", database: "libsql" });
  });

  it("route không tồn tại → 404 Problem Details + request id", async () => {
    const res = await ctx.http.get(`${API}/khong-co`).set("X-Request-Id", "test-request-123").expect(404);
    expect(res.headers["x-request-id"]).toBe("test-request-123");
    expect(res.body.requestId).toBe("test-request-123");
  });
});
