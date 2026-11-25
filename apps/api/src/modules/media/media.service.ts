import { randomUUID } from "node:crypto";
import { COVER_IMAGE_PATH_PREFIX, type UploadedImage } from "@sct/shared";
import { PayloadTooLargeError, ValidationError } from "../../core/errors.js";
import type { Logger } from "../../core/logger.js";
import type { ObjectStorage, StoredObject } from "../../core/storage/object-storage.js";
import { detectImageType, IMAGE_EXTENSIONS } from "./image-type.js";

/** Nhóm ảnh: bìa sách (công khai) và ảnh khách gửi kèm yêu cầu thu mua (chỉ quản trị xem). */
export type MediaKind = "covers" | "buyback";

/** Khoá do hệ thống sinh: <nhóm>/<năm>/<tháng>/<uuid>.<đuôi> — mọi khoá khác đều bị từ chối. */
const KEY_PATTERN = /^(covers|buyback)\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(webp|jpg|png)$/;

export const isMediaKey = (key: string) => KEY_PATTERN.test(key);

export interface StoreOptions {
  maxBytes: number;
  /** Đường dẫn trường dùng trong thông báo lỗi (vd "body.photos.0"). */
  field?: string;
}

/** Use-case ảnh: kiểm tra, đặt tên, lưu, đọc và dọn ảnh không còn dùng. */
export class MediaService {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly logger: Logger
  ) {}

  async store(kind: MediaKind, bytes: Uint8Array | undefined, opts: StoreOptions): Promise<UploadedImage> {
    const field = opts.field ?? "body";
    if (!bytes?.byteLength) throw new ValidationError([{ path: field, message: "Chưa có dữ liệu ảnh" }]);
    if (bytes.byteLength > opts.maxBytes) {
      throw new PayloadTooLargeError(`Ảnh vượt quá ${Math.round(opts.maxBytes / 1024)} KB.`);
    }
    const contentType = detectImageType(bytes);
    if (!contentType) throw new ValidationError([{ path: field, message: "Chỉ nhận ảnh WEBP, JPEG hoặc PNG" }]);

    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const key = `${kind}/${now.getUTCFullYear()}/${month}/${randomUUID()}.${IMAGE_EXTENSIONS[contentType]}`;
    await this.storage.put(key, bytes, contentType);
    return { key, url: this.urlOf(key), contentType, size: bytes.byteLength };
  }

  /** Bìa sách có URL công khai; ảnh thu mua đi qua API quản trị. */
  urlOf(key: string): string {
    return key.startsWith("covers/") ? `/images/${key}` : `/api/v1/admin/media/${key}`;
  }

  async get(key: string): Promise<StoredObject | null> {
    return isMediaKey(key) ? this.storage.get(key) : null;
  }

  /** Xoá ảnh — không bao giờ làm hỏng nghiệp vụ chính (chỉ ghi log khi lỗi). */
  async discard(keys: readonly string[]): Promise<void> {
    const valid = keys.filter(isMediaKey);
    if (!valid.length) return;
    try {
      await this.storage.delete(valid);
    } catch (err) {
      this.logger.warn({ err, keys: valid }, "Không xoá được ảnh");
    }
  }

  /** Xoá ảnh bìa theo URL, nếu đó là ảnh do hệ thống lưu (bỏ qua URL bên ngoài). */
  async discardCover(url: string | null | undefined): Promise<void> {
    if (url?.startsWith(COVER_IMAGE_PATH_PREFIX)) await this.discard([url.slice("/images/".length)]);
  }
}
