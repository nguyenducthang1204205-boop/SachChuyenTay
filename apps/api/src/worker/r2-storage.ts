import type { ObjectStorage } from "../core/storage/object-storage.js";
import type { R2Bucket } from "./types.js";

/** Lưu ảnh trên Cloudflare R2 qua binding của Worker (không cần API key). */
export class R2ObjectStorage implements ObjectStorage {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.bucket.put(key, body, { httpMetadata: { contentType } });
  }

  async get(key: string) {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      body: new Uint8Array(await obj.arrayBuffer()),
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size: obj.size,
      etag: obj.httpEtag
    };
  }

  async delete(keys: readonly string[]) {
    if (keys.length) await this.bucket.delete([...keys]);
  }
}
