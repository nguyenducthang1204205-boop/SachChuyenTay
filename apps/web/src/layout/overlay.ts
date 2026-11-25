/** Mở/đóng lớp phủ (menu di động, giỏ trượt) — khoá cuộn trang và trả lại focus cho phần tử kích hoạt. */

let lastFocus: HTMLElement | null = null;

export function openOverlay(el: HTMLElement | null, trigger?: HTMLElement | null): void {
  if (!el) return;
  lastFocus = trigger ?? (document.activeElement as HTMLElement | null);
  el.classList.add("is-open");
  el.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  const focusable = el.querySelector<HTMLElement>("[data-close-cart],[data-close-menu],button,a,input");
  if (focusable) setTimeout(() => focusable.focus(), 50);
}

export function closeOverlay(el: HTMLElement | null): void {
  if (!el?.classList.contains("is-open")) return;
  el.classList.remove("is-open");
  el.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  lastFocus?.focus?.();
}
