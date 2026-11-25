// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.data/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "_legacy-static/**",
      "apps/api/src/db/migrations/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      eqeqeq: ["error", "smart"],
      "no-console": "warn"
    }
  },
  {
    files: ["apps/api/**/*.{ts,mjs}", "packages/**/*.ts", "scripts/**/*.mjs", "**/*.config.{js,ts}"],
    languageOptions: { globals: globals.node }
  },
  {
    files: ["apps/web/**/*.ts"],
    languageOptions: { globals: globals.browser }
  }
);
