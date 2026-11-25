import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const PAGES = ["index", "shop", "product", "cart", "sell", "admin"] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  const target = env.VITE_DEV_API_PROXY || "http://localhost:4000";
  // /images: ảnh bìa do API phục vụ (trên Cloudflare/nginx cũng cùng domain với web)
  const proxy = { "/api": { target, changeOrigin: true }, "/images": { target, changeOrigin: true } };

  return {
    root,
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, proxy },
    build: {
      target: "es2022",
      sourcemap: true,
      // Multi-page app: mỗi trang HTML là một entry, Vite tự tách chunk dùng chung.
      rollupOptions: {
        input: Object.fromEntries(PAGES.map((p) => [p, `${root}${p}.html`]))
      }
    }
  };
});
