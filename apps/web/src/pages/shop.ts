import {
  BOOK_SORTS,
  CONDITION_IDS,
  DEFAULT_PAGE_SIZE,
  type BookListParams,
  type BookSort,
  type BookSummary,
  type Category,
  type Condition,
  type ConditionId
} from "@sct/shared";
import { isAbort } from "../api/http.js";
import { initAppShell } from "../layout/app-shell.js";
import { byId, debounce } from "../lib/dom.js";
import { formatVnd } from "../lib/format.js";
import { html, mount } from "../lib/html.js";
import { catalogService } from "../services/catalog.service.js";
import { wishlistStore } from "../stores/wishlist.store.js";
import { bookCard, bookCards } from "../ui/book.js";
import { emptyState, errorState, onRetry, skeletonCards } from "../ui/feedback.js";
import { icon } from "../ui/icons.js";

initAppShell();

const MAX_PRICE = 250_000;
const els = {
  cats: byId("f-cats"),
  conds: byId("f-conds"),
  price: byId<HTMLInputElement>("f-price"),
  priceVal: byId("f-price-val"),
  stock: byId<HTMLInputElement>("f-stock"),
  reset: byId("f-reset"),
  sort: byId<HTMLSelectElement>("sort"),
  grid: byId("shop-grid"),
  count: byId("result-count"),
  chips: byId("active-filters"),
  more: byId("load-more"),
  title: byId("shop-title"),
  sub: byId("shop-sub"),
  crumb: byId("crumb-current"),
  filters: byId("filters"),
  apply: byId("f-apply")
};

/* ---------- State (đồng bộ 2 chiều với URL để chia sẻ / back được) ---------- */

interface ShopState {
  q: string;
  cats: Set<string>;
  conds: Set<ConditionId>;
  maxPrice: number;
  inStock: boolean;
  sort: BookSort;
  wishlist: boolean;
}

function readState(): ShopState {
  const p = new URLSearchParams(location.search);
  const list = (key: string) => (p.get(key) ?? "").split(",").filter(Boolean);
  const sort = p.get("sort") as BookSort | null;
  return {
    q: (p.get("q") ?? "").trim(),
    cats: new Set(list("cat")),
    conds: new Set(list("cond").filter((c): c is ConditionId => (CONDITION_IDS as readonly string[]).includes(c))),
    maxPrice: Math.min(MAX_PRICE, Number(p.get("max")) || MAX_PRICE),
    inStock: p.get("stock") === "1",
    sort: sort && BOOK_SORTS.includes(sort) ? sort : "featured",
    wishlist: p.get("wishlist") === "1"
  };
}

function writeUrl(s: ShopState) {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.cats.size) p.set("cat", [...s.cats].join(","));
  if (s.conds.size) p.set("cond", [...s.conds].join(","));
  if (s.maxPrice < MAX_PRICE) p.set("max", String(s.maxPrice));
  if (s.inStock) p.set("stock", "1");
  if (s.sort !== "featured") p.set("sort", s.sort);
  if (s.wishlist) p.set("wishlist", "1");
  const qs = p.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : ""));
}

const state = readState();
let categories: Category[] = [];
let conditions: Condition[] = [];

/* ---------- Bộ lọc ---------- */

function renderFilterOptions() {
  mount(
    els.cats,
    categories.map(
      (
        c
      ) => html`<label class="check"><input type="checkbox" value="${c.id}" ${state.cats.has(c.id) ? "checked" : ""} />
        <span>${c.name}</span><span class="count-muted">${c.bookCount}</span></label>`
    )
  );
  mount(
    els.conds,
    conditions.map(
      (
        c
      ) => html`<label class="check"><input type="checkbox" value="${c.id}" ${state.conds.has(c.id) ? "checked" : ""} />
        <span>${c.label} <small style="color:var(--muted)">(${c.shortLabel})</small></span><span class="count-muted">${c.bookCount}</span></label>`
    )
  );
}

function syncControls() {
  els.cats.querySelectorAll<HTMLInputElement>("input").forEach((i) => (i.checked = state.cats.has(i.value)));
  els.conds
    .querySelectorAll<HTMLInputElement>("input")
    .forEach((i) => (i.checked = state.conds.has(i.value as ConditionId)));
  els.price.value = String(state.maxPrice);
  els.priceVal.textContent = formatVnd(state.maxPrice);
  els.stock.checked = state.inStock;
  els.sort.value = state.sort;
}

