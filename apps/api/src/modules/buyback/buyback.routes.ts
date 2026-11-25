import { buybackRequestSchema } from "@sct/shared";
import { Router, type RequestHandler } from "express";
import { parseInput } from "../../core/http/validation.js";
import type { BuybackService } from "./buyback.service.js";

export function buybackRoutes(service: BuybackService, writeLimiter: RequestHandler): Router {
  const router = Router();

  router.post("/buyback-requests", writeLimiter, async (req, res) => {
    const body = parseInput(buybackRequestSchema, req.body, "body");
    res.status(201).json(await service.submit(body));
  });

  return router;
}
