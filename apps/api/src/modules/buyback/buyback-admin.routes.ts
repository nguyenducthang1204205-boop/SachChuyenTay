import { adminBuybackListQuerySchema, buybackStatusUpdateSchema, idParamSchema } from "@sct/shared";
import { Router } from "express";
import { parseInput } from "../../core/http/validation.js";
import type { BuybackAdminService } from "./buyback-admin.service.js";

export function buybackAdminRoutes(service: BuybackAdminService): Router {
  const router = Router();

  router.get("/buyback-requests", async (req, res) => {
    res.json(await service.list(parseInput(adminBuybackListQuerySchema, req.query, "query")));
  });

  router.patch("/buyback-requests/:id/status", async (req, res) => {
    const { id } = parseInput(idParamSchema, req.params, "params");
    const { status } = parseInput(buybackStatusUpdateSchema, req.body, "body");
    res.json(await service.changeStatus(id, status));
  });

  return router;
}
