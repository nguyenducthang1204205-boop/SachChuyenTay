import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { ObjectStorage } from "./object-storage.js";

const CONTENT_TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

/** Lưu file trong một thư mục trên đĩa — cho dev và chạy Docker một máy. Loại nội dung suy ra từ đuôi file. */
export class DiskObjectStorage implements ObjectStorage {
  private readonly root: string;

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  /** Chặn khoá kiểu "../" thoát ra ngoài thư mục gốc. */
  private pathOf(key: string): string {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error(`Khoá lưu trữ không hợp lệ: ${key}`);
    return full;
  }

  async put(key: string, body: Uint8Array) {
    const file = this.pathOf(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string) {
    try {
      const body = await readFile(this.pathOf(key));
      const ext = key.split(".").pop() ?? "";
      return { body, contentType: CONTENT_TYPES[ext] ?? "application/octet-stream", size: body.byteLength };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(keys: readonly string[]) {
    await Promise.all(keys.map((key) => rm(this.pathOf(key), { force: true })));
  }
}
