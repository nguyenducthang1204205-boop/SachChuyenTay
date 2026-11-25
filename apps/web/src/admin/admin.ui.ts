import type { BuybackStatus, OrderStatus, PageMeta } from "@sct/shared";
import { BUYBACK_STATUS_LABELS, ORDER_STATUS_LABELS } from "@sct/shared";
import { ApiError } from "../api/http.js";
import { html, type HtmlValue, type SafeHtml } from "../lib/html.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";

/** Các mảnh giao diện dùng chung cho mọi màn hình quản trị. */

const dateFmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export function pageHead(title: string, sub?: HtmlValue, actions?: HtmlValue): SafeHtml {
  return html`<div class="adm-head">
    <div><h1>${title}</h1>${sub ? html`<p>${sub}</p>` : null}</div>
    ${actions ? html`<div class="adm-head__actions">${actions}</div>` : null}
  </div>`;
}

type Tone = "green" | "gold" | "blue" | "orange" | "red" | "muted";
export const pill = (label: string, tone: Tone) => html`<span class="pill pill--${tone}">${label}</span>`;

const ORDER_TONE: Record<OrderStatus, Tone> = {
  pending: "orange",
  confirmed: "blue",
  shipping: "gold",
  completed: "green",
  cancelled: "muted"
};
export const orderPill = (s: OrderStatus) => pill(ORDER_STATUS_LABELS[s], ORDER_TONE[s]);

const BUYBACK_TONE: Record<BuybackStatus, Tone> = {
  new: "orange",
  contacted: "blue",
  completed: "green",
  rejected: "muted"
};
export const buybackPill = (s: BuybackStatus) => pill(BUYBACK_STATUS_LABELS[s], BUYBACK_TONE[s]);

/** Thanh phân trang; nút mang data-goto-page để view bắt sự kiện. */
export function pager(meta: PageMeta): SafeHtml {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return html`<div class="adm-pager">
    <span>Hiển thị ${from}–${to} / ${meta.total}</span>
    <div class="adm-pager__btns">
      <button class="btn btn--ghost btn--sm" type="button" data-goto-page="${meta.page - 1}" ${meta.page <= 1 ? "disabled" : ""}>← Trước</button>
      <button class="btn btn--ghost btn--sm" type="button" data-goto-page="${meta.page + 1}" ${meta.page >= meta.totalPages ? "disabled" : ""}>Sau →</button>
    </div>
  </div>`;
}

export const tableEmpty = (cols: number, text: string) =>
  html`<tr><td colspan="${cols}" class="adm-empty">${text}</td></tr>`;

export const tableLoading = (cols: number) => html`<tr><td colspan="${cols}" class="adm-empty">Đang tải…</td></tr>`;

/** Mở <dialog> với nội dung cho trước. Trả về phần tử để gắn sự kiện; tự huỷ khi đóng. */
export function openDialog(content: SafeHtml, { small = false } = {}): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = `adm-dialog${small ? " adm-dialog--sm" : ""}`;
  dialog.innerHTML = content.value;
  document.body.appendChild(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || (e.target as Element).closest("[data-close-dialog]")) dialog.close();
  });
  dialog.showModal();
  return dialog;
}

export const dialogHead = (title: HtmlValue) =>
  html`<div class="adm-dialog__head"><h2>${title}</h2>
    <button class="adm-icon-btn" type="button" data-close-dialog aria-label="Đóng">${icon("x")}</button></div>`;

/** Hộp thoại xác nhận (thay window.confirm) — trả về true nếu người dùng đồng ý. */
export function confirmDialog(o: { title: string; message: HtmlValue; confirmText?: string; danger?: boolean }) {
  return new Promise<boolean>((resolve) => {
    const dialog = openDialog(
      html`${dialogHead(o.title)}
        <div class="adm-dialog__body"><p>${o.message}</p></div>
        <div class="adm-dialog__foot">
          <button class="btn btn--ghost" type="button" data-close-dialog>Huỷ</button>
          <button class="btn ${o.danger ? "btn--danger" : ""}" type="button" data-confirm>${o.confirmText ?? "Đồng ý"}</button>
        </div>`,
      { small: true }
    );
    let ok = false;
    dialog.querySelector("[data-confirm]")?.addEventListener("click", () => {
      ok = true;
      dialog.close();
    });
    dialog.addEventListener("close", () => resolve(ok));
  });
}

/** Hiển thị lỗi API dạng toast (dùng cho thao tác ghi). */
export function toastError(err: unknown, fallback = "Thao tác chưa thành công, vui lòng thử lại.") {
  toast(err instanceof ApiError ? err.message : fallback, { type: "warn", duration: 5000 });
}

/** View phát sự kiện này sau khi ghi dữ liệu → sidebar cập nhật số đếm. */
export const DATA_CHANGED = "admin:data-changed";
export const notifyDataChanged = () => window.dispatchEvent(new Event(DATA_CHANGED));

/** Đọc / ghi tham số trên hash: #/books?page=2&q=abc */
export function hashQuery(): URLSearchParams {
  return new URLSearchParams(location.hash.split("?")[1] ?? "");
}

export function setHashQuery(params: Record<string, string | number | undefined | null>) {
  const [path] = location.hash.split("?");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const qs = q.toString();
  history.replaceState(null, "", `${path}${qs ? `?${qs}` : ""}`);
}
