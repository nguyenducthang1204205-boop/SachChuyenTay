import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE, type BookDetail, type Condition } from "@sct/shared";
import { ApiError } from "../api/http.js";
import { initAppShell } from "../layout/app-shell.js";
import { byId, param, setMetaDescription } from "../lib/dom.js";
import { formatVnd } from "../lib/format.js";
import { html, mount, type SafeHtml } from "../lib/html.js";
import { catalogService } from "../services/catalog.service.js";
import { wishlistStore } from "../stores/wishlist.store.js";
import { badges, bookCards, conditionBadge, conditionMeter, cover, stars } from "../ui/book.js";
import { errorState, onRetry, skeletonCards } from "../ui/feedback.js";
import { icon } from "../ui/icons.js";

initAppShell();

const root = byId("product-root");
const relatedWrap = byId("related-wrap");
const bookId = Number(param("id"));

const skeleton = html`<div class="product-skeleton" aria-busy="true" aria-label="Đang tải">
  <div class="skeleton skeleton--block"></div>
  <div>
    <div class="skeleton skeleton--line skeleton--short"></div>
    <div class="skeleton skeleton--title" style="height:40px"></div>
    <div class="skeleton skeleton--line skeleton--short"></div>
    <div class="skeleton skeleton--block" style="margin-top:28px"></div>
    <div class="skeleton skeleton--block" style="margin-top:20px"></div>
  </div>
</div>`;

function notFound(): SafeHtml {
  return html`<div class="not-found">
    <div class="empty-state__icon">${icon("book")}</div>
    <h1>Không tìm thấy cuốn sách</h1>
    <p>Có thể cuốn sách này đã được chuyền tay hoặc đường dẫn chưa chính xác.</p>
    <a class="btn" href="shop.html">Quay lại cửa hàng</a>
  </div>`;
}

function stockNote(b: BookDetail): SafeHtml {
  if (b.stock === 0)
    return html`<p class="stock-note">${icon("info")} Cuốn sách này đã được chuyền tay. Nhấn ♡ để nhận thông báo khi có bản mới.</p>`;
  if (b.stock === 1)
    return html`<p class="stock-note">${icon("clock")} Chỉ còn 1 bản duy nhất — sách cũ hiếm khi về lại.</p>`;
  return html`<p class="stock-note" style="color:var(--success)">${icon("check")} Còn ${b.stock} bản trong kho</p>`;
}

