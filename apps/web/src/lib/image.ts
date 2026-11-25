/**
 * Nén ảnh ngay trên trình duyệt trước khi gửi: thu nhỏ theo cạnh dài, xoay đúng chiều (EXIF),
 * xuất WEBP (Safari cũ không xuất được WEBP → tự dùng JPEG). Giảm dần chất lượng/kích thước
 * cho tới khi vừa giới hạn dung lượng — ảnh điện thoại 5–10 MB thường còn 150–300 KB.
 */

export class ImageProcessingError extends Error {}

export interface CompressOptions {
  maxDimension: number;
  maxBytes: number;
}

const QUALITIES = [0.82, 0.72, 0.6];

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageProcessingError("Không đọc được ảnh này. Hãy chọn ảnh JPG, PNG hoặc WEBP.");
  }
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function compressImage(file: Blob, { maxDimension, maxBytes }: CompressOptions): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new ImageProcessingError("Tệp đã chọn không phải là ảnh.");
  const bitmap = await decode(file);
  try {
    let scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 3; attempt++, scale *= 0.75) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new ImageProcessingError("Trình duyệt không hỗ trợ xử lý ảnh.");
      ctx.fillStyle = "#fff"; // ảnh PNG trong suốt → nền trắng khi chuyển sang JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITIES) {
        let blob = await encode(canvas, "image/webp", quality);
        if (blob?.type !== "image/webp") blob = await encode(canvas, "image/jpeg", quality);
        if (blob && blob.size <= maxBytes) return blob;
      }
    }
    throw new ImageProcessingError("Ảnh quá lớn, kể cả sau khi nén. Hãy chọn ảnh khác.");
  } finally {
    bitmap.close();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ImageProcessingError("Không đọc được ảnh."));
    reader.readAsDataURL(blob);
  });
}