const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
const conditionLabel = (id: string) => conditions.find((c) => c.id === id)?.label ?? id;

function renderHeading() {
  let title = "Tất cả sách";
  let sub = "Mỗi cuốn sách đều đã được kiểm định tình trạng và làm sạch. Phần lớn chỉ có một bản duy nhất.";
  if (state.wishlist) {
    title = "Sách bạn yêu thích";
    sub = "Những cuốn bạn đã lưu lại. Sách cũ thường chỉ có một bản — đừng để lỡ nhé.";
  } else if (state.q) title = `Kết quả cho “${state.q}”`;
  else if (state.cats.size === 1) title = categoryName([...state.cats][0]!);
  else if (state.sort === "newest") title = "Sách mới về";

  els.title.textContent = title;
  els.sub.textContent = sub;
  els.crumb.textContent = title;
  document.title = `${title} — Sách Chuyền Tay`;
}

const chip = (label: string, key: string, val = "") =>
  html`<span class="chip">${label}<button type="button" data-chip="${key}" data-val="${val}" aria-label="Bỏ lọc ${label}">${icon("x")}</button></span>`;

function renderChips() {
  const out = [];
  if (state.wishlist) out.push(chip("Yêu thích", "wishlist"));
  if (state.q) out.push(chip(`“${state.q}”`, "q"));
  state.cats.forEach((c) => out.push(chip(categoryName(c), "cat", c)));
  state.conds.forEach((c) => out.push(chip(conditionLabel(c), "cond", c)));
  if (state.maxPrice < MAX_PRICE) out.push(chip(`≤ ${formatVnd(state.maxPrice)}`, "max"));
  if (state.inStock) out.push(chip("Còn hàng", "stock"));
  if (out.length > 1)
    out.push(html`<button class="chip chip--clear" type="button" data-chip="all">Xoá tất cả</button>`);
  mount(els.chips, out);
}

/* ---------- Kết quả (phân trang phía server, "Xem thêm" nối trang) ---------- */

let page = 1;
let shown: BookSummary[] = [];
let total = 0;
let controller: AbortController | null = null;

function queryParams(): BookListParams {
  return {
    q: state.q || undefined,
    category: [...state.cats],
    condition: [...state.conds],
    maxPrice: state.maxPrice < MAX_PRICE ? state.maxPrice : undefined,
    inStock: state.inStock,
    sort: state.sort,
    ids: state.wishlist ? [...wishlistStore.ids()] : undefined,
    page,
    pageSize: DEFAULT_PAGE_SIZE
  };
}

function renderEmpty() {
  mount(
    els.grid,
    emptyState({
      icon: state.wishlist ? "heart" : "search",
      title: state.wishlist ? "Bạn chưa lưu cuốn sách nào" : "Không tìm thấy cuốn sách phù hợp",
      message: state.wishlist
        ? "Nhấn biểu tượng trái tim trên mỗi cuốn sách để lưu lại."
        : "Thử bỏ bớt bộ lọc hoặc tìm với từ khoá khác nhé.",
      action: html`<a class="btn" href="shop.html">Xem tất cả sách</a>`,
      style: "grid-column:1/-1"
    })
  );
  mount(els.more, null);
}

function renderSummary() {
  els.count.innerHTML = html`Hiển thị <strong>${shown.length}</strong> / ${total} cuốn sách`.value;
  els.apply.textContent = `Xem ${total} kết quả`;
  if (total > shown.length) {
    mount(
      els.more,
      html`<span>Bạn đã xem ${shown.length} trên ${total} cuốn</span>
        <div class="load-more__bar"><span style="width:${(shown.length / total) * 100}%"></span></div>
        <button class="btn btn--ghost" type="button" id="more-btn">Xem thêm sách</button>`
    );
  } else {
    mount(els.more, total > DEFAULT_PAGE_SIZE ? html`<span>Bạn đã xem hết ${total} cuốn sách</span>` : null);
  }
}

