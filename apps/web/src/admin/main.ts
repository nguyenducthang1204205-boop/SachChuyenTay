import { loginSchema, type AdminUser } from "@sct/shared";
import { ApiError } from "../api/http.js";
import { byId } from "../lib/dom.js";
import { html, mount } from "../lib/html.js";
import { liveValidation, setFieldError, validateForm } from "../ui/forms.js";
import { icon, type IconName } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { adminApi, setUnauthorizedHandler } from "./admin.api.js";
import { DATA_CHANGED } from "./admin.ui.js";
import { bookFormView } from "./views/book-form.js";
import { booksView } from "./views/books.js";
import { buybackView } from "./views/buyback.js";
import { categoriesView } from "./views/categories.js";
import { dashboardView } from "./views/dashboard.js";
import { ordersView } from "./views/orders.js";

/**
 * Ứng dụng quản trị (SPA nhỏ, định tuyến bằng hash): #/ · #/books · #/books/new · #/books/:id
 * · #/categories · #/orders · #/buyback. Mỗi view nhận một phần tử gốc mới → sự kiện không rò rỉ giữa các màn.
 */

export type View = (root: HTMLElement, params: string[]) => void | Promise<void>;

const ROUTES: Array<{ pattern: RegExp; view: View; nav: string }> = [
  { pattern: /^\/$/, view: dashboardView, nav: "/" },
  { pattern: /^\/books$/, view: booksView, nav: "/books" },
  { pattern: /^\/books\/new$/, view: bookFormView, nav: "/books" },
  { pattern: /^\/books\/(\d+)$/, view: bookFormView, nav: "/books" },
  { pattern: /^\/categories$/, view: categoriesView, nav: "/categories" },
  { pattern: /^\/orders$/, view: ordersView, nav: "/orders" },
  { pattern: /^\/buyback$/, view: buybackView, nav: "/buyback" }
];

const NAV: Array<{ path: string; label: string; icon: IconName; badge?: string }> = [
  { path: "/", label: "Tổng quan", icon: "grid" },
  { path: "/books", label: "Sách", icon: "book" },
  { path: "/categories", label: "Thể loại", icon: "tag" },
  { path: "/orders", label: "Đơn hàng", icon: "package", badge: "orders" },
  { path: "/buyback", label: "Thu mua", icon: "recycle", badge: "buyback" }
];

const root = byId("admin-root");
let user: AdminUser | null = null;

/* ---------- Đăng nhập ---------- */

function renderLogin(message?: string) {
  document.title = "Đăng nhập quản trị — Sách Chuyền Tay";
  mount(
    root,
    html`<div class="adm-login">
      <div class="adm-login__box">
        <a class="brand" href="index.html"><img src="/assets/img/logo.svg" alt="" width="40" height="40" />
          <span><span class="brand__name">Sách Chuyền Tay</span><span class="brand__tag">Khu vực quản trị</span></span></a>
        <div><h1>Đăng nhập</h1>${message ? html`<p class="adm-help" style="margin-top:6px">${message}</p>` : null}</div>
        <form id="login-form" novalidate>
          <div class="field"><label for="l-email">Email</label>
            <input class="input" id="l-email" name="email" type="email" autocomplete="username" required />
            <span class="error"></span></div>
          <div class="field"><label for="l-password">Mật khẩu</label>
            <input class="input" id="l-password" name="password" type="password" autocomplete="current-password" required />
            <span class="error"></span></div>
          <button class="btn btn--lg btn--block" type="submit">${icon("lock")} Đăng nhập</button>
        </form>
        ${
          import.meta.env.DEV
            ? html`<p class="adm-login__hint">Môi trường dev — tài khoản mặc định: <strong>admin@sachchuyentay.vn</strong> / <strong>admin12345</strong></p>`
            : null
        }
      </div>
    </div>`
  );

  const form = byId<HTMLFormElement>("login-form");
  const rules = loginSchema.shape;
  liveValidation(form, rules);
  byId("l-email").focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validateForm(form, rules)) return;
    const button = form.querySelector<HTMLButtonElement>("button")!;
    button.disabled = true;
    try {
      const data = new FormData(form);
      user = await adminApi.auth.login({ email: String(data.get("email")), password: String(data.get("password")) });
      renderShell();
    } catch (err) {
      setFieldError(
        byId<HTMLInputElement>("l-password"),
        err instanceof ApiError ? err.message : "Không đăng nhập được."
      );
      button.disabled = false;
    }
  });
}

