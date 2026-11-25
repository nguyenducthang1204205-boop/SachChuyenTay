import type { AdminBook, AdminCategory, AdminOrderDetail, DashboardStats, Paginated } from "@sct/shared";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, createTestApp, validCustomer } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let admin: ReturnType<typeof supertest.agent>;

const ADMIN = { email: "admin@sachchuyentay.vn", password: "admin12345" };

const newBook = {
  title: "Đất Rừng Phương Nam",
  author: "Đoàn Giỏi",
  publisher: "NXB Kim Đồng",
  categoryId: "vhvn",
  conditionId: "good",
  price: 55_000,
  originalPrice: 98_000,
  publishedYear: 2019,
  pages: 320,
  stock: 2,
  tags: ["bestseller"],
  description: "Hành trình của bé An qua miền Tây Nam Bộ.",
  inspectionNote: "Bìa trầy nhẹ.",
  isPublished: true,
  cover: { from: "#3c6e47", to: "#1f4027", ink: null, pattern: 1, imageUrl: null }
};

beforeAll(async () => {
  ctx = await createTestApp();
  admin = supertest.agent(ctx.app);
  await admin.post(`${API}/admin/auth/login`).send(ADMIN).expect(200);
});
afterAll(() => ctx.database.close());

describe("Xác thực quản trị", () => {
  it("chặn truy cập khi chưa đăng nhập", async () => {
    const res = await ctx.http.get(`${API}/admin/books`).expect(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("sai mật khẩu → 401, không lộ email có tồn tại hay không", async () => {
    const res = await ctx.http
      .post(`${API}/admin/auth/login`)
      .send({ ...ADMIN, password: "sai-mat-khau" })
      .expect(401);
    expect(res.body.detail).toBe("Email hoặc mật khẩu không đúng.");
  });

  it("đăng nhập đặt cookie HttpOnly + SameSite=Strict, /me trả thông tin", async () => {
    const res = await ctx.http.post(`${API}/admin/auth/login`).send(ADMIN).expect(200);
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/sct_admin=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    const me = await admin.get(`${API}/admin/auth/me`).expect(200);
    expect(me.body).toMatchObject({ email: ADMIN.email });
  });

  it("đăng xuất vô hiệu hoá phiên", async () => {
    const agent = supertest.agent(ctx.app);
    await agent.post(`${API}/admin/auth/login`).send(ADMIN).expect(200);
    await agent.post(`${API}/admin/auth/logout`).expect(204);
    await agent.get(`${API}/admin/auth/me`).expect(401);
  });
});

describe("Quản lý sách", () => {
  let created: AdminBook;

  it("thêm sách mới → hiện ngay ở cửa hàng & tìm kiếm không dấu", async () => {
    const res = await admin.post(`${API}/admin/books`).send(newBook).expect(201);
    created = res.body;
    expect(created).toMatchObject({
      title: newBook.title,
      sku: expect.stringMatching(/^SCT-\d{5}$/),
      discountPercent: 44
    });
    expect(created.id).toBeGreaterThan(24);
    const search = await ctx.http.get(`${API}/books`).query({ q: "dat rung phuong nam" }).expect(200);
    expect(search.body.data.map((b: { id: number }) => b.id)).toEqual([created.id]);
  });

  it("kiểm tra dữ liệu: giá bìa thấp hơn giá bán / thể loại không tồn tại", async () => {
    const r1 = await admin
      .post(`${API}/admin/books`)
      .send({ ...newBook, originalPrice: 10_000 })
      .expect(400);
    expect(r1.body.errors[0].path).toBe("body.originalPrice");
    const r2 = await admin
      .post(`${API}/admin/books`)
      .send({ ...newBook, categoryId: "khong-co" })
      .expect(400);
    expect(r2.body.errors[0].path).toBe("body.categoryId");
  });

  it("sửa một phần & ẩn sách → biến mất khỏi cửa hàng nhưng vẫn thấy trong admin", async () => {
    const res = await admin
      .patch(`${API}/admin/books/${created.id}`)
      .send({ price: 60_000, isPublished: false })
      .expect(200);
    expect(res.body).toMatchObject({ price: 60_000, isPublished: false, title: newBook.title });
    await ctx.http.get(`${API}/books/${created.id}`).expect(404);
    const list = await admin.get(`${API}/admin/books`).query({ visibility: "hidden" }).expect(200);
    expect((list.body as Paginated<AdminBook>).data.map((b) => b.id)).toContain(created.id);
  });

  it("xoá sách chưa có đơn hàng", async () => {
    await admin.delete(`${API}/admin/books/${created.id}`).expect(204);
    await admin.get(`${API}/admin/books/${created.id}`).expect(404);
  });

  it("không cho xoá sách đã có trong đơn hàng (409 IN_USE)", async () => {
    await ctx.http
      .post(`${API}/orders`)
      .send({ customer: validCustomer, paymentMethod: "cod", items: [{ bookId: 2, quantity: 1 }] })
      .expect(201);
    const res = await admin.delete(`${API}/admin/books/2`).expect(409);
    expect(res.body.code).toBe("IN_USE");
  });
});

describe("Quản lý thể loại", () => {
  it("thêm, đổi tên (cập nhật từ khoá tìm kiếm của sách), không xoá được khi còn sách", async () => {
    await admin
      .post(`${API}/admin/categories`)
      .send({
        id: "triet-hoc",
        name: "Triết học",
        icon: "book",
        colors: { bg: "#eeeeee", fg: "#333333" },
        sortOrder: 8
      })
      .expect(201);
    await admin
      .post(`${API}/admin/categories`)
      .send({ id: "triet-hoc", name: "Trùng", colors: { bg: "#eeeeee", fg: "#333333" } })
      .expect(409);

    await admin.patch(`${API}/admin/categories/congnghe`).send({ name: "Lập trình" }).expect(200);
    const search = await ctx.http.get(`${API}/books`).query({ q: "lap trinh" }).expect(200);
    expect(search.body.meta.total).toBe(2);

    const res = await admin.delete(`${API}/admin/categories/congnghe`).expect(409);
    expect(res.body.code).toBe("IN_USE");
    await admin.delete(`${API}/admin/categories/triet-hoc`).expect(204);

    const list = (await admin.get(`${API}/admin/categories`).expect(200)).body.data as AdminCategory[];
    expect(list.find((c) => c.id === "congnghe")).toMatchObject({ name: "Lập trình", totalBooks: 2 });
  });
});

describe("Quản lý đơn hàng", () => {
  it("đổi trạng thái theo đúng luồng; huỷ đơn hoàn lại tồn kho", async () => {
    const stockBefore = (await ctx.http.get(`${API}/books/8`)).body.stock as number;
    const order = await ctx.http
      .post(`${API}/orders`)
      .send({ customer: validCustomer, paymentMethod: "cod", items: [{ bookId: 8, quantity: 2 }] })
      .expect(201);
    expect((await ctx.http.get(`${API}/books/8`)).body.stock).toBe(stockBefore - 2);

    const list = await admin.get(`${API}/admin/orders`).query({ q: order.body.code }).expect(200);
    const id = list.body.data[0].id as number;

    const bad = await admin.patch(`${API}/admin/orders/${id}/status`).send({ status: "completed" }).expect(422);
    expect(bad.body.code).toBe("INVALID_TRANSITION");

    await admin.patch(`${API}/admin/orders/${id}/status`).send({ status: "confirmed" }).expect(200);
    const cancelled = await admin.patch(`${API}/admin/orders/${id}/status`).send({ status: "cancelled" }).expect(200);
    expect((cancelled.body as AdminOrderDetail).status).toBe("cancelled");
    expect((await ctx.http.get(`${API}/books/8`)).body.stock).toBe(stockBefore);
  });
});

describe("Thu mua & dashboard", () => {
  it("cập nhật trạng thái yêu cầu thu mua", async () => {
    await ctx.http
      .post(`${API}/buyback-requests`)
      .send({ name: "Lan Anh", phone: "0987654321", bookList: "Sách A\nSách B" })
      .expect(201);
    const list = await admin.get(`${API}/admin/buyback-requests`).query({ status: "new" }).expect(200);
    const id = list.body.data[0].id as number;
    const res = await admin
      .patch(`${API}/admin/buyback-requests/${id}/status`)
      .send({ status: "contacted" })
      .expect(200);
    expect(res.body.status).toBe("contacted");
  });

  it("dashboard trả số liệu tổng quan", async () => {
    const res = await admin.get(`${API}/admin/dashboard`).expect(200);
    const stats = res.body as DashboardStats;
    expect(stats.books.total).toBeGreaterThanOrEqual(24);
    expect(stats.orders.byStatus.cancelled).toBe(1);
    expect(stats.recentOrders.length).toBeGreaterThan(0);
  });
});
