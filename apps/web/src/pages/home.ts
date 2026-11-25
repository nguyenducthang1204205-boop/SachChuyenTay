import { subscribeSchema, type BookListParams, type BookSummary } from "@sct/shared";
import { ApiError, isAbort } from "../api/http.js";
import { engagementApi } from "../api/endpoints.js";
import { initAppShell, observeReveal } from "../layout/app-shell.js";
import { byId } from "../lib/dom.js";
import { formatNumber } from "../lib/format.js";
import { html, mount } from "../lib/html.js";
import { catalogService } from "../services/catalog.service.js";
import { bookCards, conditionBadge, conditionMeter, cover } from "../ui/book.js";
import { errorState, onRetry, skeletonCards } from "../ui/feedback.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";

initAppShell();

/** Nội dung biên tập của trang chủ (điểm nâng cấp: chuyển sang CMS / API "featured collections"). */
const FEATURED = {
  heroStack: [1, 3, 2],
  promoSell: [24, 9],
  promoRare: [22, 17]
} as const;

const NEW_ARRIVAL_TABS: Record<string, BookListParams["category"]> = {
  all: undefined,
  "van-hoc": ["vhvn", "vhnn"],
  kynang: ["kynang"],
  thieunhi: ["thieunhi"]
};

/* ---------- Bìa sách trang trí (hero & promo) ---------- */
async function loadFeaturedCovers() {
  const ids = [...FEATURED.heroStack, ...FEATURED.promoSell, ...FEATURED.promoRare];
  try {
    const { data } = await catalogService.books({ ids, pageSize: ids.length });
    const byIdMap = new Map(data.map((b) => [b.id, b]));
    const pick = (list: readonly number[]) => list.map((id) => byIdMap.get(id)).filter((b): b is BookSummary => !!b);
    mount(
      byId("hero-stack"),
      pick(FEATURED.heroStack).map((b) => cover(b))
    );
    mount(
      byId("promo-art-1"),
      pick(FEATURED.promoSell).map((b) => cover(b, { small: true }))
    );
    mount(
      byId("promo-art-2"),
      pick(FEATURED.promoRare).map((b) => cover(b, { small: true }))
    );
  } catch {
    /* chỉ là trang trí — bỏ qua khi lỗi */
  }
}

/* ---------- Thể loại ---------- */
async function loadCategories() {
  const grid = byId("cat-grid");
  mount(
    grid,
    Array.from({ length: 7 }, () => html`<div class="cat-card skeleton" aria-hidden="true"></div>`)
  );
  try {
    const cats = await catalogService.categories();
    mount(
      grid,
      cats.map(
        (
          c
        ) => html`<a class="cat-card" href="shop.html?cat=${c.id}" style="--cat-bg:${c.colors.bg};--cat-fg:${c.colors.fg}">
          <span class="cat-card__icon">${icon(c.icon)}</span><strong>${c.name}</strong><span>${c.bookCount} đầu sách</span>
        </a>`
      )
    );
  } catch (err) {
    mount(grid, errorState(err));
  }
}

/* ---------- Sách mới về (tab) ---------- */
let newArrivalsController: AbortController | null = null;
let currentTab = "all";

async function loadNewArrivals(tab: string) {
  currentTab = tab;
  newArrivalsController?.abort();
  const controller = (newArrivalsController = new AbortController());
  const grid = byId("new-grid");
  grid.setAttribute("aria-busy", "true");
  mount(grid, skeletonCards(8));
  try {
    const { data } = await catalogService.books(
      { sort: "newest", pageSize: 8, category: NEW_ARRIVAL_TABS[tab] },
      controller.signal
    );
    mount(grid, bookCards(data));
  } catch (err) {
    if (!isAbort(err)) mount(grid, errorState(err));
  } finally {
    if (newArrivalsController === controller) grid.removeAttribute("aria-busy");
  }
}

function bindTabs() {
  const tabs = byId("new-tabs");
  tabs.addEventListener("click", (e) => {
    const tab = (e.target as Element).closest<HTMLElement>(".tab");
    if (!tab) return;
    tabs.querySelectorAll(".tab").forEach((t) => {
      const on = t === tab;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", String(on));
    });
    void loadNewArrivals(tab.dataset.filter ?? "all");
  });
  onRetry(byId("new-grid"), () => void loadNewArrivals(currentTab));
}

/* ---------- Bán chạy ---------- */
async function loadBestsellers() {
  const grid = byId("best-grid");
  mount(grid, skeletonCards(4));
  try {
    const { data } = await catalogService.books({ sort: "bestseller", inStock: true, pageSize: 4 });
    mount(grid, bookCards(data));
  } catch (err) {
    mount(grid, errorState(err));
  }
}

/* ---------- Tiêu chuẩn tình trạng ---------- */
async function loadConditions() {
  const grid = byId("cond-grid");
  try {
    const conditions = await catalogService.conditions();
    mount(
      grid,
      conditions.map(
        (c) => html`<article class="cond-card reveal">
          ${conditionBadge(c)}${conditionMeter(c.id, c.level)}
          <h3>${c.label} · ${c.shortLabel}</h3>
          <p>${c.description}</p>
          <ul>${c.highlights.map((h) => html`<li>${icon("check")}<span>${h}</span></li>`)}</ul>
        </article>`
      )
    );
    observeReveal(grid);
  } catch (err) {
    mount(grid, errorState(err));
  }
}

/* ---------- Số liệu đếm tăng dần ---------- */
function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  const duration = 1600;
  const start = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = formatNumber(Math.round(target * eased)) + (p === 1 ? "+" : "");
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function bindCounters() {
  const counters = document.querySelectorAll<HTMLElement>("[data-count]");
  if (!("IntersectionObserver" in window)) {
    counters.forEach((el) => (el.textContent = `${formatNumber(Number(el.dataset.count))}+`));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          countUp(en.target as HTMLElement);
          io.unobserve(en.target);
        }
      }
    },
    { threshold: 0.5 }
  );
  counters.forEach((el) => io.observe(el));
}

/* ---------- Bản tin ---------- */
function bindNewsletter() {
  const form = byId<HTMLFormElement>("newsletter-form");
  const input = byId<HTMLInputElement>("nl-email");
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const parsed = subscribeSchema.safeParse({ email: input.value });
    if (!parsed.success) {
      toast("Vui lòng nhập một địa chỉ email hợp lệ.", { type: "warn" });
      input.focus();
      return;
    }
    button.disabled = true;
    try {
      const result = await engagementApi.subscribe(parsed.data.email);
      input.value = "";
      if (result.alreadySubscribed) toast("Email này đã đăng ký nhận tin rồi. Cảm ơn bạn!");
      else if (result.welcomeCouponCode)
        toast(html`Cảm ơn bạn! Mã <strong>${result.welcomeCouponCode}</strong> đã được gửi đến hộp thư.`, {
          duration: 5000
        });
      else toast("Cảm ơn bạn đã đăng ký nhận tin!");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Chưa đăng ký được, vui lòng thử lại.", { type: "warn" });
    } finally {
      button.disabled = false;
    }
  });
}

bindTabs();
bindCounters();
bindNewsletter();
onRetry(byId("cat-grid"), () => void loadCategories());
onRetry(byId("best-grid"), () => void loadBestsellers());
onRetry(byId("cond-grid"), () => void loadConditions());

void Promise.all([loadFeaturedCovers(), loadCategories(), loadNewArrivals("all"), loadBestsellers(), loadConditions()]);
