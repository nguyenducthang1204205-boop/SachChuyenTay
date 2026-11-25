import { Router } from "express";
import type { DashboardService } from "./dashboard.service.js";

export function dashboardRoutes(service: DashboardService): Router {
  const router = Router();
  router.get("/dashboard", async (_req, res) => {
    res.json(await service.stats());
  });
  return router;
}
