import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE, type CartQuote, type OrderConfirmation } from "@sct/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, createTestApp, validCustomer } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.database.close());

const stockOf = async (id: number) => (await ctx.http.get(`${API}/books/${id}`)).body.stock as number;

describe("POST /cart/quote", () => {
  it("tính tổng tiền, phí ship và gộp dòng trùng", async () => {
    const res = await ctx.http
      .post(`${API}/cart/quote`)
      .send({
        items: [
          { bookId: 1, quantity: 1 },
          { bookId: 1, quantity: 1 }
        ]
      })
      .expect(200);
    const quote = res.body as CartQuote;
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0]).toMatchObject({ bookId: 1, quantity: 2, lineTotal: 90_000, issue: null });
    expect(quote.totals).toMatchObject({
      subtotal: 90_000,
      shippingFee: SHIPPING_FEE,
      total: 90_000 + SHIPPING_FEE,
      freeShippingRemaining: FREE_SHIPPING_THRESHOLD - 90_000
    });
  });

  it("đánh dấu sách hết hàng / vượt tồn kho / không tồn tại", async () => {
    const res = await ctx.http
      .post(`${API}/cart/quote`)
      .send({
        items: [
          { bookId: 14, quantity: 1 }, // Mắt Biếc: stock 0
          { bookId: 3, quantity: 5 }, // Sapiens: stock 1
          { bookId: 9999, quantity: 1 }
        ]
      })
      .expect(200);
    const issues = (res.body as CartQuote).lines.map((l) => [l.bookId, l.issue, l.quantity]);
    expect(issues).toEqual([
      [14, "SOLD_OUT", 0],
      [3, "QUANTITY_ADJUSTED", 1],
      [9999, "NOT_FOUND", 0]
    ]);
  });

  it("áp mã giảm giá hợp lệ (không phân biệt hoa thường)", async () => {
    const res = await ctx.http
      .post(`${API}/cart/quote`)
      .send({ items: [{ bookId: 3, quantity: 1 }], couponCode: "docxanh" })
      .expect(200);
    const quote = res.body as CartQuote;
    expect(quote.coupon).toEqual({ code: "DOCXANH", label: expect.any(String), percent: 15 });
    expect(quote.totals.discount).toBe(Math.round(135_000 * 0.15));
  });

  it("báo lỗi mã giảm giá không hợp lệ mà vẫn trả báo giá", async () => {
    const res = await ctx.http
      .post(`${API}/cart/quote`)
      .send({ items: [{ bookId: 3, quantity: 1 }], couponCode: "FAKE" })
      .expect(200);
    expect(res.body.coupon).toBeNull();
    expect(res.body.couponError).toContain("FAKE");
  });
});

describe("POST /orders", () => {
  it("tạo đơn, tính tiền ở server và trừ tồn kho", async () => {
    const before = await stockOf(4);
    const res = await ctx.http
      .post(`${API}/orders`)
      .send({
        customer: validCustomer,
        paymentMethod: "cod",
        items: [{ bookId: 4, quantity: 2 }],
        couponCode: "CHUYENTAY10",
        // Client cố gửi giá giả — server phải bỏ qua
        total: 1
      })
      .expect(201);
    const order = res.body as OrderConfirmation;
    expect(order.code).toMatch(/^SCT-\d{6}-[A-Z0-9]{6}$/);
    expect(order).toMatchObject({
      status: "pending",
      phone: "0909123456",
      coupon: { code: "CHUYENTAY10", percent: 10 }
    });
    expect(order.totals).toMatchObject({
      subtotal: 76_000,
      discount: 7_600,
      shippingFee: SHIPPING_FEE,
      total: 76_000 - 7_600 + SHIPPING_FEE
    });
    expect(await stockOf(4)).toBe(before - 2);
  });

  it("idempotency: gửi lại cùng key không tạo đơn mới", async () => {
    const body = { customer: validCustomer, paymentMethod: "bank", items: [{ bookId: 7, quantity: 1 }] };
    const first = await ctx.http
      .post(`${API}/orders`)
      .set("Idempotency-Key", "checkout-abc-123")
      .send(body)
      .expect(201);
    const stockAfterFirst = await stockOf(7);
    const second = await ctx.http
      .post(`${API}/orders`)
      .set("Idempotency-Key", "checkout-abc-123")
      .send(body)
      .expect(200);
    expect(second.body.code).toBe(first.body.code);
    expect(await stockOf(7)).toBe(stockAfterFirst);
  });

  it("409 OUT_OF_STOCK và KHÔNG trừ kho dòng nào khi một dòng thiếu hàng", async () => {
    const before = await stockOf(1);
    const res = await ctx.http
      .post(`${API}/orders`)
      .send({
        customer: validCustomer,
        paymentMethod: "cod",
        items: [
          { bookId: 1, quantity: 1 },
          { bookId: 14, quantity: 1 }
        ]
      })
      .expect(409);
    expect(res.body.code).toBe("OUT_OF_STOCK");
    expect(res.body.shortages).toEqual([{ bookId: 14, title: "Mắt Biếc", requested: 1, available: 0 }]);
    expect(await stockOf(1)).toBe(before);
  });

  it("422 khi mã giảm giá không hợp lệ", async () => {
    const res = await ctx.http
      .post(`${API}/orders`)
      .send({
        customer: validCustomer,
        paymentMethod: "cod",
        items: [{ bookId: 1, quantity: 1 }],
        couponCode: "HETHAN"
      })
      .expect(422);
    expect(res.body.code).toBe("INVALID_COUPON");
  });

  it("400 với lỗi chi tiết từng trường khi thông tin khách sai", async () => {
    const res = await ctx.http
      .post(`${API}/orders`)
      .send({ customer: { name: "A", phone: "123", address: "ngắn" }, paymentMethod: "cash", items: [] })
      .expect(400);
    const paths = res.body.errors.map((e: { path: string }) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "body.customer.name",
        "body.customer.phone",
        "body.customer.address",
        "body.paymentMethod",
        "body.items"
      ])
    );
  });

  it("400 khi body không phải JSON hợp lệ", async () => {
    const res = await ctx.http.post(`${API}/orders`).set("Content-Type", "application/json").send("{oops").expect(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });
});
