# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Sách Chuyền Tay is a used-book store. It is an npm-workspaces monorepo (Node ≥ 22.12, see `.nvmrc`) with three packages:

- `apps/api` (`@sct/api`): REST API. Express 5 + Drizzle ORM + SQLite (Cloudflare D1 in production, libsql locally).
- `apps/web` (`@sct/web`): Vite + TypeScript multi-page app. It contains both the storefront and the admin area. No UI framework.
- `packages/shared` (`@sct/shared`): Zod schemas, DTO types and pure business rules shared by web and api.

UI text, error messages and code comments are written in Vietnamese. Keep that convention.

## Commands

```bash
npm install
npm run dev              # api :4000 (tsx watch) + web :5173 (Vite, proxies /api → :4000)
npm run check            # lint + typecheck + test (same as CI in .github/workflows/ci.yml)
npm run lint             # eslint (flat config, eslint.config.js)
npm run format           # prettier (printWidth 120, embeddedLanguageFormatting OFF)
npm run typecheck        # tsc --noEmit in every workspace
npm test                 # all workspaces
npm run build            # apps/api/dist (esbuild via scripts/build.mjs) + apps/web/dist (Vite)
```

Single test file or test name (Vitest):

```bash
npm test -w @sct/api -- test/admin.test.ts
npm test -w @sct/api -- -t "idempotency"
npm test -w @sct/shared
```

Database (run from the root, or with `-w @sct/api`):

```bash
npm run db:generate                 # after editing apps/api/src/db/schema.ts → new SQL in src/db/migrations/
npm run db:migrate | db:seed
npm run db:reset -w @sct/api        # wipe + reseed the local dev DB (refuses in production)
npm run cf:dev                      # Worker + local D1/R2 via wrangler on http://localhost:8788 (8787 is taken on this machine)
```

- Pages: storefront at http://localhost:5173; admin at http://localhost:5173/admin.html. The dev admin account is `admin@sachchuyentay.vn` / `admin12345`. It is created automatically outside production only; production requires `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- Database:
  - Node uses SQLite through libsql. `DATABASE_URL` defaults to `file:.data/sct.db`; tests use `:memory:`.
  - Cloudflare uses D1 through the `DB` binding.
  - Both share one schema and one migrations folder.
  - Column conventions: timestamps are `integer` ms (`mode: "timestamp_ms"`), arrays are JSON text, booleans are 0/1.
- Startup (Node only):
  - Migrations run automatically (`DB_AUTO_MIGRATE`).
  - Reference data (categories, book conditions, coupons) is always inserted if missing.
  - Sample books are seeded when the DB is empty (`DB_SEED_IF_EMPTY`, on by default outside production).
- Config: `apps/api/src/config/env.ts` validates all environment variables and fails fast. `apps/api/.env.example` documents them.
- Do not edit a migration that has already been generated; generate a new one instead.

## Architecture

### Shared contract (`packages/shared`)

- **Export model:** the package exports TypeScript **source** (`"exports": "./src/index.ts"`) and has no build step. Vite and tsx consume it directly. The API production build bundles it (`noExternal`-style, via `apps/api/scripts/build.mjs`).
- **Import paths:** imports across all packages use `.js` extensions with `moduleResolution: Bundler`.
- **Request schemas:** every request body and query is defined once as a Zod schema in `contracts/*.ts`. The API validates with it (`parseInput(schema, req.x, "body")`), and web forms validate with the same schema via `ui/forms.ts` / `schema.shape.<field>`. Error messages are therefore identical on both sides.
- **Money logic:** `calculateTotals` (free-shipping threshold, coupon %, savings) is the single source of money logic.
  - The server always recomputes prices and stock; it never trusts client totals.
  - The client uses the same function only for instant display.
- **List param types:** `z.input` of `z.coerce.number()` is `unknown`, so client-side list param types use the `ListParams<T>` helper in `contracts/admin.ts` instead of raw `z.input`.

### API (`apps/api/src`)

- **Request flow:** `main.ts` → `bootstrap.ts` (DB → migrate → reference data → sample books → ensure initial admin → container → app) → `app.ts` (middleware, routes, error handler). Tests reuse `bootstrap` through `test/helpers.ts#createTestApp()`, which boots a fresh in-memory SQLite (`DATABASE_URL=:memory:`) with migrations and seed.
- **Dependency injection:** `container.ts` is the only composition root (manual DI). A new module needs:
  - a repository (interface + Drizzle adapter);
  - a service that depends only on the interface;
  - a `*.routes.ts` router factory;
  - wiring in `container.ts` and `app.ts`.
