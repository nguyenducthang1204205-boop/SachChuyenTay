import { cover, productUrl } from "../ui/book.js";
import { emptyState } from "../ui/feedback.js";
import { icon } from "../ui/icons.js";
import { formatVnd } from "../lib/format.js";
import { html, mount } from "../lib/html.js";
import { cartStore } from "../stores/cart.store.js";

/** Giỏ hàng trượt bên phải — render từ cartStore, cập nhật mỗi khi giỏ đổi. */
export function renderCartDrawer(): void {
  const body = document.querySelector<HTMLElement>("[data-drawer-body]");
  const foot = document.querySelector<HTMLElement>("[data-drawer-foot]");
  if (!body || !foot) return;

  const lines = cartStore.lines();
  if (!lines.length) {
    mount(
      body,
      emptyState({
        icon: "book",
        title: "Giỏ sách đang trống",
        message: "Hàng nghìn cuốn sách đang chờ một người đọc mới."
      })
    );
    mount(foot, html`<a class="btn btn--block" href="shop.html">Khám phá cửa hàng ${icon("arrow")}</a>`);
    return;
  }

  mount(
    body,
    lines.map(({ book, quantity }) => {
      const atMax = quantity >= book.stock;
      return html`<div class="mini-item">
        <a href="${productUrl(book)}">${cover(book, { small: true })}</a>
        <div>
          <a class="mini-item__title" href="${productUrl(book)}">${book.title}</a>
          <p class="mini-item__meta">${book.author} · ${book.condition.label}</p>
          <div class="qty qty--sm">
            <button type="button" data-qty="${book.id}" data-delta="-1" aria-label="Giảm số lượng">${icon("minus")}</button>
            <input type="text" value="${quantity}" readonly aria-label="Số lượng" />
            <button type="button" data-qty="${book.id}" data-delta="1" aria-label="Tăng số lượng" ${atMax ? "disabled" : ""}>${icon("plus")}</button>
          </div>
        </div>
        <div style="display:grid;justify-items:end;gap:8px">
          <span class="mini-item__price">${formatVnd(book.price * quantity)}</span>
          <button class="mini-item__remove" type="button" data-remove="${book.id}" aria-label="Xoá khỏi giỏ">${icon("trash")}</button>
        </div>
      </div>`;
    })
  );

  const totals = cartStore.estimate();
  const pct = Math.min(100, (totals.subtotal / totals.freeShippingThreshold) * 100);
  mount(
    foot,
    html`<div class="ship-progress">
        ${
          totals.freeShippingRemaining > 0
            ? html`Mua thêm <strong>${formatVnd(totals.freeShippingRemaining)}</strong> để được miễn phí giao hàng`
            : html`${icon("check")} <strong>Bạn được miễn phí giao hàng!</strong>`
        }
        <div class="ship-progress__bar"><span style="width:${pct}%"></span></div>
      </div>
      <div class="drawer__total"><span>Tạm tính</span><strong>${formatVnd(totals.subtotal)}</strong></div>
      <a class="btn btn--block btn--lg" href="cart.html">Thanh toán ${icon("arrow")}</a>
      <button class="btn btn--ghost btn--block" type="button" data-close-cart>Tiếp tục chọn sách</button>`
  );
}
