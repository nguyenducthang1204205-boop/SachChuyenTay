/* eslint-disable no-console */
/**
 * Chuẩn bị & triển khai lên Cloudflare (D1 + R2 + Workers).
 *
 *   npm run cf:setup          Lần đầu (và chạy lại an toàn bất cứ lúc nào) trên tài khoản Cloudflare thật:
 *                               1. Đọc .env.production (không commit) — cần ADMIN_EMAIL, ADMIN_PASSWORD.
 *                               2. Tạo CSDL D1 nếu chưa có, ghi database_id vào wrangler.jsonc.
 *                               3. Chạy migration D1.
 *                               4. Nạp dữ liệu nền + tài khoản quản trị (+ sách mẫu nếu SEED_SAMPLE_DATA=true).
 *                               5. Tạo bucket R2 lưu ảnh nếu chưa có.
 *                               6. Build web và deploy Worker.
 *   node scripts/cf-setup.mjs --local
 *                             Chuẩn bị D1 giả lập trên máy cho `wrangler dev` (dùng trong npm run cf:dev):
 *                             migration + dữ liệu nền + sách mẫu + tài khoản dev mặc định.
 *
 * Chạy lại an toàn: migration chỉ áp phần mới; dữ liệu dùng INSERT OR IGNORE; admin chỉ tạo khi chưa có.
 * Những lần deploy sau: npm run cf:deploy (tự chạy migration mới trước khi deploy).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const ENV_FILE = ".env.production";
const WRANGLER_CONFIG = "wrangler.jsonc";
const D1_PLACEHOLDER = "REPLACE_WITH_D1_DATABASE_ID";
const D1_NAME = "sach-chuyen-tay";
const R2_BUCKET = "sach-chuyen-tay-media";
const SEED_FILE = ".wrangler/tmp/d1-seed.sql";

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";

const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

/**
 * Chạy lệnh không qua shell (tham số có ký tự đặc biệt không bị shell hiểu sai).
 * stdin = ignore → wrangler hiểu là chạy không tương tác và tự đồng ý các câu hỏi xác nhận.
 */
function run(args, { env = {}, capture = false, allowFail = false } = {}) {
  const res = spawnSync(process.execPath, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    encoding: "utf8"
  });
  if (res.status !== 0 && !allowFail) fail(`Lệnh thất bại: ${args.slice(1).join(" ")}`);
  return { ok: res.status === 0, stdout: res.stdout ?? "" };
}

const npmCli = process.env.npm_execpath;
if (!npmCli) fail("Hãy chạy bằng npm (npm run cf:setup / npm run cf:dev).");
const npm = (...args) => [npmCli, ...args];
// "exports" của gói wrangler không mở bin/ → tìm từ entry chính (wrangler-dist/cli.js)
const WRANGLER_BIN = join(dirname(createRequire(import.meta.url).resolve("wrangler")), "..", "bin", "wrangler.js");
const wrangler = (...args) => [WRANGLER_BIN, ...args];

/* ---- 1. Cấu hình ---- */
let adminEnv = {};
let seedSample = true;
if (!local) {
  if (!existsSync(ENV_FILE)) {
    fail(`Chưa có ${ENV_FILE}. Sao chép từ .env.production.example rồi điền ADMIN_EMAIL, ADMIN_PASSWORD.`);
  }
  process.loadEnvFile(ENV_FILE);
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) fail("Cần ADMIN_EMAIL và ADMIN_PASSWORD để tạo tài khoản quản trị đầu tiên.");
  if (ADMIN_PASSWORD.length < 12) fail("ADMIN_PASSWORD nên dài ít nhất 12 ký tự cho môi trường production.");
  adminEnv = { NODE_ENV: "production", ADMIN_EMAIL, ADMIN_PASSWORD };
  seedSample = /^(1|true)$/i.test(process.env.SEED_SAMPLE_DATA ?? "");

  console.log("\n▶ Kiểm tra đăng nhập Cloudflare…");
  run(wrangler("whoami"), { capture: true });
} else {
  adminEnv = { NODE_ENV: "development" }; // tài khoản dev mặc định: admin@sachchuyentay.vn / admin12345
}

/* ---- 2. D1 ---- */
let config = readFileSync(WRANGLER_CONFIG, "utf8");
if (!local && config.includes(D1_PLACEHOLDER)) {
  console.log(`\n▶ Tạo CSDL D1 "${D1_NAME}" (vùng châu Á – Thái Bình Dương)…`);
  const list = run(wrangler("d1", "list", "--json"), { capture: true });
  let id = JSON.parse(list.stdout || "[]").find((db) => db.name === D1_NAME)?.uuid;
  if (id) console.log(`• Đã có D1 "${D1_NAME}" — dùng lại.`);
  else {
    const out = run(wrangler("d1", "create", D1_NAME, "--location=apac"), { capture: true }).stdout;
    id =
      out.match(/"database_id":\s*"([0-9a-f-]{36})"/)?.[1] ??
      out.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/)?.[0];
    if (!id) fail(`Không đọc được database_id từ kết quả:\n${out}`);
  }
  config = config.replace(D1_PLACEHOLDER, id);
  writeFileSync(WRANGLER_CONFIG, config);
  console.log(`✔ D1 ${id} → đã ghi vào ${WRANGLER_CONFIG} (nhớ commit file này).`);
}

console.log(`\n▶ Migration D1 (${local ? "trên máy" : "Cloudflare"})…`);
run(wrangler("d1", "migrations", "apply", "DB", target));

/* ---- 3. Dữ liệu ban đầu ---- */
console.log(`\n▶ Dữ liệu nền + tài khoản quản trị${seedSample ? " + sách mẫu" : ""}…`);
mkdirSync(".wrangler/tmp", { recursive: true });
try {
  run(
    npm("run", "db:d1-sql", "-w", "@sct/api", "--", "--out", `../../${SEED_FILE}`, ...(seedSample ? ["--sample"] : [])),
    {
      env: adminEnv
    }
  );
  run(wrangler("d1", "execute", "DB", target, `--file=${SEED_FILE}`, "--yes"));
} finally {
  rmSync(SEED_FILE, { force: true }); // file có hash mật khẩu — không để lại
}

if (local) {
  console.log("\n✔ D1 trên máy đã sẵn sàng.");
  process.exit(0);
}

/* ---- 4. R2 (ảnh) ---- */
console.log("\n▶ Kiểm tra bucket R2 lưu ảnh…");
const buckets = run(wrangler("r2", "bucket", "list"), { capture: true, allowFail: true });
if (!buckets.ok) {
  fail("Chưa dùng được R2. Vào Cloudflare Dashboard → R2 → bật R2 (gói Free vẫn 0đ), rồi chạy lại.");
}
if (new RegExp(`name:\\s+${R2_BUCKET}\\b`).test(buckets.stdout)) console.log(`• Bucket ${R2_BUCKET} đã có.`);
else run(wrangler("r2", "bucket", "create", R2_BUCKET));

/* ---- 5. Deploy ---- */
console.log("\n▶ Build web + deploy Worker…");
run(npm("run", "cf:deploy"));
console.log("\n✔ Xong. Mở URL *.workers.dev ở trên; trang quản trị tại /admin.");