- **Modules:** `modules/<feature>/` contains `catalog`, `checkout` (cart quote, orders, admin order management), `buyback`, `newsletter`, `auth`, `dashboard`, `media`, `health`. The public read side and admin write side are separate files (e.g. `catalog.repository.ts` vs `catalog-admin.repository.ts`).
- **Writes without transactions:** D1 has no interactive transactions, so `BEGIN…COMMIT`, `db.transaction()` and `SELECT … FOR UPDATE` are unavailable. Multi-step writes go in **one `db.batch([...])`**, which is atomic: if one statement fails, the whole batch rolls back.
  - **Placing an order** (`DrizzleOrderRepository.place`) runs one batch: stock decrement, order insert, item inserts. The `CHECK (stock >= 0)` constraint is the overselling guard: a violation surfaces as `StockConflictError`, and a duplicate `Idempotency-Key` surfaces as `DuplicateOrderError`.
  - **Changing order status** (`transitionStatus`) uses optimistic locking. Each statement is conditioned on `status = <previous>`, and the call returns `false` if another admin changed the order first.
  - **Batch statements must be query builders** (`insert`/`update`/`delete` plus `sql` expressions). Drizzle's D1 driver rejects `db.run(sql\`…\`)` inside a batch, and the libsql tests won't catch it.
  - **Parameter limit:** D1 allows at most 100 bound parameters per statement. Pass lists as one JSON parameter with `inList()` from `db/sql.ts`, which uses `json_each`. Use `likeEscaped()` for LIKE, since SQLite has no default escape character.
- **Errors:**
  - Services throw `core/errors.ts` subclasses (`NotFoundError`, `ValidationError`, `OutOfStockError`, `InUseError`, `BusinessRuleError`, `UnauthorizedError`…).
  - `core/http/problem.ts` maps them to RFC 9457 `application/problem+json`, adding `code` (from `ERROR_CODES` in shared), `errors[]` and `requestId`.
  - Express 5 forwards async throws on its own, so routes need no try/catch.
- **Orders:**
  - `POST /orders` honours an `Idempotency-Key` header: a repeat with the same key returns the existing order with 200.
  - Order status changes must follow `ORDER_TRANSITIONS` in shared.
- **Search:** accent-insensitive search uses the `books.search_text` column, built by `catalog.search.ts#buildSearchText`. Recompute it whenever title, author, publisher, tags or the category name change; `CatalogAdminService` already does this.
- **Admin auth:**
  - Routes: `/api/v1/admin/auth/*` is public; everything else under `/api/v1/admin` passes through `requireAdmin`.
  - Sessions: rows in `admin_sessions`; the DB stores the SHA-256 of the token.
  - Cookie: `sct_admin` with HttpOnly, SameSite=Strict, `path=/api`, and Secure in production.
  - Passwords: hashed with scrypt (`modules/auth/password.ts`).
- **Images (`modules/media`):**
  - Storage goes through the `ObjectStorage` port (`core/storage/`). Adapters: R2 on Workers, `DiskObjectStorage` (`UPLOADS_DIR`, default `.data/uploads`) on Node, `MemoryObjectStorage` in tests (`UPLOADS_DIR=memory://`). `createContainer` requires `{ storage }`.
  - The browser compresses images before upload (`apps/web/src/lib/image.ts`). The server only checks size and detects the type from magic bytes; it accepts WEBP, JPEG and PNG, never SVG.
  - Keys are generated as `<covers|buyback>/<yyyy>/<mm>/<uuid>.<ext>`, and `isMediaKey` rejects anything else.
  - Book covers are public at `/images/covers/…` with immutable caching. Admins upload them with `POST /admin/uploads/cover`, sending a raw image body. Replacing a cover or deleting the book deletes the old object.
  - Buyback photos arrive as base64 data URLs inside the JSON body. That route has its own 3 MB JSON limit in `app.ts`; every other route keeps 64 KB. Admins view the photos through `/api/v1/admin/media/…`. If saving the request fails, the stored photos are deleted.
