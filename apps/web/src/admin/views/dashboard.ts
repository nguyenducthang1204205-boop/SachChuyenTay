import { ORDER_STATUSES, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, type AdminOrderSummary } from "@sct/shared";
import { formatNumber, formatVnd } from "../../lib/format.js";
import { html, mount } from "../../lib/html.js";
import { icon, type IconName } from "../../ui/icons.js";
import { adminApi } from "../admin.api.js";
import { formatDate, orderPill, pageHead, tableEmpty } from "../admin.ui.js";

const stat = (label: string, value: string, iconName: IconName, note?: string, alert = false) =>
  html`<div class="adm-card adm-stat${alert ? " adm-stat--alert" : ""}">
    <span class="adm-stat__label">${icon(iconName)}${label}</span>
    <strong>${value}</strong>${note ? html`<small>${note}</small>` : null}
  </div>`;

export const orderRow = (o: AdminOrderSummary) =>
  html`<tr data-row-link="#/orders?open=${o.id}">
    <td><span class="title">${o.code}</span></td>
    <td>${o.customerName}<div class="muted">${o.phone}</div></td>
    <td class="num">${formatVnd(o.total)}</td>
    <td>${PAYMENT_METHOD_LABELS[o.paymentMethod]}</td>
    <td>${orderPill(o.status)}</td>
    <td class="muted">${formatDate(o.createdAt)}</td>
  </tr>`;

export async function dashboardView(root: HTMLElement) {
  document.title = "Tổng quan — Quản trị";
  mount(
    root,
    html`${pageHead("Tổng quan", "Tình hình cửa hàng hôm nay.")}<div class="adm-card adm-empty">Đang tải…</div>`
  );
  const s = await adminApi.dashboard();

  mount(
    root,
    html`${pageHead(
      "Tổng quan",
      "Tình hình cửa hàng hôm nay.",
      html`<a class="btn btn--sm" href="#/books/new">${icon("plus")} Thêm sách</a>`
    )}
    <div class="adm-stats">
      ${stat("Đơn chờ xác nhận", formatNumber(s.orders.pending), "package", `${s.orders.today} đơn mới hôm nay`, s.orders.pending > 0)}
      ${stat("Doanh thu 30 ngày", formatVnd(s.orders.revenue30d), "wallet", "Không tính đơn đã huỷ")}
      ${stat("Sách đang bán", formatNumber(s.books.published), "book", `${s.books.hidden} đang ẩn · ${s.books.outOfStock} hết hàng`)}
      ${stat("Yêu cầu thu mua mới", formatNumber(s.buyback.new), "recycle", `${s.newsletter.subscribers} người nhận bản tin`, s.buyback.new > 0)}
    </div>
    <div class="adm-grid-2">
      <section>
        <div class="adm-head" style="margin-bottom:12px"><h2 class="adm-section-title" style="margin:0">Đơn hàng gần đây</h2>
          <a class="link-arrow" href="#/orders">Tất cả đơn ${icon("arrow")}</a></div>
        <div class="adm-table-wrap"><table class="adm-table">
          <thead><tr><th>Mã đơn</th><th>Khách hàng</th><th class="num">Tổng</th><th>Thanh toán</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
          <tbody>${s.recentOrders.length ? s.recentOrders.map(orderRow) : tableEmpty(6, "Chưa có đơn hàng nào.")}</tbody>
        </table></div>
      </section>
      <section class="adm-card">
        <h2>Đơn theo trạng thái</h2>
        <div class="adm-lines" style="margin-top:0;border-top:0">
          ${ORDER_STATUSES.map(
            (st) =>
              html`<div><a href="#/orders?status=${st}">${orderPill(st)}</a><strong>${s.orders.byStatus[st]}</strong></div>`
          )}
        </div>
        <p class="adm-help" style="margin-top:12px">${ORDER_STATUS_LABELS.pending}: cần gọi xác nhận với khách sớm nhất có thể.</p>
      </section>
    </div>`
  );

  root.addEventListener("click", (e) => {
    const row = (e.target as Element).closest<HTMLElement>("[data-row-link]");
    if (row?.dataset.rowLink) location.hash = row.dataset.rowLink;
  });
}
