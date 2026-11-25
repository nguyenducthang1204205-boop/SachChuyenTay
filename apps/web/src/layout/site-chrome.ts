import { FREE_SHIPPING_THRESHOLD } from "@sct/shared";
import { param } from "../lib/dom.js";
import { formatVnd } from "../lib/format.js";
import { html, mount, type SafeHtml } from "../lib/html.js";
import { catalogService } from "../services/catalog.service.js";
import { icon } from "../ui/icons.js";

/** Header, menu di động, khung giỏ trượt và footer — dùng chung cho mọi trang. */

export type PageId = "home" | "shop" | "new" | "sell" | "about" | "product" | "cart";

const NAV: ReadonlyArray<{ href: string; label: string; page: PageId }> = [
  { href: "index.html", label: "Trang chủ", page: "home" },
  { href: "shop.html", label: "Cửa hàng", page: "shop" },
  { href: "shop.html?sort=newest", label: "Mới về", page: "new" },
  { href: "sell.html", label: "Bán sách cũ", page: "sell" },
  { href: "index.html#ve-chung-toi", label: "Về chúng tôi", page: "about" }
];

export const CONTACT = {
  hotline: "0909 123 456",
  hotlineTel: "0909123456",
  email: "xinchao@sachchuyentay.vn",
  address: "123 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh",
  hours: "8:00 – 21:00, Thứ 2 – Chủ nhật"
} as const;

const brand = (): SafeHtml => html`<a class="brand" href="index.html" aria-label="Sách Chuyền Tay — Trang chủ">
  <img src="/assets/img/logo.svg" alt="" width="40" height="40" />
  <span><span class="brand__name">Sách Chuyền Tay</span><span class="brand__tag">Nhà sách cũ có tâm</span></span>
</a>`;

function headerHtml(page: string | undefined): SafeHtml {
  const q = page === "shop" ? (param("q") ?? "") : "";
  const links = NAV.map(
    (n) =>
      html`<a href="${n.href}" ${n.page === page ? html`class="is-active" aria-current="page"` : null}>${n.label}</a>`
  );
  const mobileLinks = NAV.map(
    (n) =>
      html`<a href="${n.href}" ${n.page === page ? html`class="is-active"` : null}>${n.label}${icon("chevronRight")}</a>`
  );

  return html`
    <div class="topbar"><div class="container">
      <p class="topbar__msg">${icon("truck")}<span>Miễn phí giao hàng cho đơn từ <strong>${formatVnd(FREE_SHIPPING_THRESHOLD)}</strong> · Đổi trả trong 7 ngày</span></p>
      <div class="topbar__links"><a href="sell.html">Ký gửi sách</a><a href="tel:${CONTACT.hotlineTel}">Hotline: ${CONTACT.hotline}</a></div>
    </div></div>
    <header class="site-header" id="header"><div class="container">
      <button class="icon-btn menu-toggle" type="button" aria-label="Mở menu" aria-controls="mobile-nav" aria-expanded="false" data-open-menu>${icon("menu")}</button>
      ${brand()}
      <nav class="nav" aria-label="Điều hướng chính">${links}</nav>
      <form class="header-search" action="shop.html" role="search">${icon("search")}
        <label class="visually-hidden" for="header-q">Tìm sách</label>
        <input id="header-q" name="q" type="search" placeholder="Tìm tên sách, tác giả…" value="${q}" autocomplete="off" />
      </form>
      <div class="header-actions">
        <a class="icon-btn" href="shop.html?wishlist=1" aria-label="Sách yêu thích">${icon("heart")}<span class="count" data-wish-count>0</span></a>
        <button class="icon-btn" type="button" aria-label="Mở giỏ hàng" aria-controls="cart-drawer" data-open-cart>${icon("bag")}<span class="count" data-cart-count>0</span></button>
      </div>
    </div></header>
    <div class="mobile-nav" id="mobile-nav" aria-hidden="true">
      <div class="backdrop" data-close-menu></div>
      <div class="mobile-nav__panel" role="dialog" aria-modal="true" aria-label="Menu">
        <div class="mobile-nav__head">${brand()}<button class="icon-btn" type="button" aria-label="Đóng menu" data-close-menu>${icon("x")}</button></div>
        <form class="header-search" action="shop.html" role="search" style="display:block;max-width:none;margin:0">${icon("search")}
          <input name="q" type="search" placeholder="Tìm tên sách, tác giả…" aria-label="Tìm sách" />
        </form>
        <nav>${mobileLinks}</nav>
        <a class="btn btn--accent" href="sell.html">${icon("wallet")} Bán sách cho chúng tôi</a>
      </div>
    </div>
    <div class="drawer" id="cart-drawer" aria-hidden="true">
      <div class="backdrop" data-close-cart></div>
      <aside class="drawer__panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div class="drawer__head"><h2 id="drawer-title">Giỏ sách của bạn</h2><button class="icon-btn" type="button" aria-label="Đóng giỏ hàng" data-close-cart>${icon("x")}</button></div>
        <div class="drawer__body" data-drawer-body></div>
        <div class="drawer__foot" data-drawer-foot></div>
      </aside>
    </div>`;
}