- **Rate limiting:** limits apply to write and login endpoints and are disabled when `NODE_ENV=test`. `createContainer(..., { rateLimiter })` takes a `RateLimiterFactory`: the default counts in memory, and the Worker plugs in Cloudflare's rate-limit binding.
- **Two runtimes, one Express app:**
  - Node: `main.ts` (dev, Docker).
  - Cloudflare Workers: `src/worker/index.ts`, configured in the root `wrangler.jsonc`. One Worker serves `apps/web/dist` as static assets and routes only `/api/*` and `/health/*` into Express via `handleAsNodeRequest`.
  - On Workers, the DB is D1 through the `DB` binding, created once per isolate in `worker/index.ts`.
  - Migrations never run inside the Worker. Use `wrangler d1 migrations apply DB --remote|--local`; `cf:deploy` and `cf:setup` already do this. It reads the same `src/db/migrations` folder as libsql.
  - D1 can't be reached from Node. To load reference data, sample books and the first admin, `cli.ts d1-sql` builds them in a temporary in-memory SQLite with the app's own seed code and AuthService, then exports `INSERT OR IGNORE` SQL. `wrangler d1 execute --file` runs that file; `scripts/cf-setup.mjs` drives the whole flow.
  - `.env` is loaded only by Node entry points (`config/dotenv.ts`). `loadConfig()` just parses `process.env`, which Workers fills from `wrangler.jsonc` vars and secrets.

### Web (`apps/web`)

- **Pages:** each `*.html` at the app root is a Vite entry listed in `vite.config.ts` (`PAGES`). Storefront pages load `src/pages/<page>.ts`; `admin.html` loads `src/admin/main.ts`. Static assets live in `public/` and are referenced with absolute paths (`/assets/img/logo.svg`).
- **Layers:** `api/` (fetch wrapper `http.ts` → `ApiError`; `endpoints.ts`) → `services/` and `stores/` → `ui/` (pure components that return `SafeHtml`) → `pages/`.
- **Rendering:**
  - Build all markup with the `html` tagged template from `lib/html.ts`. It escapes every interpolated value unless the value is already `SafeHtml`.
  - Insert markup with `mount(el, content)`.
  - Do not assign raw strings to `innerHTML`.
- **Storefront events:**
  - Global behaviour uses event delegation on `data-*` attributes (`data-add-cart`, `data-wish`, `data-open-cart`…), set up in `layout/app-shell.ts`.
  - `<body data-page="…">` exists on every page, so **never use `data-page` for anything else**: `closest("[data-page]")` would match the body. Pagination uses `data-goto-page` for this reason.
- **Cart:**
  - `stores/cart.store.ts` keeps book snapshots in localStorage for instant display.
  - The cart page calls `POST /cart/quote`, then `cartStore.reconcile()` applies server prices and stock.
  - Add-to-cart looks up books with `catalogService.known(id)`, which only works for books previously fetched through `catalogService`.
- **Admin SPA:**
  - Routing is hash-based in `src/admin/main.ts`. Each view is a function `(root, params)` that receives a fresh root element, so its listeners die with it.
  - After a write, views call `notifyDataChanged()` to refresh the sidebar badges.
  - A 401 from `admin.api.ts` sends the app back to the login screen.

## Gotchas

- **Workers global scope:** code that runs at module load must not generate random values, set timers or do I/O. Workers rejects it ("Disallowed operation called within global scope"), and the Node tests will not catch it. Compute such values lazily (see `getDummyHash` in `auth.service.ts`). Check Worker changes with `npm run cf:dev`, which uses local D1 and R2 simulations, before deploying.
- **pino on Workers:** `wrangler.jsonc` aliases `pino` to its Node build because `pino-http` needs it; the Worker logger writes through `console` (`createLogger(config, { console: true })`). Request logs contain only `id` / `method` / `url`, never headers.

- **Windows shell encoding:** on this Windows machine, `curl` mangles Vietnamese text in request bodies. Use Node (`fetch`) or a test to send data containing diacritics.
- **Legacy site:** `_legacy-static/` is the old static site, kept only for reference. It is ignored by git, eslint and prettier.
- More detail: `docs/ARCHITECTURE.md` (design rationale, extension guide) and `README.md` (API endpoint table).
