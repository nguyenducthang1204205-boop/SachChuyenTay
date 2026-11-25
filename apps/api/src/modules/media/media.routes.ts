import { COVER_IMAGE_MAX_BYTES, IMAGE_TYPES } from "@sct/shared";
import express, { Router, type Response } from "express";
import { NotFoundError } from "../../core/errors.js";
import type { StoredObject } from "../../core/storage/object-storage.js";
import type { MediaService } from "./media.service.js";

const keyOf = (splat: unknown) => (Array.isArray(splat) ? splat.join("/") : String(splat ?? ""));

function sendObject(res: Response, obj: StoredObject, cacheControl: string) {
  res.set({ "Content-Type": obj.contentType, "Cache-Control": cacheControl });
  if (obj.etag) res.set("ETag", obj.etag);
  res.send(Buffer.from(obj.body.buffer, obj.body.byteOffset, obj.body.byteLength));
}

/** GET /images/covers/... — ảnh bìa công khai. Khoá là UUID không đổi nên cache vĩnh viễn. */
export function publicImageRoutes(media: MediaService): Router {
  const router = Router();
  router.get("/*key", async (req, res) => {
    const key = keyOf(req.params.key);
    const obj = key.startsWith("covers/") ? await media.get(key) : null;
    if (!obj) throw new NotFoundError("Không tìm thấy ảnh.");
    sendObject(res, obj, "public, max-age=31536000, immutable");
  });
  return router;
}

/** Ảnh cho khu vực quản trị (đã qua requireAdmin): tải bìa lên, xem mọi ảnh kể cả ảnh khách gửi. */
export function mediaAdminRoutes(media: MediaService): Router {
  const router = Router();

  // Body là file ảnh nhị phân (Content-Type: image/webp|jpeg|png), không phải JSON/multipart.
  router.post(
    "/uploads/cover",
    express.raw({ type: [...IMAGE_TYPES], limit: COVER_IMAGE_MAX_BYTES }),
    async (req, res) => {
      const body = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : undefined;
      res.status(201).json(await media.store("covers", body, { maxBytes: COVER_IMAGE_MAX_BYTES }));
    }
  );

  router.get("/media/*key", async (req, res) => {
    const obj = await media.get(keyOf(req.params.key));
    if (!obj) throw new NotFoundError("Không tìm thấy ảnh.");
    sendObject(res, obj, "private, max-age=86400");
  });

  return router;
}