async function loadResults({ append = false } = {}) {
  controller?.abort();
  const current = (controller = new AbortController());

  if (state.wishlist && wishlistStore.count() === 0) {
    shown = [];
    total = 0;
    els.count.innerHTML = html`Hiển thị <strong>0</strong> / 0 cuốn sách`.value;
    els.apply.textContent = "Xem 0 kết quả";
    return renderEmpty();
  }

  els.grid.setAttribute("aria-busy", "true");
  if (append) {
    const btn = document.getElementById("more-btn") as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Đang tải…";
    }
  } else {
    mount(els.grid, skeletonCards(8));
  }

  try {
    const res = await catalogService.books(queryParams(), current.signal);
    total = res.meta.total;
    if (append) {
      shown = [...shown, ...res.data];
      els.grid.insertAdjacentHTML("beforeend", res.data.map((b) => bookCard(b).value).join(""));
    } else {
      shown = res.data;
      if (!shown.length) return renderEmpty();
      mount(els.grid, bookCards(shown));
    }
    renderSummary();
  } catch (err) {
    if (isAbort(err)) return;
    if (append) page--;
    mount(els.grid, errorState(err));
    mount(els.more, null);
  } finally {
    if (controller === current) els.grid.removeAttribute("aria-busy");
  }
}

/** Mỗi khi bộ lọc đổi: về trang 1, cập nhật URL, tiêu đề, chip và tải lại. */
function update() {
  page = 1;
  writeUrl(state);
  renderHeading();
  renderChips();
  void loadResults();
}
const updateDebounced = debounce(update, 250);

/* ---------- Events ---------- */

els.cats.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.checked) state.cats.add(input.value);
  else state.cats.delete(input.value);
  update();
});
els.conds.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const id = input.value as ConditionId;
  if (input.checked) state.conds.add(id);
  else state.conds.delete(id);
  update();
});
els.price.addEventListener("input", () => {
  state.maxPrice = Number(els.price.value);
  els.priceVal.textContent = formatVnd(state.maxPrice);
  updateDebounced();
});
els.stock.addEventListener("change", () => {
  state.inStock = els.stock.checked;
  update();
});
els.sort.addEventListener("change", () => {
  state.sort = els.sort.value as BookSort;
  update();
});

function resetFilters() {
  state.q = "";
  state.cats.clear();
  state.conds.clear();
  state.maxPrice = MAX_PRICE;
  state.inStock = false;
  state.wishlist = false;
  const headerQ = document.getElementById("header-q") as HTMLInputElement | null;
  if (headerQ) headerQ.value = "";
  syncControls();
  update();
}
els.reset.addEventListener("click", resetFilters);

els.chips.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-chip]");
  if (!btn) return;
  const { chip: key, val = "" } = btn.dataset;
  switch (key) {
    case "all":
      return resetFilters();
    case "q": {
      state.q = "";
      const headerQ = document.getElementById("header-q") as HTMLInputElement | null;
      if (headerQ) headerQ.value = "";
      break;
    }
    case "cat":
      state.cats.delete(val);
      break;
    case "cond":
      state.conds.delete(val as ConditionId);
      break;
    case "max":
      state.maxPrice = MAX_PRICE;
      break;
    case "stock":
      state.inStock = false;
      break;
    case "wishlist":
      state.wishlist = false;
      break;
  }
  syncControls();
  update();
});

els.more.addEventListener("click", (e) => {
  if ((e.target as Element).closest("#more-btn")) {
    page++;
    void loadResults({ append: true });
  }
});
onRetry(els.grid, () => void loadResults());

// Bộ lọc dạng bottom-sheet trên di động
byId("open-filters").addEventListener("click", () => {
  els.filters.classList.add("is-open");
  document.body.style.overflow = "hidden";
});
els.filters.addEventListener("click", (e) => {
  if ((e.target as Element).closest("[data-close-filters]")) {
    els.filters.classList.remove("is-open");
    document.body.style.overflow = "";
  }
});

// Đang xem danh sách yêu thích mà bỏ thích một cuốn → tải lại
wishlistStore.subscribe(() => {
  if (state.wishlist) update();
});

/* ---------- Khởi động ---------- */
syncControls();
renderHeading();
renderChips();
void loadResults();

Promise.all([catalogService.categories(), catalogService.conditions()])
  .then(([cats, conds]) => {
    categories = cats;
    conditions = conds;
    renderFilterOptions();
    renderHeading();
    renderChips();
  })
  .catch(() => {
    mount(els.cats, html`<p class="hint">Chưa tải được danh sách thể loại.</p>`);
  });
