import { randomInt } from "node:crypto";

/** Bảng chữ cái không gây nhầm lẫn khi đọc qua điện thoại (bỏ 0/O, 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomToken(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

const yymmdd = (d: Date) =>
  [d.getFullYear() % 100, d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("");

/** Mã tham chiếu dễ đọc: PREFIX-YYMMDD-XXXXXX (ví dụ SCT-261124-7K3F9Q). */
export function referenceCode(prefix: string, now = new Date()): string {
  return `${prefix}-${yymmdd(now)}-${randomToken(6)}`;
}
