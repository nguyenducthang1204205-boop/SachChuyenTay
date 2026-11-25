/**
 * Port lưu trữ file (ảnh) — service chỉ phụ thuộc interface này:
 *  - Cloudflare Workers: R2 (`src/worker/r2-storage.ts`)
 *  - Node (dev, Docker): thư mục trên đĩa (`DiskObjectStorage`)
 *  - Test: bộ nhớ (`MemoryObjectStorage`)
 * Muốn chuyển sang S3/MinIO… chỉ cần thêm một adapter.
 */
export interface StoredObject {
  body: Uint8Array;
  contentType: string;
  size: number;
  /** ETag dạng HTTP (có dấu ngoặc kép) nếu kho lưu trữ cung cấp. */
  etag?: string | undefined;
}

export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(keys: readonly string[]): Promise<void>;
}
