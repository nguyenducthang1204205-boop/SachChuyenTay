import { adminOrderListQuerySchema, idParamSchema, orderStatusUpdateSchema } from "@sct/shared";
import { Router } from "express";
import { parseInput } from "../../core/http/validation.js";
import { currentAdmin } from "../auth/auth.routes.js";
import type { OrderAdminService } from "./order-admin.service.js";

export function orderAdminRoutes(service: OrderAdminService): Router {
  const router = Router();

  router.get("/orders", async (req, res) => {
    res.json(await service.list(parseInput(adminOrderListQuerySchema, req.query, "query")));
  });

  router.get("/orders/:id", async (req, res) => {
    const { id } = parseInput(idParamSchema, req.params, "params");
    res.json(await service.get(id));
  });

  router.patch("/orders/:id/status", async (req, res) => {
    const { id } = parseInput(idParamSchema, req.params, "params");
    const { status } = parseInput(orderStatusUpdateSchema, req.body, "body");
    res.json(await service.changeStatus(id, status, currentAdmin(res).id));
  });

  return router;
}
