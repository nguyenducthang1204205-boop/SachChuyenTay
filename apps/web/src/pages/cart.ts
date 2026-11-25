import {
  calculateTotals,
  customerSchema,
  ERROR_CODES,
  givenName,
  PAYMENT_METHODS,
  type AppliedCoupon,
  type PaymentMethod
} from "@sct/shared";
import { checkoutApi } from "../api/endpoints.js";
import { ApiError, isAbort } from "../api/http.js";
import { initAppShell } from "../layout/app-shell.js";
import { byId, debounce } from "../lib/dom.js";
import { formatVnd } from "../lib/format.js";
import { html, mount, type SafeHtml } from "../lib/html.js";
import { cartStore, type ReconcileNotice } from "../stores/cart.store.js";
import { conditionBadge, cover, productUrl } from "../ui/book.js";
import { emptyState } from "../ui/feedback.js";
import { applyServerErrors, liveValidation, openModal, validateForm, type FieldRules } from "../ui/forms.js";
import { icon, type IconName } from "../ui/icons.js";
import { toast } from "../ui/toast.js";

initAppShell();

const root = byId("cart-root");
const RULES: FieldRules = customerSchema.shape;

/* ---------- State ---------- */
let appliedCoupon: AppliedCoupon | null = null;
let couponFeedback: { kind: "ok" | "err"; text: string } | null = null;
let quotedSignature: string | null = null;
let quotePending = false;
let quoteController: AbortController | null = null;
let submitting = false;
/** Một lần "bấm đặt hàng" = một key; thử lại khi mạng lỗi dùng lại key → server không tạo trùng đơn. */
let idempotencyKey: string | null = null;
/** Giữ dữ liệu form qua các lần render lại. */
const formData: Record<string, string> = { pay: "cod" };

const PAYMENT_OPTIONS: Record<PaymentMethod, { title: string; desc: string; icon: IconName }> = {
  cod: { title: "Thanh toán khi nhận sách (COD)", desc: "Kiểm tra sách trước khi trả tiền", icon: "wallet" },
  bank: { title: "Chuyển khoản ngân hàng", desc: "Thông tin chuyển khoản gửi qua SMS/email", icon: "bank" },
  momo: { title: "Ví điện tử MoMo / ZaloPay", desc: "Quét mã QR sau khi đặt hàng", icon: "phone" }
};

const newIdempotencyKey = () =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

/* ---------- Server quote: xác nhận giá, tồn kho, mã giảm giá ---------- */

function announce(notices: ReconcileNotice[]) {
  for (const n of notices) {
    if (n.kind === "removed")
      toast(`“${n.title}” vừa được chuyền tay và đã bị bỏ khỏi giỏ.`, { type: "warn", duration: 5000 });
    else toast(`“${n.title}” chỉ còn ${n.quantity} bản — đã cập nhật số lượng.`, { type: "warn", duration: 5000 });
  }
}

/** Trả về mã giảm giá đang áp dụng sau khi báo giá (null nếu không có / không hợp lệ). */
async function refreshQuote(couponCode = appliedCoupon?.code): Promise<AppliedCoupon | null> {
  if (cartStore.isEmpty()) return null;
  quoteController?.abort();
  const controller = (quoteController = new AbortController());
  quotePending = true;
  renderSummaryStatus();
  try {
    const quote = await checkoutApi.quote({ items: cartStore.items(), couponCode }, controller.signal);
    appliedCoupon = quote.coupon;
    if (couponCode && quote.couponError) couponFeedback = { kind: "err", text: quote.couponError };
    else if (quote.coupon) couponFeedback = { kind: "ok", text: quote.coupon.label };
    quotedSignature = cartStore.signature(); // đặt trước reconcile để không báo giá lặp lại
    const notices = cartStore.reconcile(quote);
    quotedSignature = cartStore.signature();
    announce(notices);
    return quote.coupon;
  } catch (err) {
    if (isAbort(err)) return null;
    // Không chặn người dùng: server vẫn kiểm tra lại toàn bộ khi đặt hàng.
    toast("Chưa cập nhật được giá & tồn kho mới nhất.", { type: "warn" });
    return null;
  } finally {
    if (quoteController === controller) {
      quotePending = false;
      renderSummary();
    }
  }
}
const refreshQuoteDebounced = debounce(() => void refreshQuote(), 300);