/* ---------- Khung (sidebar + vùng nội dung) ---------- */

function renderShell() {
  if (!user) return renderLogin();
  mount(
    root,
    html`<div class="adm">
      <aside class="adm-side">
        <a class="brand" href="#/"><img src="/assets/img/logo.svg" alt="" width="36" height="36" />
          <span><span class="brand__name">Sách Chuyền Tay</span><span class="brand__tag">Quản trị</span></span></a>
        <nav class="adm-nav" aria-label="Quản trị">
          ${NAV.map(
            (n) =>
              html`<a href="#${n.path}" data-nav="${n.path}">${icon(n.icon)}<span>${n.label}</span>${n.badge ? html`<span class="adm-badge" data-badge="${n.badge}" hidden></span>` : null}</a>`
          )}
        </nav>
        <div class="adm-side__foot">
          <div class="adm-user"><strong>${user.name}</strong>${user.email}</div>
          <a href="index.html" target="_blank" rel="noopener">${icon("external")}<span>Xem cửa hàng</span></a>
          <button type="button" data-logout>${icon("logout")}<span>Đăng xuất</span></button>
        </div>
      </aside>
      <main class="adm-main" id="adm-view"></main>
    </div>`
  );
  root.querySelector("[data-logout]")?.addEventListener("click", async () => {
    await adminApi.auth.logout().catch(() => undefined);
    user = null;
    location.hash = "#/";
    renderLogin("Bạn đã đăng xuất.");
  });
  void route();
}

/** Số đơn chờ xác nhận & yêu cầu thu mua mới trên sidebar. */
async function refreshBadges() {
  try {
    const [orders, buyback] = await Promise.all([
      adminApi.orders.list({ status: "pending", pageSize: 1 }),
      adminApi.buyback.list({ status: "new", pageSize: 1 })
    ]);
    for (const [key, n] of [
      ["orders", orders.meta.total],
      ["buyback", buyback.meta.total]
    ] as const) {
      const el = root.querySelector<HTMLElement>(`[data-badge="${key}"]`);
      if (el) {
        el.textContent = String(n);
        el.hidden = n === 0;
      }
    }
  } catch {
    /* không quan trọng */
  }
}

/* ---------- Router ---------- */

let routeToken = 0;

async function route() {
  const main = document.getElementById("adm-view");
  if (!main || !user) return;
  const path = (location.hash.slice(1) || "/").split("?")[0] || "/";
  const match = ROUTES.find((r) => r.pattern.test(path));

  root.querySelectorAll<HTMLElement>("[data-nav]").forEach((a) => {
    a.classList.toggle("is-active", a.dataset.nav === (match?.nav ?? ""));
  });

  const view = document.createElement("div");
  main.replaceChildren(view);
  window.scrollTo({ top: 0 });
  if (!match) {
    mount(
      view,
      html`<div class="adm-empty"><h1>Không tìm thấy trang</h1><p><a href="#/">Về trang tổng quan</a></p></div>`
    );
    return;
  }
  const token = ++routeToken;
  try {
    await match.view(view, path.match(match.pattern)!.slice(1));
  } catch (err) {
    if (token === routeToken && !(err instanceof ApiError && err.status === 401)) {
      mount(
        view,
        html`<div class="adm-card adm-empty">${err instanceof ApiError ? err.message : "Đã có lỗi xảy ra."}</div>`
      );
    }
  }
  void refreshBadges();
}

window.addEventListener("hashchange", () => void route());

window.addEventListener(DATA_CHANGED, () => void refreshBadges());

setUnauthorizedHandler(() => {
  if (!user) return;
  user = null;
  toast("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.", { type: "warn" });
  renderLogin();
});

/* ---------- Khởi động ---------- */
adminApi.auth
  .me()
  .then((u) => {
    user = u;
    renderShell();
  })
  .catch(() => renderLogin());
