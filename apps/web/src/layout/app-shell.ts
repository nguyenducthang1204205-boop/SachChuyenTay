import { html } from "../lib/html.js";
import { catalogService } from "../services/catalog.service.js";
import { cartStore, type AddResult } from "../stores/cart.store.js";
import { wishlistStore } from "../stores/wishlist.store.js";
import { hydrateIcons } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { renderCartDrawer } from "./cart-drawer.js";
import { closeOverlay, openOverlay } from "./overlay.js";
import { renderSiteChrome } from "./site-chrome.js";

/**
 * Khung ứng dụng dùng chung: dựng header/footer, gắn các hành vi toàn cục
 * (thêm giỏ, yêu thích, mở giỏ/menu) bằng event delegation qua thuộc tính data-*.
 * Mỗi trang chỉ cần gọi `initAppShell()` rồi lo phần nội dung của riêng mình.
 */

const $ = (id: string) => document.getElementById(id);

function updateCounts(bump: boolean) {
  const cartCount = cartStore.count();
  document.querySelectorAll<HTMLElement>("[data-cart-count]").forEach((el) => {
    el.textContent = String(cartCount);
    el.classList.toggle("is-on", cartCount > 0);
    if (bump) {
      el.classList.remove("bump");
      void el.offsetWidth; // restart animation
      el.classList.add("bump");
    }
  });
  const wishCount = wishlistStore.count();
  document.querySelectorAll<HTMLElement>("[data-wish-count]").forEach((el) => {
    el.textContent = String(wishCount);
    el.classList.toggle("is-on", wishCount > 0);
  });
}

function notifyAdd(result: AddResult, title: string, stock: number) {
  if (result.ok) {
    toast(html`Đã thêm “${title}” vào giỏ`, { action: html`<a href="#" data-open-cart>Xem giỏ</a>` });
  } else if (result.reason === "max") {
    toast(`Cuốn này chỉ còn ${stock} bản — bạn đã chọn đủ rồi.`, { type: "warn" });
  } else {
    toast("Rất tiếc, cuốn sách này đã được chuyền tay.", { type: "warn" });
  }
}

function handleClick(e: MouseEvent) {
  const target = e.target as Element;

  const add = target.closest<HTMLElement>("[data-add-cart]");
  if (add) {
    e.preventDefault();
    const book = catalogService.known(Number(add.dataset.addCart));
    if (!book) return toast("Không tìm thấy thông tin sách, vui lòng tải lại trang.", { type: "warn" });
    const result = cartStore.add(book, Number(add.dataset.qty ?? 1));
    notifyAdd(result, book.title, book.stock);
    if (add.dataset.goCheckout && (result.ok || result.reason === "max")) location.href = "cart.html";
    return;
  }

  const wish = target.closest<HTMLElement>("[data-wish]");
  if (wish) {
    e.preventDefault();
    const id = Number(wish.dataset.wish);
    const added = wishlistStore.toggle(id);
    document.querySelectorAll(`[data-wish="${id}"]`).forEach((el) => el.setAttribute("aria-pressed", String(added)));
    toast(added ? "Đã lưu vào danh sách yêu thích" : "Đã bỏ khỏi danh sách yêu thích");
    return;
  }

  const openCart = target.closest<HTMLElement>("[data-open-cart]");
  if (openCart) {
    e.preventDefault();
    closeOverlay($("mobile-nav"));
    renderCartDrawer();
    openOverlay($("cart-drawer"), openCart);
    return;
  }
  if (target.closest("[data-close-cart]")) return closeOverlay($("cart-drawer"));

  const openMenu = target.closest<HTMLElement>("[data-open-menu]");
  if (openMenu) {
    openMenu.setAttribute("aria-expanded", "true");
    openOverlay($("mobile-nav"), openMenu);
    return;
  }
  if (target.closest("[data-close-menu]") || target.closest(".mobile-nav nav a")) {
    closeOverlay($("mobile-nav"));
    document.querySelector("[data-open-menu]")?.setAttribute("aria-expanded", "false");
    return;
  }

  // Nút trong giỏ trượt
  const qty = target.closest<HTMLElement>(".drawer [data-qty]");
  if (qty) {
    const id = Number(qty.dataset.qty);
    const line = cartStore.get(id);
    if (line) cartStore.setQuantity(id, line.quantity + Number(qty.dataset.delta));
    return;
  }
  const remove = target.closest<HTMLElement>(".drawer [data-remove]");
  if (remove) cartStore.remove(Number(remove.dataset.remove));
}

/** Hiệu ứng hiện dần khi cuộn tới (.reveal → .is-visible). Gọi lại sau khi render nội dung động. */
export function observeReveal(root: ParentNode = document): void {
  const els = root.querySelectorAll(".reveal:not(.is-visible)");
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add("is-visible");
          io.unobserve(en.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );
  els.forEach((el) => io.observe(el));
}

export function initAppShell(): void {
  renderSiteChrome(document.body.dataset.page);
  hydrateIcons();

  document.addEventListener("click", handleClick);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeOverlay($("cart-drawer"));
      closeOverlay($("mobile-nav"));
    }
  });

  cartStore.subscribe(() => {
    updateCounts(true);
    renderCartDrawer();
  });
  wishlistStore.subscribe(() => updateCounts(false));

  const header = $("header");
  if (header) {
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  updateCounts(false);
  observeReveal();
}
