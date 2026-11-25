import {
  adminBookListQuerySchema,
  bookIdParamSchema,
  bookInputSchema,
  bookUpdateSchema,
  categoryInputSchema,
  categoryUpdateSchema
} from "@sct/shared";
import { Router } from "express";
import { z } from "zod";
import { parseInput } from "../../core/http/validation.js";
import type { CatalogAdminService } from "./catalog-admin.service.js";

const categoryIdParam = z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}$/) });

/** /admin/books & /admin/categories — đã được bảo vệ bởi requireAdmin ở tầng trên. */
export function catalogAdminRoutes(service: CatalogAdminService): Router {
  const router = Router();

  router.get("/books", async (req, res) => {
    res.json(await service.listBooks(parseInput(adminBookListQuerySchema, req.query, "query")));
  });

  router.get("/books/:id", async (req, res) => {
    const { id } = parseInput(bookIdParamSchema, req.params, "params");
    res.json(await service.getBook(id));
  });

  router.post("/books", async (req, res) => {
    res.status(201).json(await service.createBook(parseInput(bookInputSchema, req.body, "body")));
  });

  router.patch("/books/:id", async (req, res) => {
    const { id } = parseInput(bookIdParamSchema, req.params, "params");
    res.json(await service.updateBook(id, parseInput(bookUpdateSchema, req.body, "body")));
  });

  router.delete("/books/:id", async (req, res) => {
    const { id } = parseInput(bookIdParamSchema, req.params, "params");
    await service.deleteBook(id);
    res.status(204).end();
  });

  router.get("/categories", async (_req, res) => {
    res.json(await service.listCategories());
  });

  router.post("/categories", async (req, res) => {
    await service.createCategory(parseInput(categoryInputSchema, req.body, "body"));
    res.status(201).json(await service.listCategories());
  });

  router.patch("/categories/:id", async (req, res) => {
    const { id } = parseInput(categoryIdParam, req.params, "params");
    await service.updateCategory(id, parseInput(categoryUpdateSchema, req.body, "body"));
    res.json(await service.listCategories());
  });

  router.delete("/categories/:id", async (req, res) => {
    const { id } = parseInput(categoryIdParam, req.params, "params");
    await service.deleteCategory(id);
    res.status(204).end();
  });

  return router;
}