/* ---------- Render ---------- */

function field(
  id: string,
  label: string,
  o: { req?: boolean; type?: string; ph?: string; ac?: string; full?: boolean; textarea?: boolean } = {}
): SafeHtml {
  const value = formData[id] ?? "";
  const control = o.textarea
    ? html`<textarea class="textarea" id="${id}" name="${id}" rows="3" placeholder="${o.ph ?? ""}">${value}</textarea>`
    : html`<input class="input" id="${id}" name="${id}" type="${o.type ?? "text"}" placeholder="${o.ph ?? ""}" value="${value}" ${o.req ? "required" : ""} autocomplete="${o.ac ?? "on"}" />`;
  return html`<div class="field${o.full ? " full" : ""}">
    <label for="${id}">${label}${o.req ? html` <span style="color:var(--accent)">*</span>` : null}</label>
    ${control}
    <span class="error">Vui lòng điền thông tin này</span>
  </div>`;
}

function paymentOption(method: PaymentMethod): SafeHtml {
  const o = PAYMENT_OPTIONS[method];
  return html`<label class="pay-option">
    <input type="radio" name="pay" value="${method}" ${formData.pay === method ? "checked" : ""} />
    <div><strong>${o.title}</strong><span>${o.desc}</span></div>${icon(o.icon)}
  </label>`;
}

function itemsSection(): SafeHtml {
  return html`<section class="panel" aria-labelledby="items-title">
    <h2 class="panel__title" id="items-title"><span class="num">1</span> Sách đã chọn (${cartStore.count()})</h2>
    ${cartStore.lines().map(({ book: b, quantity }) => {
      const atMax = quantity >= b.stock;
      return html`<div class="cart-item">
        <a href="${productUrl(b)}">${cover(b, { small: true })}</a>
        <div>
          <h3 class="cart-item__title"><a href="${productUrl(b)}">${b.title}</a></h3>
          <div class="cart-item__meta"><span>${b.author}</span>${conditionBadge(b.condition)}</div>
          <div class="cart-item__meta"><span>${formatVnd(b.price)}</span>${b.originalPrice ? html`<s>${formatVnd(b.originalPrice)}</s>` : null}</div>
        </div>
        <div class="cart-item__actions">
          <div class="qty qty--sm">
            <button type="button" data-cqty="${b.id}" data-delta="-1" aria-label="Giảm">${icon("minus")}</button>
            <input type="text" value="${quantity}" readonly aria-label="Số lượng" />
            <button type="button" data-cqty="${b.id}" data-delta="1" aria-label="Tăng" ${atMax ? "disabled" : ""}>${icon("plus")}</button>
          </div>
          <div class="cart-item__total">${formatVnd(b.price * quantity)}${atMax ? html`<small>Tối đa ${b.stock} bản</small>` : null}</div>
          <button class="mini-item__remove" type="button" data-cremove="${b.id}" aria-label="Xoá ${b.title}">${icon("trash")}</button>
        </div>
      </div>`;
    })}
  </section>`;
}

function checkoutForm(): SafeHtml {
  return html`<form class="panel" id="checkout-form" novalidate aria-labelledby="ship-title">
    <h2 class="panel__title" id="ship-title"><span class="num">2</span> Thông tin giao hàng</h2>
    <div class="form-grid">
      ${field("name", "Họ và tên", { req: true, ph: "Nguyễn Văn A", ac: "name" })}
      ${field("phone", "Số điện thoại", { req: true, type: "tel", ph: "09xx xxx xxx", ac: "tel" })}
      ${field("email", "Email", { type: "email", ph: "ban@email.com", ac: "email", full: true })}
      ${field("address", "Địa chỉ nhận sách", { req: true, ph: "Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành", ac: "street-address", full: true })}
      ${field("note", "Ghi chú cho người giao", { textarea: true, ph: "Ví dụ: giao giờ hành chính, gọi trước khi đến…", full: true })}
    </div>
    <h2 class="panel__title" style="margin-top:32px"><span class="num">3</span> Phương thức thanh toán</h2>
    <div class="pay-options" role="radiogroup">${PAYMENT_METHODS.map(paymentOption)}</div>
  </form>`;
}

