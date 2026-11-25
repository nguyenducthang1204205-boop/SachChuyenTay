import { BOOK_SORTS, type AdminBook, type AdminBookListParams, type AdminCategory, type BookSort } from "@sct/shared";
import { isAbort } from "../../api/http.js";
import { debounce } from "../../lib/dom.js";
import { formatVnd } from "../../lib/format.js";
import { html, mount } from "../../lib/html.js";
import { conditionBadge, cover } from "../../ui/book.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { adminApi } from "../admin.api.js";
import {
  confirmDialog,
  hashQuery,
  notifyDataChanged,
  pageHead,
  pager,
  pill,
  setHashQuery,
  tableEmpty,
  tableLoading,
  toastError
} from "../admin.ui.js";

const SORT_LABELS: Record<BookSort, string> = {
  newest: "Mới thêm",
  featured: "Nổi bật",
  "price-asc": "Giá tăng dần",
  "price-desc": "Giá giảm dần",
  discount: "Giảm nhiều nhất",
  rating: "Đánh giá cao",
  bestseller: "Bán chạy"
};
const COLS = 7;

function row(b: AdminBook) {
  return html`<tr>
    <td><div class="adm-book-cell">
      <a class="adm-thumb" href="#/books/${b.id}">${cover(b, { small: true })}</a>
      <div><a class="title" href="#/books/${b.id}">${b.title}</a><div class="muted">${b.author} · ${b.sku}</div></div>
    </div></td>
    <td>${b.category.name}<div style="margin-top:4px">${conditionBadge(b.condition)}</div></td>
    <td class="num">${formatVnd(b.price)}${b.originalPrice ? html`<div class="muted"><s>${formatVnd(b.originalPrice)}</s></div>` : null}</td>
    <td class="num"><span class="${b.stock <= 0 ? "adm-stock-0" : ""}">${b.stock}</span></td>
    <td>${b.isPublished ? pill("Đang bán", "green") : pill("Đang ẩn", "muted")}</td>
    <td class="muted">${new Date(b.updatedAt).toLocaleDateString("vi-VN")}</td>
    <td><div class="adm-actions">
      <button class="adm-icon-btn" type="button" data-toggle="${b.id}" title="${b.isPublished ? "Ẩn khỏi cửa hàng" : "Hiện lên cửa hàng"}">${icon(b.isPublished ? "eyeOff" : "eye")}</button>
      <a class="adm-icon-btn" href="#/books/${b.id}" title="Sửa">${icon("edit")}</a>
      <button class="adm-icon-btn adm-icon-btn--danger" type="button" data-delete="${b.id}" title="Xoá">${icon("trash")}</button>
    </div></td>
  </tr>`;
}

