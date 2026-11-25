import { Router } from "express";
import type { DatabaseHandle } from "../../db/client.js";

/**
 * Health check cho orchestrator (Docker / Kubernetes / load balancer):
 *  - /health/live  : tiến trình còn sống
 *  - /health/ready : sẵn sàng nhận traffic (CSDL kết nối được)
 */
export function healthRoutes(database: Pick<DatabaseHandle, "ping" | "driver">, version: string): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get("/live", (_req, res) => {
    res.json({ status: "ok", version, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
  });

  router.get("/ready", async (_req, res) => {
    try {
      await database.ping();
      res.json({ status: "ok", database: database.driver });
    } catch {
      res.status(503).json({ status: "unavailable", database: database.driver });
    }
  });

  return router;
}
