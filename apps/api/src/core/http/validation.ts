import type { z } from "zod";
import { ValidationError } from "../errors.js";

type Source = "body" | "query" | "params" | "headers";

/**
 * Parse & kiểm tra dữ liệu request bằng schema dùng chung (@sct/shared).
 * Trả về dữ liệu đã chuẩn hoá, có kiểu tĩnh; ném ValidationError nếu sai.
 */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown, source: Source): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const errors = result.error.issues.map((issue) => ({
    path: [source, ...issue.path].join("."),
    message: issue.message
  }));
  throw new ValidationError(errors);
}