export async function booksView(root: HTMLElement) {
  document.title = "Sách — Quản trị";
  const q = hashQuery();
  const state: Required<Pick<AdminBookListParams, "visibility" | "stock" | "sort" | "page">> & {
    q: string;
    category: string;
  } = {
    q: q.get("q") ?? "",
    category: q.get("category") ?? "",
    visibility: (q.get("visibility") as AdminBookListParams["visibility"]) ?? "all",
    stock: (q.get("stock") as AdminBookListParams["stock"]) ?? "all",
    sort: (q.get("sort") as BookSort) ?? "newest",
    page: Number(q.get("page")) || 1
  };
  let books: AdminBook[] = [];
  let categories: AdminCategory[] = [];
  let controller: AbortController | null = null;

  mount(
    root,
    html`${pageHead("Sách", "Thêm, sửa, ẩn hoặc xoá sách trên cửa hàng.", html`<a class="btn btn--sm" href="#/books/new">${icon("plus")} Thêm sách</a>`)}
    <div class="adm-toolbar">
      <label class="adm-search">${icon("search")}<span class="visually-hidden">Tìm sách</span>
        <input class="input" type="search" name="q" placeholder="Tìm theo tên, tác giả, NXB…" value="${state.q}" /></label>
      <select class="select" name="category" aria-label="Thể loại"><option value="">Tất cả thể loại</option></select>
      <select class="select" name="visibility" aria-label="Hiển thị">
        <option value="all">Mọi trạng thái</option><option value="published">Đang bán</option><option value="hidden">Đang ẩn</option>
      </select>
      <select class="select" name="stock" aria-label="Tồn kho">
        <option value="all">Mọi tồn kho</option><option value="in-stock">Còn hàng</option><option value="out-of-stock">Hết hàng</option>
      </select>
      <select class="select" name="sort" aria-label="Sắp xếp">${BOOK_SORTS.map((s) => html`<option value="${s}">${SORT_LABELS[s]}</option>`)}</select>
    </div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Sách</th><th>Thể loại / Tình trạng</th><th class="num">Giá</th><th class="num">Kho</th><th>Hiển thị</th><th>Cập nhật</th><th></th></tr></thead>
      <tbody data-rows>${tableLoading(COLS)}</tbody>
    </table></div>
    <div data-pager></div>`
  );

  const tbody = root.querySelector<HTMLElement>("[data-rows]")!;
  const pagerEl = root.querySelector<HTMLElement>("[data-pager]")!;
  const control = (name: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!;
  for (const k of ["visibility", "stock", "sort"] as const) control(k).value = state[k];

  async function load() {
    controller?.abort();
    const current = (controller = new AbortController());
    setHashQuery({
      ...state,
      page: state.page > 1 ? state.page : undefined,
      visibility: state.visibility === "all" ? undefined : state.visibility,
      stock: state.stock === "all" ? undefined : state.stock,
      sort: state.sort === "newest" ? undefined : state.sort
    });
    try {
      const res = await adminApi.books.list(
        { ...state, q: state.q || undefined, category: state.category || undefined, pageSize: 20 },
        current.signal
      );
      books = res.data;
      mount(tbody, books.length ? books.map(row) : tableEmpty(COLS, "Không có sách nào khớp bộ lọc."));
      mount(pagerEl, pager(res.meta));
    } catch (err) {
      if (!isAbort(err)) toastError(err, "Không tải được danh sách sách.");
    }
  }

  const reload = (resetPage = true) => {
    if (resetPage) state.page = 1;
    void load();
  };
  const reloadDebounced = debounce(() => reload(), 300);

  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "q") {
      state.q = t.value.trim();
      reloadDebounced();
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.name === "category") state.category = t.value;
    else if (t.name === "visibility") state.visibility = t.value as typeof state.visibility;
    else if (t.name === "stock") state.stock = t.value as typeof state.stock;
    else if (t.name === "sort") state.sort = t.value as BookSort;
    else return;
    reload();
  });

  root.addEventListener("click", async (e) => {
    const target = e.target as Element;
    const pageBtn = target.closest<HTMLElement>("[data-goto-page]");
    if (pageBtn) {
      state.page = Number(pageBtn.dataset.gotoPage);
      return reload(false);
    }

    const toggle = target.closest<HTMLButtonElement>("[data-toggle]");
    if (toggle) {
      const book = books.find((b) => b.id === Number(toggle.dataset.toggle));
      if (!book) return;
      toggle.disabled = true;
      try {
        await adminApi.books.update(book.id, { isPublished: !book.isPublished });
        toast(book.isPublished ? `Đã ẩn “${book.title}” khỏi cửa hàng` : `Đã hiện “${book.title}” lên cửa hàng`);
        notifyDataChanged();
        reload(false);
      } catch (err) {
        toastError(err);
        toggle.disabled = false;
      }
      return;
    }

    const del = target.closest<HTMLElement>("[data-delete]");
    if (del) {
      const book = books.find((b) => b.id === Number(del.dataset.delete));
      if (!book) return;
      const ok = await confirmDialog({
        title: "Xoá sách?",
        message: html`Xoá vĩnh viễn <strong>“${book.title}”</strong>. Không thể hoàn tác. Nếu sách đã từng được đặt mua, hệ thống sẽ yêu cầu bạn <em>ẩn</em> thay vì xoá.`,
        confirmText: "Xoá sách",
        danger: true
      });
      if (!ok) return;
      try {
        await adminApi.books.remove(book.id);
        toast(`Đã xoá “${book.title}”`);
        notifyDataChanged();
        reload(false);
      } catch (err) {
        toastError(err);
      }
    }
  });

  void load();
  categories = (await adminApi.categories.list()).data;
  const catSelect = control("category");
  mount(catSelect, [
    html`<option value="">Tất cả thể loại</option>`,
    categories.map((c) => html`<option value="${c.id}">${c.name} (${c.totalBooks})</option>`)
  ]);
  catSelect.value = state.category;
}
