import { existsSync } from "node:fs";

/** Nạp file .env (nếu có) vào process.env — chỉ dùng cho tiến trình Node: server, CLI. */
export function loadDotenv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
