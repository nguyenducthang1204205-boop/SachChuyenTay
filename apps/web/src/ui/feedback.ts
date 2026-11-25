import { ApiError } from "../api/http.js";
import { html, type HtmlValue, type SafeHtml } from "../lib/html.js";
import { icon, type IconName } from "./icons.js";

/* ---------- Loading skeletons ---------- */

const skeletonCard = html`<div class="book-card book-card--skeleton" aria-hidden="true">
  <div class="book-card__media"><div class="skeleton skeleton--cover"></div></div>
  <div class="book-card__body">
    <div class="skeleton skeleton--line skeleton--short"></div>
    <div class="skeleton skeleton--title"></div>
    <div class="skeleton skeleton--line skeleton--short"></div>
  </div>
</div>`;

export const skeletonCards = (count: number): SafeHtml[] => Array.from({ length: count }, () => skeletonCard);

/* ---------- Empty / error ---------- */

interface StateOptions {
  icon: IconName;
  title: string;
  message?: HtmlValue;
  action?: HtmlValue;
  className?: string;
  style?: string;
}

export function emptyState(o: StateOptions): SafeHtml {
  return html`<div class="empty-state ${o.className ?? ""}" style="${o.style ?? ""}">
    <div class="empty-state__icon">${icon(o.icon)}</div>
    <h3>${o.title}</h3>
    ${o.message ? html`<p>${o.message}</p>` : null}
    ${o.action}
  </div>`;
}

/** Trạng thái lỗi có nút "Thử lại" (gắn sự kiện qua `data-retry`). */
export function errorState(err: unknown, style = "grid-column:1/-1"): SafeHtml {
  const message = err instanceof ApiError ? err.message : "Đã có lỗi không mong muốn. Vui lòng thử lại.";
  return emptyState({
    icon: "alert",
    title: "Chưa tải được dữ liệu",
    message,
    className: "error-state",
    style,
    action: html`<button class="btn btn--ghost" type="button" data-retry>${icon("refresh")} Thử lại</button>`
  });
}

/** Gắn hành vi "Thử lại" cho vùng chứa trạng thái lỗi. */
export function onRetry(container: HTMLElement, retry: () => void): void {
  container.addEventListener("click", (e) => {
    if ((e.target as Element).closest("[data-retry]")) retry();
  });
}
