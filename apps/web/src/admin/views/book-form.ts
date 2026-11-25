import {
  bookInputSchema,
  COVER_IMAGE_MAX_BYTES,
  COVER_IMAGE_MAX_DIMENSION,
  discountPercent,
  type AdminBook,
  type AdminCategory,
  type BookInput,
  type BookSummary,
  type Condition,
  type ConditionId
} from "@sct/shared";
import { ApiError } from "../../api/http.js";
import { debounce } from "../../lib/dom.js";
import { html, mount, type SafeHtml } from "../../lib/html.js";
import { compressImage, ImageProcessingError } from "../../lib/image.js";
import { bookCard, cover } from "../../ui/book.js";
import { setFieldError } from "../../ui/forms.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { adminApi } from "../admin.api.js";
import { confirmDialog, notifyDataChanged, pageHead, toastError } from "../admin.ui.js";

const PATTERNS = ["Vòng tròn", "Kẻ ngang", "Khung viền", "Sóng tròn"];

const EMPTY: BookInput = {
  title: "",
  author: "",
  publisher: "",
  categoryId: "",
  conditionId: "good",
  price: 0,
  originalPrice: null,
  publishedYear: null,
  pages: null,
  stock: 1,
  rating: 0,
  reviewCount: 0,
  tags: [],
  description: "",
  inspectionNote: "",
  isPublished: true,
  cover: { from: "#2f5d50", to: "#1d3a32", ink: null, pattern: 0, imageUrl: null }
};

const fromBook = (b: AdminBook): BookInput => ({
  title: b.title,
  author: b.author,
  publisher: b.publisher,
  categoryId: b.category.id,
  conditionId: b.condition.id,
  price: b.price,
  originalPrice: b.originalPrice,
  publishedYear: b.publishedYear,
  pages: b.pages,
  stock: b.stock,
  rating: b.rating,
  reviewCount: b.reviewCount,
  tags: b.tags,
  description: b.description,
  inspectionNote: b.inspectionNote,
  isPublished: b.isPublished,
  cover: { ...b.cover }
});

/* ---------- Các ô nhập ---------- */

type Opts = { req?: boolean; type?: string; ph?: string; full?: boolean; hint?: string; min?: number; step?: number };

function input(name: string, label: string, value: string | number | null | undefined, o: Opts = {}): SafeHtml {
  return html`<div class="field${o.full ? " full" : ""}">
    <label for="f-${name}">${label}${o.req ? html` <span style="color:var(--accent)">*</span>` : null}</label>
    <input class="input" id="f-${name}" name="${name}" type="${o.type ?? "text"}" value="${value ?? ""}" placeholder="${o.ph ?? ""}"
      ${o.min !== undefined ? html`min="${o.min}"` : null} ${o.step !== undefined ? html`step="${o.step}"` : null} />
    ${o.hint ? html`<span class="hint">${o.hint}</span>` : null}
    <span class="error"></span>
  </div>`;
}

function textarea(name: string, label: string, value: string, rows = 4, hint?: string): SafeHtml {
  return html`<div class="field full"><label for="f-${name}">${label}</label>
    <textarea class="textarea" id="f-${name}" name="${name}" rows="${rows}">${value}</textarea>
    ${hint ? html`<span class="hint">${hint}</span>` : null}<span class="error"></span></div>`;
}

function select(
  name: string,
  label: string,
  options: Array<{ value: string; label: string }>,
  value: string
): SafeHtml {
  return html`<div class="field"><label for="f-${name}">${label} <span style="color:var(--accent)">*</span></label>
    <select class="select" id="f-${name}" name="${name}">
      ${options.map((o) => html`<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`)}
    </select><span class="error"></span></div>`;
}

function color(name: string, label: string, value: string): SafeHtml {
  return html`<div class="field"><label for="f-${name}">${label}</label>
    <div class="adm-color"><input type="color" value="${value}" data-color-for="${name}" aria-label="${label}" />
      <input class="input" id="f-${name}" name="${name}" value="${value}" maxlength="7" /></div>
    <span class="error"></span></div>`;
}

/* ---------- View ---------- */

export async function bookFormView(root: HTMLElement, params: string[]) {
  const id = params[0] ? Number(params[0]) : null;
  document.title = `${id ? "Sửa sách" : "Thêm sách"} — Quản trị`;
  mount(root, html`<div class="adm-card adm-empty">Đang tải…</div>`);

  const [categories, conditions, book] = await Promise.all([
    adminApi.categories.list().then((r) => r.data),
    adminApi.conditions(),
    id ? adminApi.books.get(id) : Promise.resolve(null)
  ]);
  const initial = book ? fromBook(book) : { ...EMPTY, categoryId: categories[0]?.id ?? "" };

  render(root, { id, book, initial, categories, conditions });
}

