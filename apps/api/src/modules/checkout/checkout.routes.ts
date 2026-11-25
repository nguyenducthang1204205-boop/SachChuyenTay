import { cartQuoteRequestSchema, createOrderSchema, IDEMPOTENCY_HEADER } from "@sct/shared";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { parseInput } from "../../core/http/validation.js";
import type { CheckoutService } from "./checkout.service.js";

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8, "Idempotency-Key quá ngắn")
  .max(100, "Idempotency-Key quá dài")
  .regex(/^[A-Za-z0-9_-]+$/, "Idempotency-Key chỉ gồm chữ, số, - và _")
  .optional();

export function checkoutRoutes(checkout: CheckoutService, writeLimiter: RequestHandler): Router {
  const router = Router();

  /** Báo giá giỏ hàng (POST vì body có danh sách sách; không thay đổi dữ liệu). */
  router.post("/cart/quote", async (req, res) => {
    const body = parseInput(cartQuoteRequestSchema, req.body, "body");
    res.json(await checkout.quote(body));
  });

  router.post("/orders", writeLimiter, async (req, res) => {
    const body = parseInput(createOrderSchema, req.body, "body");
    const key = parseInput(idempotencyKeySchema, req.get(IDEMPOTENCY_HEADER), "headers");
    const { order, created } = await checkout.placeOrder(body, key);
    // 201 = vừa tạo; 200 = request lặp lại với cùng Idempotency-Key, trả đơn đã tạo trước đó.
    res.status(created ? 201 : 200).json(order);
  });

  return router;
}
