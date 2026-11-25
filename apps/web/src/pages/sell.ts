import {
  BUYBACK_CITIES,
  BUYBACK_PHOTO_LIMIT,
  BUYBACK_PHOTO_MAX_BYTES,
  BUYBACK_PHOTO_MAX_DIMENSION,
  BUYBACK_METHODS,
  buybackRequestSchema,
  estimateBuyback,
  givenName,
  type BuybackRequestInput
} from "@sct/shared";
import { engagementApi } from "../api/endpoints.js";
import { ApiError } from "../api/http.js";
import { initAppShell } from "../layout/app-shell.js";
import { byId } from "../lib/dom.js";
import { formatVnd } from "../lib/format.js";
import { html, mount } from "../lib/html.js";
import { blobToDataUrl, compressImage, ImageProcessingError } from "../lib/image.js";
import { catalogService } from "../services/catalog.service.js";
import {
  applyServerErrors,
  closeModal,
  liveValidation,
  openModal,
  setFieldError,
  validateForm,
  type FieldRules
} from "../ui/forms.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";

initAppShell();

/* ---------- Ước tính giá thu mua (tính tại chỗ bằng hàm dùng chung) ---------- */

const estForm = byId<HTMLFormElement>("est-form");
const estCat = byId<HTMLSelectElement>("est-cat");
const estPrice = byId<HTMLInputElement>("est-price");
const estQty = byId<HTMLInputElement>("est-qty");
const estOut = byId("est-out");
const estCredit = byId("est-credit");

const OTHER_OPTION = html`<option value="other">Khác / nhiều thể loại</option>`;

function estimate() {
  const conditionId = estForm.querySelector<HTMLInputElement>('input[name="est-cond"]:checked')?.value ?? "good";
  const result = estimateBuyback({
    coverPrice: Number(estPrice.value),
    quantity: Number(estQty.value),
    conditionId,
    categoryId: estCat.value
  });
  if (!result) {
    estOut.textContent = "—";
    estCredit.textContent = "Nhập giá bìa và số lượng để xem ước tính";
    return;
  }
  estOut.textContent = `${formatVnd(result.low)} – ${formatVnd(result.high)}`;
  estCredit.textContent = `Hoặc đến ${formatVnd(result.creditHigh)} nếu nhận bằng điểm mua sách`;
}

mount(estCat, OTHER_OPTION);
estForm.addEventListener("input", estimate);
estForm.addEventListener("change", estimate);
estForm.addEventListener("submit", (e) => e.preventDefault());
estimate();

catalogService
  .categories()
  .then((cats) => {
    mount(estCat, [cats.map((c) => html`<option value="${c.id}">${c.name}</option>`), OTHER_OPTION]);
    estimate();
  })
  .catch(() => undefined); // vẫn ước tính được với "Khác"

/* ---------- Ảnh sách đính kèm (nén trên trình duyệt, gửi kèm form dạng data URL) ---------- */

interface Photo {
  dataUrl: string;
  /** URL tạm để xem trước (URL.createObjectURL) — giải phóng khi bỏ ảnh. */
  previewUrl: string;
}

const photoPicker = byId("s-photos");
let photos: Photo[] = [];
let processing = 0;

function renderPhotos() {
  const canAdd = photos.length + processing < BUYBACK_PHOTO_LIMIT;
  mount(photoPicker, [
    photos.map(
      (p, i) => html`<div class="photo-picker__item">
        <img src="${p.previewUrl}" alt="Ảnh sách ${i + 1}" />
        <button class="photo-picker__remove" type="button" data-remove-photo="${i}" aria-label="Bỏ ảnh ${i + 1}">${icon("x")}</button>
      </div>`
    ),
    Array.from(
      { length: processing },
      () => html`<div class="photo-picker__add is-busy">${icon("camera")}Đang nén…</div>`
    ),
    canAdd
      ? html`<label class="photo-picker__add">${icon("camera")}Thêm ảnh
          <input class="visually-hidden" type="file" name="photos" accept="image/*" multiple /></label>`
      : null
  ]);
}

