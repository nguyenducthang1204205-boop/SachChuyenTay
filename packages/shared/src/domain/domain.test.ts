import { describe, expect, it } from "vitest";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from "../constants.js";
import { customerSchema } from "../contracts/orders.js";
import { normalizeText, toSearchTerms } from "../utils/text.js";
import { estimateBuyback } from "./buyback.js";
import { calculateTotals, discountPercent } from "./pricing.js";

describe("discountPercent", () => {
  it("tính % giảm so với giá bìa", () => {
    expect(discountPercent(45_000, 79_000)).toBe(43);
  });
  it("trả 0 khi không có giá bìa", () => {
    expect(discountPercent(220_000, null)).toBe(0);
  });
});

describe("calculateTotals", () => {
  it("tính phí ship khi chưa đạt ngưỡng miễn phí", () => {
    const t = calculateTotals({ lines: [{ unitPrice: 50_000, originalPrice: 100_000, quantity: 2 }] });
    expect(t).toMatchObject({
      subtotal: 100_000,
      discount: 0,
      shippingFee: SHIPPING_FEE,
      total: 100_000 + SHIPPING_FEE,
      savings: 100_000,
      freeShippingRemaining: FREE_SHIPPING_THRESHOLD - 100_000
    });
  });

  it("miễn phí ship từ ngưỡng và áp mã giảm theo %", () => {
    const t = calculateTotals({ lines: [{ unitPrice: 150_000, originalPrice: null, quantity: 2 }], couponPercent: 10 });
    expect(t.shippingFee).toBe(0);
    expect(t.discount).toBe(30_000);
    expect(t.total).toBe(270_000);
    expect(t.savings).toBe(30_000);
  });

  it("giỏ trống không tính phí ship", () => {
    expect(calculateTotals({ lines: [] })).toMatchObject({ total: 0, shippingFee: 0, freeShippingRemaining: 0 });
  });
});

describe("estimateBuyback", () => {
  it("ước tính theo tình trạng và thể loại", () => {
    expect(estimateBuyback({ coverPrice: 120_000, quantity: 10, conditionId: "like-new", categoryId: "vhvn" })).toEqual(
      {
        low: 388_000,
        high: 524_000,
        creditHigh: 629_000
      }
    );
  });
  it("trả null khi thiếu dữ liệu", () => {
    expect(estimateBuyback({ coverPrice: 0, quantity: 10, conditionId: "good", categoryId: "vhvn" })).toBeNull();
  });
});

describe("text", () => {
  it("bỏ dấu tiếng Việt", () => {
    expect(normalizeText("  Nguyễn Nhật   Ánh – Đắc Nhân Tâm ")).toBe("nguyen nhat anh – dac nhan tam");
    expect(toSearchTerms("Sách HIẾM")).toEqual(["sach", "hiem"]);
  });
});

describe("customerSchema", () => {
  it("chuẩn hoá số điện thoại và bỏ email rỗng", () => {
    const r = customerSchema.parse({
      name: " An ",
      phone: "0909 123.456",
      email: "",
      address: "123 Nguyễn Văn Cừ, Q5"
    });
    expect(r).toEqual({
      name: "An",
      phone: "0909123456",
      email: undefined,
      address: "123 Nguyễn Văn Cừ, Q5",
      note: undefined
    });
  });
  it("từ chối số điện thoại sai", () => {
    expect(customerSchema.safeParse({ name: "An", phone: "12345", address: "123 Nguyễn Văn Cừ" }).success).toBe(false);
  });
});
