import { categoryInputSchema, type AdminCategory, type CategoryInput } from "@sct/shared";
import { ApiError } from "../../api/http.js";
import { html, mount } from "../../lib/html.js";
import { setFieldError } from "../../ui/forms.js";
import { icon, type IconName } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { adminApi } from "../admin.api.js";
import { confirmDialog, notifyDataChanged, pageHead, tableEmpty, toastError } from "../admin.ui.js";

const ICON_CHOICES: IconName[] = [
  "feather",
  "globe",
  "sparkles",
  "trending",
  "smile",
  "compass",
  "code",
  "book",
  "leaf",
  "heart",
  "star",
  "users",
  "tag",
  "camera"
];

const blank = (): CategoryInput => ({
  id: "",
  name: "",
  icon: "book",
  colors: { bg: "#efe4d1", fg: "#2f5d50" },
  sortOrder: 0
});

/** Gợi ý mã từ tên: "Triết học" → "triet-hoc". */
const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export async function categoriesView(root: HTMLElement) {
  document.title = "Thể loại — Quản trị";
  let categories: AdminCategory[] = [];
  let editing: AdminCategory | null = null;

  mount(
    root,
    html`${pageHead("Thể loại", "Các kệ sách hiển thị trên trang chủ, bộ lọc cửa hàng và footer.")}
    <div class="adm-grid-2">
      <div class="adm-table-wrap"><table class="adm-table">
        <thead><tr><th>Thể loại</th><th>Mã</th><th class="num">Đang bán</th><th class="num">Tổng sách</th><th class="num">Thứ tự</th><th></th></tr></thead>
        <tbody data-rows><tr><td colspan="6" class="adm-empty">Đang tải…</td></tr></tbody>
      </table></div>
      <section class="adm-card" data-form-wrap></section>
    </div>`
  );
  const tbody = root.querySelector<HTMLElement>("[data-rows]")!;
  const formWrap = root.querySelector<HTMLElement>("[data-form-wrap]")!;

  function renderRows() {
    mount(
      tbody,
      categories.length
        ? categories.map(
            (c) => html`<tr>
              <td><div class="adm-book-cell" style="min-width:0">
                <span class="cat-card__icon" style="--cat-bg:${c.colors.bg};--cat-fg:${c.colors.fg};width:38px;height:38px">${icon(c.icon)}</span>
                <span class="title">${c.name}</span></div></td>
              <td class="muted">${c.id}</td>
              <td class="num">${c.bookCount}</td>
              <td class="num">${c.totalBooks}</td>
              <td class="num">${c.sortOrder}</td>
              <td><div class="adm-actions">
                <button class="adm-icon-btn" type="button" data-edit="${c.id}" title="Sửa">${icon("edit")}</button>
                <button class="adm-icon-btn adm-icon-btn--danger" type="button" data-delete="${c.id}" title="Xoá">${icon("trash")}</button>
              </div></td>
            </tr>`
          )
        : tableEmpty(6, "Chưa có thể loại nào.")
    );
  }

  function renderForm() {
    const v: CategoryInput = editing
      ? {
          id: editing.id,
          name: editing.name,
          icon: editing.icon,
          colors: { ...editing.colors },
          sortOrder: editing.sortOrder
        }
      : blank();
    mount(
      formWrap,
      html`<h2>${editing ? `Sửa “${editing.name}”` : "Thêm thể loại"}</h2>
      <form id="cat-form" novalidate style="display:grid;gap:14px">
        <div class="field"><label for="c-name">Tên thể loại</label>
          <input class="input" id="c-name" name="name" value="${v.name}" /><span class="error"></span></div>
        <div class="field"><label for="c-id">Mã (dùng trên URL)</label>
          <input class="input" id="c-id" name="id" value="${v.id}" ${editing ? "readonly" : ""} placeholder="vd: triet-hoc" />
          <span class="hint">${editing ? "Không đổi được mã sau khi tạo." : "Tự gợi ý theo tên; chữ thường, không dấu."}</span><span class="error"></span></div>
        <div class="form-grid">
          <div class="field"><label for="c-icon">Biểu tượng</label>
            <select class="select" id="c-icon" name="icon">${ICON_CHOICES.map((i) => html`<option value="${i}" ${i === v.icon ? "selected" : ""}>${i}</option>`)}</select></div>
          <div class="field"><label for="c-order">Thứ tự</label>
            <input class="input" id="c-order" name="sortOrder" type="number" min="0" value="${v.sortOrder}" /><span class="error"></span></div>
          <div class="field"><label>Màu nền</label><div class="adm-color"><input type="color" name="colors.bg" value="${v.colors.bg}" /></div></div>
          <div class="field"><label>Màu biểu tượng</label><div class="adm-color"><input type="color" name="colors.fg" value="${v.colors.fg}" /></div></div>
        </div>
        <div data-preview></div>
        <div class="adm-sticky-actions">
          ${editing ? html`<button class="btn btn--ghost" type="button" data-cancel>Huỷ</button>` : null}
          <button class="btn" type="submit">${icon("check")} ${editing ? "Lưu" : "Thêm thể loại"}</button>
        </div>
      </form>`
    );
    preview();
  }

  const form = () => formWrap.querySelector<HTMLFormElement>("#cat-form")!;
  const val = (name: string) => form().querySelector<HTMLInputElement>(`[name="${CSS.escape(name)}"]`)!.value;

  function read(): CategoryInput {
    return {
      id: val("id").trim(),
      name: val("name").trim(),
      icon: val("icon"),
      colors: { bg: val("colors.bg"), fg: val("colors.fg") },
      sortOrder: Number(val("sortOrder") || 0)
    };
  }

  function preview() {
    const v = read();
    mount(
      formWrap.querySelector("[data-preview]"),
      html`<div class="cat-card" style="--cat-bg:${v.colors.bg};--cat-fg:${v.colors.fg};pointer-events:none">
        <span class="cat-card__icon">${icon(v.icon ?? "book")}</span><strong>${v.name || "Tên thể loại"}</strong><span>Xem trước</span></div>`
    );
  }

  async function load() {
    categories = (await adminApi.categories.list()).data;
    renderRows();
  }

  formWrap.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "name" && !editing) form().querySelector<HTMLInputElement>('[name="id"]')!.value = slugify(t.value);
    if (t.name) setFieldError(t, null);
    preview();
  });
  formWrap.addEventListener("change", preview);

  formWrap.addEventListener("click", (e) => {
    if ((e.target as Element).closest("[data-cancel]")) {
      editing = null;
      renderForm();
    }
  });

  formWrap.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = read();
    const parsed = categoryInputSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const el = form().querySelector<HTMLInputElement>(`[name="${CSS.escape(issue.path.join("."))}"]`);
        if (el) setFieldError(el, issue.message);
      }
      return;
    }
    try {
      const { id, ...rest } = payload;
      categories = (editing ? await adminApi.categories.update(id, rest) : await adminApi.categories.create(payload))
        .data;
      toast(editing ? `Đã lưu thể loại “${payload.name}”` : `Đã thêm thể loại “${payload.name}”`);
      editing = null;
      notifyDataChanged();
      renderRows();
      renderForm();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409)
        setFieldError(form().querySelector('[name="id"]')!, err.message);
      else toastError(err);
    }
  });

  tbody.addEventListener("click", async (e) => {
    const target = e.target as Element;
    const edit = target.closest<HTMLElement>("[data-edit]");
    if (edit) {
      editing = categories.find((c) => c.id === edit.dataset.edit) ?? null;
      renderForm();
      formWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const del = target.closest<HTMLElement>("[data-delete]");
    if (del) {
      const cat = categories.find((c) => c.id === del.dataset.delete);
      if (!cat) return;
      const ok = await confirmDialog({
        title: "Xoá thể loại?",
        message: html`Xoá thể loại <strong>“${cat.name}”</strong>. Chỉ xoá được khi thể loại không còn cuốn sách nào.`,
        confirmText: "Xoá",
        danger: true
      });
      if (!ok) return;
      try {
        await adminApi.categories.remove(cat.id);
        toast(`Đã xoá thể loại “${cat.name}”`);
        if (editing?.id === cat.id) editing = null;
        await load();
        renderForm();
      } catch (err) {
        toastError(err);
      }
    }
  });

  renderForm();
  await load();
}
