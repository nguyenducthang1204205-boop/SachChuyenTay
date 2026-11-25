import { html, type SafeHtml } from "../lib/html.js";
import { icon } from "./icons.js";

export interface ToastOptions {
  type?: "success" | "warn";
  /** HTML của nút hành động (ví dụ link "Xem giỏ"). */
  action?: SafeHtml;
  duration?: number;
}

let wrap: HTMLElement | null = null;

function container(): HTMLElement {
  if (wrap?.isConnected) return wrap;
  wrap = document.createElement("div");
  wrap.className = "toast-wrap";
  wrap.setAttribute("role", "status");
  wrap.setAttribute("aria-live", "polite");
  document.body.appendChild(wrap);
  return wrap;
}

/** Thông báo ngắn. `message` là chuỗi (tự escape) hoặc SafeHtml khi cần định dạng. */
export function toast(
  message: string | SafeHtml,
  { type = "success", action, duration = 3200 }: ToastOptions = {}
): void {
  const el = document.createElement("div");
  el.className = `toast${type === "warn" ? " toast--warn" : ""}`;
  el.innerHTML = html`${icon(type === "warn" ? "alert" : "check")}<span>${message}</span>${action}`.value;
  container().appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 300);
  }, duration);
}
