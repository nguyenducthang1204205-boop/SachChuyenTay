import type { FieldError } from "@sct/shared";
import type { z } from "zod";

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
export type FieldRules = Record<string, z.ZodType | undefined>;

/**
 * Kiểm tra form phía client bằng CHÍNH schema Zod mà server dùng (@sct/shared)
 * → quy tắc và thông điệp lỗi không bao giờ lệch nhau giữa FE và BE.
 */
export function setFieldError(control: Control, message: string | null): void {
  const field = control.closest(".field");
  field?.classList.toggle("has-error", !!message);
  control.setAttribute("aria-invalid", String(!!message));
  const errorEl = field?.querySelector<HTMLElement>(".error");
  if (errorEl && message) errorEl.textContent = message;
}

export function validateControl(control: Control, rules: FieldRules): boolean {
  const schema = rules[control.name];
  if (!schema) return true;
  const result = schema.safeParse(control.value);
  setFieldError(control, result.success ? null : (result.error.issues[0]?.message ?? "Giá trị chưa hợp lệ"));
  return result.success;
}

/** Kiểm tra mọi trường; focus vào trường lỗi đầu tiên. Trả true nếu hợp lệ. */
export function validateForm(form: HTMLFormElement, rules: FieldRules): boolean {
  let firstInvalid: Control | null = null;
  form.querySelectorAll<Control>("[name]").forEach((c) => {
    if (!validateControl(c, rules) && !firstInvalid) firstInvalid = c;
  });
  (firstInvalid as Control | null)?.focus();
  return !firstInvalid;
}

/** Kiểm tra khi rời trường (nếu đã nhập) và kiểm tra lại ngay khi đang sửa trường lỗi. */
export function liveValidation(root: HTMLElement, rules: FieldRules): void {
  root.addEventListener("focusout", (e) => {
    const c = e.target as Control;
    if (c.name && c.value) validateControl(c, rules);
  });
  root.addEventListener("input", (e) => {
    const c = e.target as Control;
    if (c.name && c.closest(".field.has-error")) validateControl(c, rules);
  });
}

/** Hiển thị lỗi theo trường do server trả về (path dạng "body.customer.phone" → name="phone"). */
export function applyServerErrors(form: HTMLFormElement, errors: readonly FieldError[] = []): boolean {
  let applied = false;
  for (const err of errors) {
    const name = err.path.split(".").pop();
    const control = name ? form.querySelector<Control>(`[name="${CSS.escape(name)}"]`) : null;
    if (control) {
      setFieldError(control, err.message);
      if (!applied) control.focus();
      applied = true;
    }
  }
  return applied;
}

/** Hiển thị/ẩn modal đơn giản dùng class .is-open có sẵn trong CSS. */
export function openModal(modal: HTMLElement) {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  modal.querySelector<HTMLElement>(".btn")?.focus();
}

export function closeModal(modal: HTMLElement) {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}
