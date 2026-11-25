import type { AdminBook, AdminOrderDetail } from "@sct/shared";
import supertest from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { books, orders } from "../src/db/schema.js";
import { DrizzleOrderRepository, StockConflictError } from "../src/modules/checkout/checkout.repository.js";
import { API, createTestApp, validCustomer } from "./helpers.js";

/*
 * Toàn vẹn dữ liệu khi KHÔNG có giao dịch tương tác (Cloudflare D1 chỉ có batch nguyên tử):
 * chống bán quá số lượng, ghi đơn "tất cả hoặc không gì", hoàn kho đúng một lần.
 */

let ctx: Awaited<ReturnType<typeof createTestApp>>;
let admin: ReturnType<typeof supertest.agent>;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = supertest.agent(ctx.app);
  await admin
    .post(`${API}/admin/auth/login`)
    .send({ email: "admin@sachchuyentay.vn", password: "admin12345" })
    .expect(200);
});
afterAll(() => ctx.database.close());

async function bookWithStock(stock: number): Promise<AdminBook> {
  const { body } = await admin.get(`${API}/admin/books?stock=in-stock&pageSize=1&sort=price-desc`);
  const book = body.data[0] as AdminBook;
  return (await admin.patch(`${API}/admin/books/${book.id}`).send({ stock }).expect(200)).body as AdminBook;
}

const order = (bookId: number, quantity = 1) =>
  ctx.http.post(`${API}/orders`).send({ customer: validCustomer, items: [{ bookId, quantity }], paymentMethod: "cod" });

const stockOf = async (id: number) => ((await admin.get(`${API}/admin/books/${id}`)).body as AdminBook).stock;

describe("Đặt hàng đồng thời", () => {
  it("hai khách cùng mua cuốn cuối cùng: chỉ một đơn thành công", async () => {
    const book = await bookWithStock(1);
    const results = await Promise.all([order(book.id), order(book.id), order(book.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(results.find((r) => r.status === 409)!.body.code).toBe("OUT_OF_STOCK");
    expect(await stockOf(book.id)).toBe(0);
  });

  it("batch thất bại thì không có gì được ghi (không trừ kho, không có đơn)", async () => {
    const book = await bookWithStock(2);
    const repo = new DrizzleOrderRepository(ctx.database.db);
    const ordersBefore = (await ctx.database.db.select().from(orders)).length;
    const line = (bookId: number, quantity: number) => ({
      bookId,
      title: "x",
      unitPrice: 1000,
      originalPrice: null,
      quantity,
      lineTotal: 1000 * quantity
    });
    const { body: other } = await admin.get(`${API}/admin/books?stock=in-stock&pageSize=1&sort=price-asc`);
    const otherBook = other.data[0] as AdminBook;

    await expect(
      repo.place(
        {
          code: "SCT-TEST-ATOMIC",
          customerName: "A",
          phone: "0900000000",
          email: null,
          address: "x",
          note: null,
          paymentMethod: "cod",
          couponCode: null,
          couponLabel: null,
          couponPercent: null,
          subtotal: 0,
          discount: 0,
          shippingFee: 0,
          total: 0,
          savings: 0,
          idempotencyKey: null
        },
        // cuốn thứ nhất đủ hàng, cuốn thứ hai thiếu → cả hai đều không bị trừ
        [line(otherBook.id, 1), line(book.id, 5)]
      )
    ).rejects.toBeInstanceOf(StockConflictError);

    expect(await stockOf(book.id)).toBe(2);
    expect(await stockOf(otherBook.id)).toBe(otherBook.stock);
    expect((await ctx.database.db.select().from(orders)).length).toBe(ordersBefore);
    expect((await ctx.database.db.select().from(books)).every((b) => b.stock >= 0)).toBe(true);
  });

  it("đơn nhiều cuốn: trừ kho đúng từng cuốn và lưu đủ dòng đơn", async () => {
    const { body } = await admin.get(`${API}/admin/books?stock=in-stock&pageSize=3`);
    const picked = (body.data as AdminBook[]).slice(0, 3);
    const res = await ctx.http
      .post(`${API}/orders`)
      .send({
        customer: validCustomer,
        items: picked.map((b) => ({ bookId: b.id, quantity: 1 })),
        paymentMethod: "cod"
      })
      .expect(201);
    expect(res.body.items).toHaveLength(3);
    for (const b of picked) expect(await stockOf(b.id)).toBe(b.stock - 1);
  });
});

describe("Đơn lớn", () => {
  it("đơn 15 cuốn khác nhau (nhiều câu lệnh ghi dòng đơn trong cùng batch)", async () => {
    const { body } = await admin.get(`${API}/admin/books?stock=in-stock&pageSize=15&sort=price-asc`);
    const picked = body.data as AdminBook[];
    expect(picked.length).toBe(15);
    const res = await ctx.http
      .post(`${API}/orders`)
      .send({
        customer: validCustomer,
        items: picked.map((b) => ({ bookId: b.id, quantity: 1 })),
        paymentMethod: "cod"
      })
      .expect(201);
    expect(res.body.items).toHaveLength(15);
    expect(res.body.items.map((i: { bookId: number }) => i.bookId).sort()).toEqual(picked.map((b) => b.id).sort());
    for (const b of picked) expect(await stockOf(b.id)).toBe(b.stock - 1);
  });
});

describe("Huỷ đơn đồng thời", () => {
  it("hai quản trị viên cùng huỷ một đơn: tồn kho chỉ được hoàn một lần", async () => {
    const book = await bookWithStock(5);
    await order(book.id, 2).expect(201);
    const { body } = await admin.get(`${API}/admin/orders?pageSize=1`);
    const id = body.data[0].id as number;
    expect(await stockOf(book.id)).toBe(3);

    const results = await Promise.all([
      admin.patch(`${API}/admin/orders/${id}/status`).send({ status: "cancelled" }),
      admin.patch(`${API}/admin/orders/${id}/status`).send({ status: "cancelled" })
    ]);
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(results.some((r) => r.status === 200 && (r.body as AdminOrderDetail).status === "cancelled")).toBe(true);
    expect(await stockOf(book.id)).toBe(5);
  });
});

describe("Tìm đơn ở trang quản trị", () => {
  it("không dấu, không phân biệt hoa thường, theo cả số điện thoại liền", async () => {
    const { body: b } = await admin.get(`${API}/admin/books?stock=in-stock&pageSize=1`);
    await ctx.http
      .post(`${API}/orders`)
      .send({
        customer: { ...validCustomer, name: "Đặng Thị Huệ", phone: "0912 345 678" },
        items: [{ bookId: b.data[0].id, quantity: 1 }],
        paymentMethod: "cod"
      })
      .expect(201);
    for (const q of ["dang thi hue", "HUỆ", "Đặng", "0912345678", "0912 345"]) {
      const { body } = await admin.get(`${API}/admin/orders`).query({ q }).expect(200);
      expect(
        body.data.some((o: { customerName: string }) => o.customerName === "Đặng Thị Huệ"),
        q
      ).toBe(true);
    }
    const none = await admin.get(`${API}/admin/orders`).query({ q: "100%_" }).expect(200);
    expect(none.body.data).toHaveLength(0);
  });
});
