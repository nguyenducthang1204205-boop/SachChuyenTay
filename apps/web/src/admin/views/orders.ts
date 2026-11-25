import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  PAYMENT_METHOD_LABELS,
  type AdminOrderDetail,
  type OrderStatus
} from "@sct/shared";
import { isAbort } from "../../api/http.js";
import { debounce } from "../../lib/dom.js";
import { formatVnd } from "../../lib/format.js";
import { html, mount } from "../../lib/html.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { adminApi } from "../admin.api.js";
import {
  confirmDialog,
  dialogHead,
  formatDate,
  hashQuery,
  notifyDataChanged,
  openDialog,
  orderPill,
  pageHead,
  pager,
  setHashQuery,
  tableEmpty,
  tableLoading,
  toastError
} from "../admin.ui.js";
import { orderRow } from "./dashboard.js";

const ACTION_LABEL: Record<OrderStatus, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Xác nhận đơn",
  shipping: "Bắt đầu giao",
  completed: "Đã giao xong",
  cancelled: "Huỷ đơn"
};

function detailView(o: AdminOrderDetail) {
  const next = ORDER_TRANSITIONS[o.status];
  return html`${dialogHead(html`Đơn ${o.code} ${orderPill(o.status)}`)}
    <div class="adm-dialog__body">
      <dl class="adm-dl">
        <dt>Khách hàng</dt><dd><strong>${o.customerName}</strong></dd>
        <dt>Điện thoại</dt><dd><a href="tel:${o.phone}">${o.phone}</a></dd>
        ${o.email ? html`<dt>Email</dt><dd>${o.email}</dd>` : null}
        <dt>Địa chỉ</dt><dd>${o.address}</dd>
        ${o.note ? html`<dt>Ghi chú</dt><dd>${o.note}</dd>` : null}
        <dt>Thanh toán</dt><dd>${PAYMENT_METHOD_LABELS[o.paymentMethod]}</dd>
        <dt>Đặt lúc</dt><dd>${formatDate(o.createdAt)} <span class="adm-help">· cập nhật ${formatDate(o.updatedAt)}</span></dd>
      </dl>
      <div class="adm-lines">
        ${o.items.map(
          (i) =>
            html`<div><span><a href="#/books/${i.bookId}">${i.title}</a> <span class="adm-help">× ${i.quantity}</span></span><span>${formatVnd(i.lineTotal)}</span></div>`
        )}
        <div><span>Tạm tính</span><span>${formatVnd(o.totals.subtotal)}</span></div>
        ${o.totals.discount ? html`<div><span>Giảm giá${o.coupon ? ` (${o.coupon.code})` : ""}</span><span>−${formatVnd(o.totals.discount)}</span></div>` : null}
        <div><span>Phí giao hàng</span><span>${o.totals.shippingFee ? formatVnd(o.totals.shippingFee) : "Miễn phí"}</span></div>
        <div class="total"><span>Tổng cộng</span><span>${formatVnd(o.totals.total)}</span></div>
      </div>
    </div>
    <div class="adm-dialog__foot">
      ${
        next.length
          ? next.map(
              (s) =>
                html`<button class="btn ${s === "cancelled" ? "btn--danger" : ""} btn--sm" type="button" data-status="${s}">${ACTION_LABEL[s]}</button>`
            )
          : html`<span class="adm-help" style="margin-right:auto">Đơn đã ở trạng thái cuối, không thể thay đổi.</span>`
      }
      <button class="btn btn--ghost btn--sm" type="button" data-close-dialog>Đóng</button>
    </div>`;
}

export async function ordersView(root: HTMLElement) {
  document.title = "Đơn hàng — Quản trị";
  const q = hashQuery();
  const state = {
    q: q.get("q") ?? "",
    status: (q.get("status") as OrderStatus | null) ?? undefined,
    page: Number(q.get("page")) || 1
  };
  let controller: AbortController | null = null;

  mount(
    root,
    html`${pageHead("Đơn hàng", "Xác nhận, theo dõi giao hàng và huỷ đơn (tự hoàn tồn kho).")}
    <div class="adm-toolbar">
      <label class="adm-search">${icon("search")}<span class="visually-hidden">Tìm đơn</span>
        <input class="input" type="search" name="q" placeholder="Mã đơn, tên khách hoặc số điện thoại…" value="${state.q}" /></label>
      <select class="select" name="status" aria-label="Trạng thái">
        <option value="">Mọi trạng thái</option>
        ${ORDER_STATUSES.map((s) => html`<option value="${s}" ${s === state.status ? "selected" : ""}>${ORDER_STATUS_LABELS[s]}</option>`)}
      </select>
    </div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th class="num">Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
      <tbody data-rows>${tableLoading(6)}</tbody>
    </table></div>
    <div data-pager></div>`
  );
  const tbody = root.querySelector<HTMLElement>("[data-rows]")!;
  const pagerEl = root.querySelector<HTMLElement>("[data-pager]")!;

  async function load() {
    controller?.abort();
    const current = (controller = new AbortController());
    setHashQuery({ q: state.q, status: state.status, page: state.page > 1 ? state.page : undefined });
    try {
      const res = await adminApi.orders.list({ ...state, q: state.q || undefined, pageSize: 20 }, current.signal);
      mount(tbody, res.data.length ? res.data.map(orderRow) : tableEmpty(6, "Không có đơn hàng nào."));
      mount(pagerEl, pager(res.meta));
    } catch (err) {
      if (!isAbort(err)) toastError(err, "Không tải được danh sách đơn.");
    }
  }

  async function openOrder(id: number) {
    let order: AdminOrderDetail;
    try {
      order = await adminApi.orders.get(id);
    } catch (err) {
      return toastError(err);
    }
    const dialog = openDialog(detailView(order));
    dialog.addEventListener("click", async (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>("[data-status]");
      if (!btn) return;
      const next = btn.dataset.status as OrderStatus;
      if (next === "cancelled") {
        const ok = await confirmDialog({
          title: `Huỷ đơn ${order.code}?`,
          message: "Số lượng sách trong đơn sẽ được cộng lại vào tồn kho. Không thể mở lại đơn đã huỷ.",
          confirmText: "Huỷ đơn",
          danger: true
        });
        if (!ok) return;
      }
      btn.disabled = true;
      try {
        order = await adminApi.orders.setStatus(order.id, next);
        toast(`Đơn ${order.code}: ${ORDER_STATUS_LABELS[order.status]}`);
        dialog.innerHTML = detailView(order).value;
        notifyDataChanged();
        void load();
      } catch (err) {
        btn.disabled = false;
        toastError(err);
      }
    });
  }

  const reloadDebounced = debounce(() => {
    state.page = 1;
    void load();
  }, 300);

  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "q") {
      state.q = t.value.trim();
      reloadDebounced();
    }
  });
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.name !== "status") return;
    state.status = (t.value || undefined) as OrderStatus | undefined;
    state.page = 1;
    void load();
  });
  root.addEventListener("click", (e) => {
    const target = e.target as Element;
    const pageBtn = target.closest<HTMLElement>("[data-goto-page]");
    if (pageBtn) {
      state.page = Number(pageBtn.dataset.gotoPage);
      return void load();
    }
    const row = target.closest<HTMLElement>("[data-row-link]");
    const id = row?.dataset.rowLink?.match(/open=(\d+)/)?.[1];
    if (id) void openOrder(Number(id));
  });

  await load();
  const open = Number(q.get("open"));
  if (open) void openOrder(open);
}
