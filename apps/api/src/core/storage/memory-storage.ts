import type { ObjectStorage, StoredObject } from "./object-storage.js";

/** Lưu trong bộ nhớ tiến trình — cho test, mất khi khởi động lại. */
export class MemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();

  async put(key: string, body: Uint8Array, contentType: string) {
    this.objects.set(key, { body: new Uint8Array(body), contentType, size: body.byteLength });
  }

  async get(key: string) {
    return this.objects.get(key) ?? null;
  }

  async delete(keys: readonly string[]) {
    for (const key of keys) this.objects.delete(key);
  }
}