function summary(): SafeHtml {
  const t = calculateTotals({
    lines: cartStore
      .lines()
      .map((l) => ({ unitPrice: l.book.price, originalPrice: l.book.originalPrice, quantity: l.quantity })),
    couponPercent: appliedCoupon?.percent
  });
  const feedback = couponFeedback
    ? html`<p class="coupon-msg ${couponFeedback.kind}" id="coupon-msg">${couponFeedback.kind === "ok" ? html`${icon("check")} ` : null}${couponFeedback.text}</p>`
    : html`<p class="coupon-msg" id="coupon-msg">Gợi ý: nhập <strong>CHUYENTAY10</strong> để giảm 10%</p>`;

  return html`<aside class="panel summary" aria-labelledby="sum-title">
    <h2 class="panel__title" id="sum-title">Tóm tắt đơn hàng</h2>
    <form class="coupon" id="coupon-form">
      <label class="visually-hidden" for="coupon">Mã giảm giá</label>
      <input class="input" id="coupon" placeholder="Mã giảm giá" value="${appliedCoupon?.code ?? ""}" autocomplete="off" ${appliedCoupon ? "readonly" : ""} />
      <button class="btn btn--ghost btn--sm" type="submit" style="min-height:44px">${appliedCoupon ? "Bỏ mã" : "Áp dụng"}</button>
    </form>
    ${feedback}
    <div class="summary__rows">
      <div><span>Tạm tính</span><span>${formatVnd(t.subtotal)}</span></div>
      ${t.discount ? html`<div class="discount"><span>Mã giảm giá (${appliedCoupon?.code})</span><span>−${formatVnd(t.discount)}</span></div>` : null}
      <div><span>Phí giao hàng</span><span>${t.shippingFee ? formatVnd(t.shippingFee) : html`<strong style="color:var(--success)">Miễn phí</strong>`}</span></div>
    </div>
    <div class="summary__total"><span>Tổng cộng</span><strong>${formatVnd(t.total)}</strong></div>
    ${t.savings > 0 ? html`<p style="margin:-8px 0 18px;font-size:14px;color:var(--success);font-weight:600">${icon("leaf")} Bạn tiết kiệm ${formatVnd(t.savings)} so với mua sách mới</p>` : null}
    ${t.freeShippingRemaining > 0 ? html`<p style="margin:-6px 0 18px;font-size:13px;color:var(--ink-2)">Mua thêm ${formatVnd(t.freeShippingRemaining)} để được miễn phí giao hàng.</p>` : null}
    <button class="btn btn--accent btn--lg btn--block" type="submit" form="checkout-form" id="place-order" ${submitting ? "disabled" : ""}>
      ${submitting ? "Đang xử lý…" : `Đặt hàng · ${formatVnd(t.total)}`}
    </button>
    <p class="secure-note" id="quote-status">${icon("shield")} Thông tin của bạn được bảo mật tuyệt đối</p>
  </aside>`;
}

/** Chỉ vẽ lại cột tóm tắt — giữ nguyên form để không làm mất focus khi người dùng đang nhập. */
function renderSummary() {
  const aside = root.querySelector(".summary");
  if (aside) aside.outerHTML = summary().value;
  else render();
}

function renderSummaryStatus() {
  const status = document.getElementById("quote-status");
  if (status && quotePending) status.innerHTML = html`${icon("refresh")} Đang cập nhật giá & tồn kho…`.value;
}

function render() {
  if (cartStore.isEmpty()) {
    mount(
      root,
      emptyState({
        icon: "bag",
        title: "Giỏ sách đang trống",
        message: "Hãy chọn vài cuốn sách để bắt đầu hành trình đọc mới nhé.",
        action: html`<a class="btn btn--lg" href="shop.html">Khám phá cửa hàng ${icon("arrow")}</a>`,
        style: "padding:96px 16px"
      })
    );
    return;
  }
  mount(root, html`<div class="cart-layout"><div>${itemsSection()}${checkoutForm()}</div>${summary()}</div>`);
  renderSummaryStatus();
}

/* ---------- Coupon ---------- */

async function handleCoupon() {
  if (appliedCoupon) {
    appliedCoupon = null;
    couponFeedback = null;
    idempotencyKey = null;
    render();
    return;
  }
  const code = (document.getElementById("coupon") as HTMLInputElement | null)?.value.trim().toUpperCase() ?? "";
  if (!code) {
    couponFeedback = { kind: "err", text: "Vui lòng nhập mã giảm giá." };
    render();
    return;
  }
  idempotencyKey = null;
  const applied = await refreshQuote(code);
  if (applied) toast(`Đã áp dụng mã ${applied.code}`);
}