interface Ctx {
  id: number | null;
  book: AdminBook | null;
  initial: BookInput;
  categories: AdminCategory[];
  conditions: Condition[];
}

function render(root: HTMLElement, ctx: Ctx) {
  const v = ctx.initial;
  const customInk = !!v.cover.ink;

  mount(
    root,
    html`<a class="adm-back" href="#/books">${icon("arrow")} Danh sách sách</a>
    ${pageHead(
      ctx.book ? ctx.book.title : "Thêm sách mới",
      ctx.book
        ? html`Mã ${ctx.book.sku} · <a href="product.html?id=${ctx.book.id}" target="_blank" rel="noopener">Xem trên cửa hàng ↗</a>`
        : "Điền thông tin sách, bìa sẽ được vẽ tự động theo màu bạn chọn."
    )}
    <form class="adm-form" id="book-form" novalidate>
      <div class="adm-form__main">
        <section class="adm-card">
          <h2 class="adm-section-title">Thông tin sách</h2>
          <div class="form-grid">
            ${input("title", "Tên sách", v.title, { req: true, full: true })}
            ${input("author", "Tác giả", v.author, { req: true })}
            ${input("publisher", "Nhà xuất bản", v.publisher, { req: true })}
            ${select(
              "categoryId",
              "Thể loại",
              ctx.categories.map((c) => ({ value: c.id, label: c.name })),
              v.categoryId
            )}
            ${select(
              "conditionId",
              "Tình trạng",
              ctx.conditions.map((c) => ({ value: c.id, label: `${c.label} (${c.shortLabel})` })),
              v.conditionId
            )}
            ${input("publishedYear", "Năm xuất bản", v.publishedYear, { type: "number", min: 1800 })}
            ${input("pages", "Số trang", v.pages, { type: "number", min: 1 })}
          </div>
        </section>

        <section class="adm-card">
          <h2 class="adm-section-title">Giá & tồn kho</h2>
          <div class="adm-form-grid-3">
            ${input("price", "Giá bán (₫)", v.price, { req: true, type: "number", min: 0, step: 1000 })}
            ${input("originalPrice", "Giá bìa (₫)", v.originalPrice, { type: "number", min: 0, step: 1000, hint: "Bỏ trống nếu là sách hiếm" })}
            ${input("stock", "Tồn kho", v.stock, { req: true, type: "number", min: 0 })}
          </div>
          <label class="toggle" style="margin-top:18px;max-width:360px"><span>Hiển thị trên cửa hàng</span>
            <input type="checkbox" name="isPublished" ${v.isPublished ? "checked" : ""} /></label>
        </section>

        <section class="adm-card">
          <h2 class="adm-section-title">Mô tả</h2>
          <div class="form-grid">
            ${textarea("description", "Giới thiệu", v.description ?? "", 5)}
            ${textarea("inspectionNote", "Ghi chú kiểm định", v.inspectionNote ?? "", 3, "Mô tả trung thực tình trạng thực tế: vết ố, ghi chú, gáy sách…")}
            ${input("tags", "Nhãn", (v.tags ?? []).join(", "), { full: true, ph: "bestseller, rare", hint: "Phân cách bằng dấu phẩy. “rare” = Sách hiếm, “bestseller” = Được yêu thích." })}
            ${input("rating", "Điểm đánh giá (0–5)", v.rating, { type: "number", min: 0, step: 0.1 })}
            ${input("reviewCount", "Số lượt đánh giá", v.reviewCount, { type: "number", min: 0 })}
          </div>
        </section>

        <section class="adm-card">
          <h2 class="adm-section-title">Bìa sách</h2>
          <div class="adm-form-grid-3">
            ${color("cover.from", "Màu chính", v.cover.from)}
            ${color("cover.to", "Màu chuyển", v.cover.to)}
            <div class="field"><label for="f-cover.pattern">Hoạ tiết</label>
              <select class="select" id="f-cover.pattern" name="cover.pattern">
                ${PATTERNS.map((p, i) => html`<option value="${i}" ${i === v.cover.pattern ? "selected" : ""}>${p}</option>`)}
              </select></div>
          </div>
          <div class="form-grid" style="margin-top:16px">
            <div class="field"><label class="check" style="margin-top:28px"><input type="checkbox" name="cover.customInk" ${customInk ? "checked" : ""} /> Màu chữ tuỳ chỉnh (mặc định: trắng)</label></div>
            ${color("cover.ink", "Màu chữ", v.cover.ink ?? "#ffffff")}
            <div class="field full"><label for="f-cover.imageUrl">Ảnh bìa thật (tuỳ chọn)</label>
              <div class="adm-upload">
                <label class="btn btn--ghost btn--sm" data-upload-pick>${icon("camera")} <span data-upload-label>Tải ảnh lên</span>
                  <input type="file" accept="image/*" data-upload-cover hidden /></label>
                <button class="btn btn--ghost btn--sm" type="button" data-clear-cover ${v.cover.imageUrl ? "" : "hidden"}>${icon("trash")} Bỏ ảnh</button>
              </div>
              <input class="input" id="f-cover.imageUrl" name="cover.imageUrl" value="${v.cover.imageUrl ?? ""}" placeholder="Hoặc dán URL ảnh: https://…" />
              <span class="hint">Ảnh được nén ngay trên máy bạn (WEBP, tối đa ${COVER_IMAGE_MAX_DIMENSION}px). Khi có ảnh, ảnh sẽ thay cho bìa vẽ bằng màu.</span>
              <span class="error"></span>
            </div>
          </div>
        </section>
      </div>

      <aside class="adm-form__side">
        <div class="adm-card">
          <div class="adm-preview" data-preview-cover></div>
          <div class="adm-preview-card" data-preview-card style="margin-top:16px"></div>
        </div>
        <div class="adm-sticky-actions">
          <button class="btn" type="submit">${icon("check")} ${ctx.id ? "Lưu thay đổi" : "Thêm sách"}</button>
        </div>
        ${ctx.id ? html`<button class="btn btn--danger btn--block" type="button" data-delete>${icon("trash")} Xoá sách</button>` : null}
      </aside>
    </form>`
  );

  const form = root.querySelector<HTMLFormElement>("#book-form")!;
  const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${CSS.escape(name)}"]`)!;

  const num = (name: string) => {
    const raw = field(name).value.trim();
    return raw === "" ? null : Number(raw);
  };

  /** Đọc form → payload đúng định dạng API. */
  function read(): BookInput {
    const customInkOn = field("cover.customInk").checked;
    return {
      title: field("title").value,
      author: field("author").value,
      publisher: field("publisher").value,
      categoryId: form.querySelector<HTMLSelectElement>('[name="categoryId"]')!.value,
      conditionId: form.querySelector<HTMLSelectElement>('[name="conditionId"]')!.value as ConditionId,
      price: num("price") ?? Number.NaN,
      originalPrice: num("originalPrice"),
      publishedYear: num("publishedYear"),
      pages: num("pages"),
      stock: num("stock") ?? Number.NaN,
      rating: num("rating") ?? 0,
      reviewCount: num("reviewCount") ?? 0,
      tags: field("tags")
        .value.split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      description: form.querySelector<HTMLTextAreaElement>('[name="description"]')!.value,
      inspectionNote: form.querySelector<HTMLTextAreaElement>('[name="inspectionNote"]')!.value,
      isPublished: field("isPublished").checked,
      cover: {
        from: field("cover.from").value.trim(),
        to: field("cover.to").value.trim(),
        ink: customInkOn ? field("cover.ink").value.trim() : null,
        pattern: Number(form.querySelector<HTMLSelectElement>('[name="cover.pattern"]')!.value),
        imageUrl: field("cover.imageUrl").value.trim() || null
      }
    };
  }

  /* ---- Xem trước trực tiếp ---- */
  const previewCover = root.querySelector<HTMLElement>("[data-preview-cover]")!;
  const previewCard = root.querySelector<HTMLElement>("[data-preview-card]")!;
  const clearCover = root.querySelector<HTMLButtonElement>("[data-clear-cover]")!;
  const validHex = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s);

  function updatePreview() {
    const d = read();
    const cat = ctx.categories.find((c) => c.id === d.categoryId);
    const cond = ctx.conditions.find((c) => c.id === d.conditionId);
    const price = Number.isFinite(d.price) ? d.price : 0;
    const preview: BookSummary = {
      id: ctx.id ?? 0,
      sku: ctx.book?.sku ?? "SCT-MỚI",
      title: d.title || "Tên sách",
      author: d.author || "Tác giả",
      publisher: d.publisher || "Nhà xuất bản",
      category: { id: d.categoryId, name: cat?.name ?? "" },
      condition: { id: d.conditionId, label: cond?.label ?? "" },
      price,
      originalPrice: d.originalPrice ?? null,
      discountPercent: discountPercent(price, d.originalPrice),
      cover: {
        from: validHex(d.cover.from) ? d.cover.from : "#2f5d50",
        to: validHex(d.cover.to) ? d.cover.to : "#1d3a32",
        ink: d.cover.ink && validHex(d.cover.ink) ? d.cover.ink : null,
        pattern: d.cover.pattern,
        imageUrl: d.cover.imageUrl ?? null
      },
      rating: d.rating ?? 0,
      reviewCount: d.reviewCount ?? 0,
      stock: Number.isFinite(d.stock) ? d.stock : 0,
      tags: d.tags ?? []
    };
    mount(previewCover, cover(preview));
    mount(previewCard, bookCard(preview));
    clearCover.hidden = !d.cover.imageUrl;
  }
  const updatePreviewSoon = debounce(updatePreview, 80);

  /* ---- Đồng bộ ô chọn màu ↔ ô mã màu ---- */
  form.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    const target = t.dataset.colorFor;
    if (target) field(target).value = t.value;
    else if (t.name?.startsWith("cover.") && validHex(t.value)) {
      const picker = form.querySelector<HTMLInputElement>(`[data-color-for="${CSS.escape(t.name)}"]`);
      if (picker) picker.value = t.value;
    }
    if (t.name) setFieldError(t, null);
    updatePreviewSoon();
  });
  form.addEventListener("change", updatePreviewSoon);
  updatePreview();

  /* ---- Ảnh bìa: nén trên trình duyệt → tải lên → điền URL ---- */
  const imageUrlField = field("cover.imageUrl");
  const fileInput = root.querySelector<HTMLInputElement>("[data-upload-cover]")!;
  const pickLabel = root.querySelector<HTMLElement>("[data-upload-label]")!;
  const pickButton = root.querySelector<HTMLElement>("[data-upload-pick]")!;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = ""; // cho phép chọn lại cùng một ảnh
    if (!file) return;
    pickButton.setAttribute("disabled", "");
    pickLabel.textContent = "Đang nén & tải lên…";
    try {
      const image = await compressImage(file, {
        maxDimension: COVER_IMAGE_MAX_DIMENSION,
        maxBytes: COVER_IMAGE_MAX_BYTES
      });
      const uploaded = await adminApi.uploads.cover(image);
      imageUrlField.value = uploaded.url;
      setFieldError(imageUrlField, null);
      updatePreview();
      toast(`Đã tải ảnh bìa lên (${Math.round(uploaded.size / 1024)} KB). Nhớ bấm lưu.`);
    } catch (err) {
      if (err instanceof ImageProcessingError) toast(err.message, { type: "warn" });
      else toastError(err, "Chưa tải được ảnh lên, vui lòng thử lại.");
    } finally {
      pickButton.removeAttribute("disabled");
      pickLabel.textContent = "Tải ảnh lên";
    }
  });

  clearCover.addEventListener("click", () => {
    imageUrlField.value = "";
    updatePreview();
  });

  /* ---- Lưu ---- */
  function showErrors(issues: Array<{ path: string; message: string }>) {
    let first: HTMLElement | null = null;
    for (const issue of issues) {
      const el = form.querySelector<HTMLInputElement>(`[name="${CSS.escape(issue.path)}"]`);
      if (!el) continue;
      setFieldError(el, issue.message);
      first ??= el;
    }
    first?.focus();
    toast("Vui lòng kiểm tra lại các trường được đánh dấu.", { type: "warn" });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = read();
    const parsed = bookInputSchema.safeParse(payload);
    if (!parsed.success) {
      return showErrors(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    if (payload.originalPrice != null && payload.originalPrice < payload.price) {
      return showErrors([{ path: "originalPrice", message: "Giá bìa phải lớn hơn hoặc bằng giá bán" }]);
    }

    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submit.disabled = true;
    try {
      const saved = ctx.id ? await adminApi.books.update(ctx.id, payload) : await adminApi.books.create(payload);
      toast(ctx.id ? `Đã lưu “${saved.title}”` : `Đã thêm “${saved.title}” (${saved.sku})`);
      notifyDataChanged();
      location.hash = "#/books";
    } catch (err) {
      submit.disabled = false;
      const errors = err instanceof ApiError ? err.problem?.errors : undefined;
      if (errors?.length) {
        showErrors(errors.map((x) => ({ path: x.path.replace(/^body\./, ""), message: x.message })));
      } else toastError(err);
    }
  });

  /* ---- Xoá ---- */
  root.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!ctx.book) return;
    const ok = await confirmDialog({
      title: "Xoá sách?",
      message: html`Xoá vĩnh viễn <strong>“${ctx.book.title}”</strong>. Không thể hoàn tác.`,
      confirmText: "Xoá sách",
      danger: true
    });
    if (!ok) return;
    try {
      await adminApi.books.remove(ctx.book.id);
      toast(`Đã xoá “${ctx.book.title}”`);
      notifyDataChanged();
      location.hash = "#/books";
    } catch (err) {
      toastError(err);
    }
  });
}