function footerHtml(): SafeHtml {
  return html`<footer class="site-footer"><div class="container">
    <div class="footer-grid">
      <div>${brand()}
        <p class="footer-about">Chúng tôi tin rằng sách không nên nằm im trên kệ. Mỗi cuốn sách cũ được tuyển chọn, làm sạch và trao lại cho một người đọc mới.</p>
        <div class="socials"><a href="#" aria-label="Facebook">${icon("facebook")}</a><a href="#" aria-label="Instagram">${icon("instagram")}</a><a href="#" aria-label="YouTube">${icon("youtube")}</a></div>
      </div>
      <div class="footer-col"><h3>Thể loại</h3><ul data-footer-categories><li><a href="shop.html">Tất cả sách</a></li></ul></div>
      <div class="footer-col"><h3>Hỗ trợ</h3><ul>
        <li><a href="sell.html">Bán / ký gửi sách</a></li>
        <li><a href="index.html#tinh-trang">Tiêu chuẩn tình trạng</a></li>
        <li><a href="sell.html#faq">Câu hỏi thường gặp</a></li>
        <li><a href="#">Chính sách đổi trả</a></li>
        <li><a href="#">Chính sách bảo mật</a></li>
      </ul></div>
      <div class="footer-col"><h3>Liên hệ</h3><ul class="footer-contact">
        <li>${icon("pin")}<span>${CONTACT.address}</span></li>
        <li>${icon("phone")}<a href="tel:${CONTACT.hotlineTel}">${CONTACT.hotline}</a></li>
        <li>${icon("mail")}<a href="mailto:${CONTACT.email}">${CONTACT.email}</a></li>
        <li>${icon("clock")}<span>${CONTACT.hours}</span></li>
      </ul></div>
    </div>
    <div class="footer-bottom"><span>© ${new Date().getFullYear()} Sách Chuyền Tay. Mỗi cuốn sách, thêm một hành trình.</span>
      <div class="payments" aria-label="Phương thức thanh toán"><span>COD</span><span>VISA</span><span>MOMO</span><span>VNPAY</span></div>
    </div>
  </div></footer>`;
}

function replace(id: string, content: SafeHtml) {
  const el = document.getElementById(id);
  if (el) el.outerHTML = content.value;
}

export function renderSiteChrome(page: string | undefined): void {
  replace("site-header", headerHtml(page));
  replace("site-footer", footerHtml());

  // Danh sách thể loại ở footer tải bất đồng bộ; lỗi thì giữ link "Tất cả sách".
  catalogService
    .categories()
    .then((cats) => {
      mount(
        document.querySelector("[data-footer-categories]"),
        cats.slice(0, 5).map((c) => html`<li><a href="shop.html?cat=${c.id}">${c.name}</a></li>`)
      );
    })
    .catch(() => undefined);
}