function clearPhotos() {
  for (const p of photos) URL.revokeObjectURL(p.previewUrl);
  photos = [];
  renderPhotos();
}

photoPicker.addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const files = [...(input.files ?? [])].slice(0, BUYBACK_PHOTO_LIMIT - photos.length - processing);
  if (!files.length) return;
  setFieldError(input, null);
  processing += files.length;
  renderPhotos();
  for (const file of files) {
    try {
      const blob = await compressImage(file, {
        maxDimension: BUYBACK_PHOTO_MAX_DIMENSION,
        maxBytes: BUYBACK_PHOTO_MAX_BYTES
      });
      photos.push({ dataUrl: await blobToDataUrl(blob), previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      toast(err instanceof ImageProcessingError ? err.message : "Không xử lý được ảnh này.", { type: "warn" });
    } finally {
      processing--;
      renderPhotos();
    }
  }
});

photoPicker.addEventListener("click", (e) => {
  const btn = (e.target as Element).closest<HTMLElement>("[data-remove-photo]");
  if (!btn) return;
  const [removed] = photos.splice(Number(btn.dataset.removePhoto), 1);
  if (removed) URL.revokeObjectURL(removed.previewUrl);
  renderPhotos();
});

renderPhotos();

/* ---------- Form gửi yêu cầu định giá ---------- */

const form = byId<HTMLFormElement>("sell-form");
const modal = byId("sell-modal");
const RULES: FieldRules = {
  name: buybackRequestSchema.shape.name,
  phone: buybackRequestSchema.shape.phone,
  bookList: buybackRequestSchema.shape.bookList
};

mount(
  byId("s-city"),
  BUYBACK_CITIES.map((c) => html`<option value="${c.id}">${c.label}</option>`)
);
mount(
  byId("s-method"),
  BUYBACK_METHODS.map((m) => html`<option value="${m.id}">${m.label}</option>`)
);
liveValidation(form, RULES);

modal.addEventListener("click", (e) => {
  if ((e.target as Element).closest("[data-close-modal]")) closeModal(modal);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal(modal);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validateForm(form, RULES)) {
    toast("Vui lòng kiểm tra lại thông tin.", { type: "warn" });
    return;
  }
  if (processing) {
    toast("Ảnh đang được xử lý, vui lòng đợi giây lát.", { type: "warn" });
    return;
  }

  const data = new FormData(form);
  const payload: BuybackRequestInput = {
    name: String(data.get("name") ?? ""),
    phone: String(data.get("phone") ?? ""),
    city: String(data.get("city") ?? "hcm") as BuybackRequestInput["city"],
    method: String(data.get("method") ?? "sell") as BuybackRequestInput["method"],
    bookList: String(data.get("bookList") ?? ""),
    pickup: data.get("pickup") === "on",
    photos: photos.map((p) => p.dataUrl)
  };

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  try {
    const receipt = await engagementApi.submitBuyback(payload);
    byId("sell-modal-text").textContent =
      `Cảm ơn ${givenName(payload.name)}! Chúng tôi đã nhận danh sách ${receipt.bookCount} cuốn sách ` +
      `(mã ${receipt.reference}) và sẽ liên hệ qua số ${payload.phone.trim()} trong vòng 24 giờ.`;
    openModal(modal);
    form.reset();
    clearPhotos();
  } catch (err) {
    // Lỗi của từng ảnh (body.photos.1) → hiển thị ở ô ảnh, kèm số thứ tự ảnh
    const errors = err instanceof ApiError ? err.problem?.errors : undefined;
    const mapped = errors?.map((x) => {
      const m = /^body\.photos\.(\d+)$/.exec(x.path);
      return m ? { path: "body.photos", message: `Ảnh ${Number(m[1]) + 1}: ${x.message}` } : x;
    });
    if (applyServerErrors(form, mapped)) return;
    toast(err instanceof ApiError ? err.message : "Chưa gửi được yêu cầu, vui lòng thử lại.", { type: "warn" });
  } finally {
    button.disabled = false;
  }
});