/* ---------- Place order ---------- */

function showSuccess(code: string, text: string) {
  byId("order-code").textContent = `Mã đơn: ${code}`;
  byId("success-text").textContent = text;
  openModal(byId("success-modal"));
}

async function placeOrder(form: HTMLFormElement) {
  if (submitting) return;
  if (!validateForm(form, RULES)) {
    toast("Vui lòng kiểm tra lại thông tin giao hàng.", { type: "warn" });
    return;
  }

  submitting = true;
  renderSummary();
  idempotencyKey ??= newIdempotencyKey();

  try {
    const order = await checkoutApi.placeOrder(
      {
        customer: {
          name: formData.name ?? "",
          phone: formData.phone ?? "",
          email: formData.email,
          address: formData.address ?? "",
          note: formData.note
        },
        paymentMethod: (formData.pay as PaymentMethod) ?? "cod",
        items: cartStore.items(),
        couponCode: appliedCoupon?.code
      },
      idempotencyKey
    );

    showSuccess(
      order.code,
      `Cảm ơn ${givenName(order.customerName)}! Đơn hàng ${formatVnd(order.totals.total)} đã được ghi nhận. ` +
        `Chúng tôi sẽ gọi xác nhận qua số ${order.phone} trong ít phút.`
    );
    idempotencyKey = null;
    appliedCoupon = null;
    couponFeedback = null;
    quotedSignature = "";
    submitting = false;
    cartStore.clear();
  } catch (err) {
    submitting = false;
    if (!(err instanceof ApiError)) {
      toast("Đã có lỗi không mong muốn. Vui lòng thử lại.", { type: "warn" });
      return renderSummary();
    }
    if (err.isNetwork) {
      // Giữ nguyên idempotencyKey: bấm lại sẽ không tạo đơn trùng nếu lần trước thực ra đã thành công.
      toast(err.message, { type: "warn", duration: 5000 });
      return renderSummary();
    }

    idempotencyKey = null;
    switch (err.code) {
      case ERROR_CODES.OUT_OF_STOCK:
        toast("Một vài cuốn vừa được người khác mua mất. Giỏ hàng đã được cập nhật.", { type: "warn", duration: 5000 });
        await refreshQuote();
        return;
      case ERROR_CODES.INVALID_COUPON:
        appliedCoupon = null;
        couponFeedback = { kind: "err", text: err.message };
        toast(err.message, { type: "warn" });
        return renderSummary();
      case ERROR_CODES.VALIDATION_FAILED:
        renderSummary();
        if (!applyServerErrors(byId<HTMLFormElement>("checkout-form"), err.problem?.errors)) {
          toast(err.message, { type: "warn" });
        }
        return;
      default:
        toast(err.message, { type: "warn" });
        return renderSummary();
    }
  }
}

/* ---------- Events (delegation — không mất khi render lại) ---------- */

liveValidation(root, RULES);
const remember = (e: Event) => {
  const t = e.target as HTMLInputElement;
  if (t.name) formData[t.name] = t.value;
};
root.addEventListener("input", remember);
root.addEventListener("change", remember);

root.addEventListener("click", (e) => {
  const target = e.target as Element;
  const qty = target.closest<HTMLElement>("[data-cqty]");
  if (qty) {
    const id = Number(qty.dataset.cqty);
    const line = cartStore.get(id);
    if (line) cartStore.setQuantity(id, line.quantity + Number(qty.dataset.delta));
    return;
  }
  const rm = target.closest<HTMLElement>("[data-cremove]");
  if (rm) {
    const line = cartStore.get(Number(rm.dataset.cremove));
    if (!line) return;
    cartStore.remove(line.bookId);
    toast(`Đã xoá “${line.book.title}” khỏi giỏ`);
  }
});

root.addEventListener("submit", (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  if (form.id === "coupon-form") void handleCoupon();
  if (form.id === "checkout-form") void placeOrder(form);
});

cartStore.subscribe(() => {
  render();
  if (!cartStore.isEmpty() && cartStore.signature() !== quotedSignature) {
    idempotencyKey = null; // giỏ đổi → đơn khác → key mới
    refreshQuoteDebounced();
  }
});

render();
void refreshQuote();
