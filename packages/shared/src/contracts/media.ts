import { z } from "zod";

/* ==========================================================================
   Ảnh: bìa sách (admin tải lên) và ảnh khách gửi kèm yêu cầu thu mua.
   Trình duyệt luôn nén ảnh (WEBP, cạnh dài giới hạn) TRƯỚC khi gửi;
   server chỉ nhận đúng các định dạng ảnh raster dưới đây (không SVG — tránh XSS).
   ========================================================================== */

export const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** Ảnh bìa: cạnh dài tối đa (px) và dung lượng tối đa sau khi nén. */
export const COVER_IMAGE_MAX_DIMENSION = 1200;
export const COVER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Ảnh khách gửi khi bán sách cũ. */
export const BUYBACK_PHOTO_LIMIT = 4;
export const BUYBACK_PHOTO_MAX_DIMENSION = 1600;
export const BUYBACK_PHOTO_MAX_BYTES = 450 * 1024;

/** Đường dẫn công khai của ảnh bìa do hệ thống lưu (cùng domain với web). */
export const COVER_IMAGE_PATH_PREFIX = "/images/covers/";

export interface UploadedImage {
  /** Khoá trong kho lưu trữ, ví dụ "covers/2026/11/<uuid>.webp". */
  key: string;
  /** Đường dẫn dùng trực tiếp trong <img src>. */
  url: string;
  contentType: ImageType;
  size: number;
}

/** Ảnh gửi kèm JSON dạng data URL (base64). Giới hạn độ dài ≈ dung lượng tối đa × 4/3. */
export const imageDataUrlSchema = z
  .string("Ảnh không hợp lệ")
  .max(Math.ceil((BUYBACK_PHOTO_MAX_BYTES * 4) / 3) + 32, "Ảnh quá lớn, hãy chọn ảnh khác")
  .regex(/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/, "Chỉ nhận ảnh WEBP, JPEG hoặc PNG");

/** URL ảnh bìa: ảnh đã tải lên hệ thống, hoặc ảnh http(s) bên ngoài. */
export const coverImageUrlSchema = z
  .string()
  .trim()
  .max(500, "Đường dẫn ảnh quá dài")
  .refine(
    (v) => /^https?:\/\/[^\s"'<>]+$/i.test(v) || /^\/images\/covers\/[A-Za-z0-9/_.-]+$/.test(v),
    "Đường dẫn ảnh không hợp lệ"
  );
