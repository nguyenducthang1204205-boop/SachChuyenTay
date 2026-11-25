/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL gốc của API, mặc định "/api/v1" (đi qua proxy của Vite khi dev). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