function productView(b: BookDetail, conditions: Condition[]): SafeHtml {
  const cond = conditions.find((c) => c.id === b.condition.id);
  const sold = b.stock === 0;
  const save = b.originalPrice ? b.originalPrice - b.price : 0;

  return html`
    <nav class="breadcrumb" aria-label="Breadcrumb" style="padding-top:28px">
      <a href="index.html">Trang chủ</a>${icon("chevronRight")}
      <a href="shop.html?cat=${b.category.id}">${b.category.name}</a>${icon("chevronRight")}
      <span aria-current="page">${b.title}</span>
    </nav>
    <div class="product">
      <div class="product__gallery">
        <div class="product__stage">${badges(b)}${cover(b)}</div>
        <div class="product__perks">
          <div>${icon("shield")}<span>Đã kiểm định<br />20 tiêu chí</span></div>
          <div>${icon("refresh")}<span>Đổi trả<br />trong 7 ngày</span></div>
          <div>${icon("package")}<span>Đóng gói<br />giấy kraft</span></div>
        </div>
      </div>
      <div class="product__info">
        <span class="product__cat">${b.category.name}</span>
        <h1 class="product__title">${b.title}</h1>
        <p class="product__author">Tác giả: <a href="shop.html?q=${encodeURIComponent(b.author)}">${b.author}</a></p>
        <div class="product__rating">${stars(b.rating)}<strong>${b.rating.toFixed(1)}</strong><span>(${b.reviewCount} đánh giá)</span></div>
        <div class="product__price">
          <strong>${formatVnd(b.price)}</strong>
          ${
            b.originalPrice
              ? html`<s>${formatVnd(b.originalPrice)}</s><span class="badge badge--sale">-${b.discountPercent}%</span>`
              : html`<span class="badge badge--rare">${icon("sparkles")} Sách hiếm</span>`
          }
          ${save ? html`<span class="save">Bạn tiết kiệm<br />${formatVnd(save)}</span>` : null}
        </div>
        <div class="cond-box">
          <div class="cond-box__head"><strong>Tình trạng: ${b.condition.label}${cond ? ` (${cond.shortLabel})` : ""}</strong>${conditionBadge(b.condition)}</div>
          ${cond ? conditionMeter(cond.id, cond.level) : null}
          <p><strong>Ghi chú kiểm định:</strong> ${b.inspectionNote}</p>
        </div>
        <div class="buy-row">
          ${
            sold
              ? null
              : html`<div class="qty" aria-label="Chọn số lượng">
                <button type="button" id="qty-minus" aria-label="Giảm">${icon("minus")}</button>
                <input type="number" id="qty" value="1" min="1" max="${b.stock}" aria-label="Số lượng" />
                <button type="button" id="qty-plus" aria-label="Tăng">${icon("plus")}</button>
              </div>`
          }
          <button class="btn btn--lg" type="button" id="add-btn" data-add-cart="${b.id}" ${sold ? "disabled" : ""}>${icon("bag")}${sold ? " Đã chuyền tay" : " Thêm vào giỏ"}</button>
          ${sold ? null : html`<button class="btn btn--accent btn--lg" type="button" id="buy-btn" data-add-cart="${b.id}" data-go-checkout="1">Mua ngay</button>`}
        </div>
        ${stockNote(b)}
        <button class="wish-link" type="button" data-wish="${b.id}" aria-pressed="${wishlistStore.has(b.id)}">${icon("heart")} Lưu vào yêu thích</button>
        <dl class="specs">
          <div><dt>Nhà xuất bản</dt><dd>${b.publisher}</dd></div>
          <div><dt>Năm xuất bản</dt><dd>${b.publishedYear ?? "—"}</dd></div>
          <div><dt>Số trang</dt><dd>${b.pages ?? "—"}</dd></div>
          <div><dt>Mã sách</dt><dd>${b.sku}</dd></div>
        </dl>
        <div class="ptabs">
          <div class="ptabs__list" role="tablist">
            <button role="tab" aria-selected="true" aria-controls="tab-desc" id="t-desc">Giới thiệu</button>
            <button role="tab" aria-selected="false" aria-controls="tab-cond" id="t-cond">Tiêu chuẩn tình trạng</button>
            <button role="tab" aria-selected="false" aria-controls="tab-ship" id="t-ship">Giao hàng & đổi trả</button>
          </div>
          <div class="ptabs__panel" role="tabpanel" id="tab-desc" aria-labelledby="t-desc"><p>${b.description}</p></div>
          <div class="ptabs__panel" role="tabpanel" id="tab-cond" aria-labelledby="t-cond" hidden>
            <ul>${conditions.map((c) => html`<li>${icon("check")}<span><strong>${c.label} (${c.shortLabel}):</strong> ${c.description}</span></li>`)}</ul>
          </div>
          <div class="ptabs__panel" role="tabpanel" id="tab-ship" aria-labelledby="t-ship" hidden>
            <ul>
              <li>${icon("truck")}<span>Giao hàng toàn quốc 2–4 ngày. Miễn phí cho đơn từ ${formatVnd(FREE_SHIPPING_THRESHOLD)}, còn lại phí đồng giá ${formatVnd(SHIPPING_FEE)}.</span></li>
              <li>${icon("refresh")}<span>Đổi trả trong 7 ngày nếu sách không đúng mô tả tình trạng — hoàn tiền 100%, miễn phí vận chuyển.</span></li>
              <li>${icon("package")}<span>Sách được vệ sinh, bọc giấy kraft và chèn chống sốc trước khi gửi.</span></li>
            </ul>
          </div>
        </div>
      </div>
    </div>`;
}

function bindQuantity(b: BookDetail) {
  const qty = document.getElementById("qty") as HTMLInputElement | null;
  if (!qty) return;
  const addBtn = byId("add-btn");
  const buyBtn = byId("buy-btn");
  const minus = byId<HTMLButtonElement>("qty-minus");
  const plus = byId<HTMLButtonElement>("qty-plus");
  const set = (v: number) => {
    const n = Math.max(1, Math.min(b.stock, Number(v) || 1));
    qty.value = String(n);
    addBtn.dataset.qty = buyBtn.dataset.qty = String(n);
    minus.disabled = n <= 1;
    plus.disabled = n >= b.stock;
  };
  minus.addEventListener("click", () => set(Number(qty.value) - 1));
  plus.addEventListener("click", () => set(Number(qty.value) + 1));
  qty.addEventListener("change", () => set(Number(qty.value)));
  set(1);
}

function bindTabs() {
  const tabs = root.querySelectorAll<HTMLElement>('[role="tab"]');
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        byId(t.getAttribute("aria-controls")!).hidden = !on;
      });
    })
  );
}

async function loadRelated(b: BookDetail) {
  const grid = byId("related-grid");
  byId<HTMLAnchorElement>("related-link").href = `shop.html?cat=${b.category.id}`;
  mount(grid, skeletonCards(4));
  try {
    mount(grid, bookCards(await catalogService.related(b.id, 4)));
  } catch {
    relatedWrap.hidden = true;
  }
}

async function load() {
  if (!Number.isInteger(bookId) || bookId <= 0) {
    mount(root, notFound());
    relatedWrap.hidden = true;
    return;
  }
  mount(root, skeleton);
  try {
    const [book, conditions] = await Promise.all([
      catalogService.book(bookId),
      catalogService.conditions().catch(() => [])
    ]);
    document.title = `${book.title} – ${book.author} | Sách Chuyền Tay`;
    setMetaDescription(book.description);
    mount(root, productView(book, conditions));
    bindQuantity(book);
    bindTabs();
    void loadRelated(book);
  } catch (err) {
    relatedWrap.hidden = true;
    mount(root, err instanceof ApiError && err.status === 404 ? notFound() : errorState(err, "padding:96px 16px"));
  }
}

onRetry(root, () => void load());
void load();
