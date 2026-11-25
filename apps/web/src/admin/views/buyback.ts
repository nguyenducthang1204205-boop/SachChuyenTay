import {
  BUYBACK_CITIES,
  BUYBACK_METHODS,
  BUYBACK_STATUSES,
  BUYBACK_STATUS_LABELS,
  type AdminBuybackRequest,
  type BuybackStatus
} from "@sct/shared";
import { html, mount } from "../../lib/html.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { adminApi } from "../admin.api.js";
import {
  dialogHead,
  formatDate,
  hashQuery,
  notifyDataChanged,
  openDialog,
  pageHead,
  pager,
  setHashQuery,
  tableEmpty,
  tableLoading,
  toastError
} from "../admin.ui.js";

const cityLabel = (id: string) => BUYBACK_CITIES.find((c) => c.id === id)?.label ?? id;
const methodLabel = (id: string) => BUYBACK_METHODS.find((m) => m.id === id)?.label ?? id;

const statusSelect = (r: AdminBuybackRequest) =>
  html`<select class="select" data-status-for="${r.id}" aria-label="Trạng thái" style="min-height:36px;padding:4px 36px 4px 12px;font-size:14px">
    ${BUYBACK_STATUSES.map((s) => html`<option value="${s}" ${s === r.status ? "selected" : ""}>${BUYBACK_STATUS_LABELS[s]}</option>`)}
  </select>`;

export async function buybackView(root: HTMLElement) {
  document.title = "Thu mua sách — Quản trị";
  const q = hashQuery();
  const state = { status: (q.get("status") as BuybackStatus | null) ?? undefined, page: Number(q.get("page")) || 1 };
  let rows: AdminBuybackRequest[] = [];

  mount(
    root,
    html`${pageHead("Yêu cầu thu mua", "Khách gửi danh sách sách cũ muốn bán / ký gửi — liên hệ báo giá trong 24 giờ.")}
    <div class="adm-toolbar">
      <select class="select" name="status" aria-label="Trạng thái">
        <option value="">Mọi trạng thái</option>
        ${BUYBACK_STATUSES.map((s) => html`<option value="${s}" ${s === state.status ? "selected" : ""}>${BUYBACK_STATUS_LABELS[s]}</option>`)}
      </select>
    </div>
    <div class="adm-table-wrap"><table class="adm-table">
      <thead><tr><th>Mã</th><th>Người gửi</th><th>Khu vực / Hình thức</th><th class="num">Số cuốn</th><th>Trạng thái</th><th>Gửi lúc</th><th></th></tr></thead>
      <tbody data-rows>${tableLoading(7)}</tbody>
    </table></div>
    <div data-pager></div>`
  );
  const tbody = root.querySelector<HTMLElement>("[data-rows]")!;
  const pagerEl = root.querySelector<HTMLElement>("[data-pager]")!;

  async function load() {
    setHashQuery({ status: state.status, page: state.page > 1 ? state.page : undefined });
    try {
      const res = await adminApi.buyback.list({ ...state, pageSize: 20 });
      rows = res.data;
      mount(
        tbody,
        rows.length
          ? rows.map(
              (r) => html`<tr>
                <td><span class="title">${r.reference}</span></td>
                <td>${r.name}<div class="muted"><a href="tel:${r.phone}">${r.phone}</a></div></td>
                <td>${cityLabel(r.city)}<div class="muted">${methodLabel(r.method)}${r.pickup ? " · nhận tận nơi" : ""}</div></td>
                <td class="num">${r.bookCount}${r.photoKeys.length ? html`<div class="muted">${r.photoKeys.length} ảnh</div>` : null}</td>
                <td>${statusSelect(r)}</td>
                <td class="muted">${formatDate(r.createdAt)}</td>
                <td><div class="adm-actions"><button class="adm-icon-btn" type="button" data-view="${r.id}" title="Xem danh sách sách">${icon("eye")}</button></div></td>
              </tr>`
            )
          : tableEmpty(7, "Chưa có yêu cầu nào.")
      );
      mount(pagerEl, pager(res.meta));
    } catch (err) {
      toastError(err, "Không tải được danh sách yêu cầu.");
    }
  }

  root.addEventListener("change", async (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.name === "status") {
      state.status = (t.value || undefined) as BuybackStatus | undefined;
      state.page = 1;
      return void load();
    }
    const id = Number(t.dataset.statusFor);
    if (!id) return;
    t.disabled = true;
    try {
      const updated = await adminApi.buyback.setStatus(id, t.value as BuybackStatus);
      toast(`${updated.reference}: ${BUYBACK_STATUS_LABELS[updated.status]}`);
      rows = rows.map((r) => (r.id === id ? updated : r));
      notifyDataChanged();
    } catch (err) {
      toastError(err);
    } finally {
      t.disabled = false;
    }
  });

  root.addEventListener("click", (e) => {
    const target = e.target as Element;
    const pageBtn = target.closest<HTMLElement>("[data-goto-page]");
    if (pageBtn) {
      state.page = Number(pageBtn.dataset.gotoPage);
      return void load();
    }
    const view = target.closest<HTMLElement>("[data-view]");
    const r = view && rows.find((x) => x.id === Number(view.dataset.view));
    if (r) {
      openDialog(
        html`${dialogHead(`Yêu cầu ${r.reference}`)}
        <div class="adm-dialog__body">
          <dl class="adm-dl">
            <dt>Người gửi</dt><dd><strong>${r.name}</strong> · <a href="tel:${r.phone}">${r.phone}</a></dd>
            <dt>Khu vực</dt><dd>${cityLabel(r.city)}${r.pickup ? " — muốn nhận sách tận nơi" : ""}</dd>
            <dt>Hình thức</dt><dd>${methodLabel(r.method)}</dd>
            <dt>Gửi lúc</dt><dd>${formatDate(r.createdAt)}</dd>
          </dl>
          <h3 class="adm-section-title" style="margin:18px 0 10px;font-size:17px">Danh sách ${r.bookCount} cuốn</h3>
          <div class="adm-pre">${r.bookList}</div>
          ${
            r.photoKeys.length
              ? html`<h3 class="adm-section-title" style="margin:18px 0 10px;font-size:17px">Ảnh khách gửi (${r.photoKeys.length})</h3>
                <div class="adm-photos">${r.photoKeys.map(
                  (key, i) =>
                    html`<a href="${adminApi.mediaUrl(key)}" target="_blank" rel="noopener" title="Mở ảnh gốc"><img src="${adminApi.mediaUrl(key)}" alt="Ảnh ${i + 1} của yêu cầu ${r.reference}" loading="lazy" /></a>`
                )}</div>`
              : null
          }
        </div>
        <div class="adm-dialog__foot"><button class="btn btn--ghost btn--sm" type="button" data-close-dialog>Đóng</button></div>`
      );
    }
  });

  await load();
}
