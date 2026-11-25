import { bookIdParamSchema, bookListQuerySchema, relatedQuerySchema } from "@sct/shared";
import { Router } from "express";
import { parseInput } from "../../core/http/validation.js";
import type { CatalogService } from "./catalog.service.js";

/** Dữ liệu tham chiếu ít thay đổi → cho phép cache ngắn ở trình duyệt / CDN. */
const CACHE_REFERENCE = "public, max-age=60, stale-while-revalidate=300";

export function catalogRoutes(catalog: CatalogService): Router {
  const router = Router();

  router.get("/books", async (req, res) => {
    const query = parseInput(bookListQuerySchema, req.query, "query");
    res.json(await catalog.listBooks(query));
  });

  router.get("/books/:id", async (req, res) => {
    const { id } = parseInput(bookIdParamSchema, req.params, "params");
    res.json(await catalog.getBook(id));
  });

  router.get("/books/:id/related", async (req, res) => {
    const { id } = parseInput(bookIdParamSchema, req.params, "params");
    const { limit } = parseInput(relatedQuerySchema, req.query, "query");
    res.json(await catalog.getRelated(id, limit));
  });

  router.get("/categories", async (_req, res) => {
    res.set("Cache-Control", CACHE_REFERENCE).json(await catalog.listCategories());
  });

  router.get("/conditions", async (_req, res) => {
    res.set("Cache-Control", CACHE_REFERENCE).json(await catalog.listConditions());
  });

  return router;
}
