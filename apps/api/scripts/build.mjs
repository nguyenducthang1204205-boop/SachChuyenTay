/**
 * Build production cho API bằng esbuild:
 *  - bundle mã nguồn + gói nội bộ @sct/shared (xuất TS) thành ESM chạy trên Node
 *  - giữ các dependency trong node_modules ở dạng external
 *  - copy thư mục migration SQL vào dist/
 */
import { build } from "esbuild";
import { cpSync, readFileSync, rmSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith("@sct/"));

rmSync("dist", { recursive: true, force: true });

await build({
  entryPoints: { main: "src/main.ts", cli: "src/db/cli.ts" },
  outdir: "dist",
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "node",
  target: "node22",
  sourcemap: true,
  external,
  logLevel: "info"
});

cpSync("src/db/migrations", "dist/migrations", { recursive: true });
// eslint-disable-next-line no-console
console.log("✔ Copied migrations → dist/migrations");
