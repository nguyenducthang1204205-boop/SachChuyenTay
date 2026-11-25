import type { ImageType } from "@sct/shared";

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/**
 * Nhận diện định dạng ảnh theo "magic bytes" — KHÔNG tin header Content-Type hay đuôi file do client gửi.
 * Chỉ chấp nhận ảnh raster an toàn để hiển thị (không SVG/HTML).
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  return null;
}

export const IMAGE_EXTENSIONS: Record<ImageType, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png"
};
