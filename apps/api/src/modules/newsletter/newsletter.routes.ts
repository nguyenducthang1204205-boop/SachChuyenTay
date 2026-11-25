import { subscribeSchema } from "@sct/shared";
import { Router, type RequestHandler } from "express";
import { parseInput } from "../../core/http/validation.js";
import type { NewsletterService } from "./newsletter.service.js";

export function newsletterRoutes(service: NewsletterService, writeLimiter: RequestHandler): Router {
  const router = Router();

  /** Idempotent: đăng ký lại cùng email trả 200 thay vì báo lỗi. */
  router.post("/newsletter/subscriptions", writeLimiter, async (req, res) => {
    const { email } = parseInput(subscribeSchema, req.body, "body");
    const result = await service.subscribe(email);
    res.status(result.alreadySubscribed ? 200 : 201).json(result);
  });

  return router;
}
