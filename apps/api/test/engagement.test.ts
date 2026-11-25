import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, createTestApp } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof createTestApp>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.database.close());

describe("POST /buyback-requests", () => {
  it("ghi nhận yêu cầu thu mua và đếm số cuốn", async () => {
    const res = await ctx.http
      .post(`${API}/buyback-requests`)
      .send({
        name: "Trần Minh Khoa",
        phone: "0912345678",
        city: "hn",
        method: "credit",
        bookList: "Nhà Giả Kim – còn mới\n\nSapiens – bìa cứng\nĐắc Nhân Tâm",
        pickup: true
      })
      .expect(201);
    expect(res.body).toMatchObject({ reference: expect.stringMatching(/^BB-\d{6}-/), bookCount: 3 });
  });

  it("từ chối dữ liệu sai", async () => {
    const res = await ctx.http
      .post(`${API}/buyback-requests`)
      .send({ name: "K", phone: "abc", bookList: "" })
      .expect(400);
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(
      expect.arrayContaining(["body.name", "body.phone", "body.bookList"])
    );
  });
});

describe("POST /newsletter/subscriptions", () => {
  it("đăng ký mới → 201, đăng ký lại → 200 (idempotent)", async () => {
    const first = await ctx.http
      .post(`${API}/newsletter/subscriptions`)
      .send({ email: " Doc.Gia@Example.com " })
      .expect(201);
    expect(first.body).toEqual({
      email: "doc.gia@example.com",
      alreadySubscribed: false,
      welcomeCouponCode: "CHUYENTAY10"
    });
    const again = await ctx.http
      .post(`${API}/newsletter/subscriptions`)
      .send({ email: "doc.gia@example.com" })
      .expect(200);
    expect(again.body.alreadySubscribed).toBe(true);
  });

  it("email sai → 400", async () => {
    await ctx.http.post(`${API}/newsletter/subscriptions`).send({ email: "khong-phai-email" }).expect(400);
  });
});
