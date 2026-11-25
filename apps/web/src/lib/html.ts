/**
 * Template HTML an toàn: mọi giá trị chèn vào `html\`...\`` đều được escape tự động,
 * trừ khi đó là SafeHtml (kết quả của html`` khác hoặc raw()). Chống XSS từ dữ liệu API.
 */

const SAFE = Symbol("safe-html");

export interface SafeHtml {
  readonly [SAFE]: true;
  readonly value: string;
  toString(): string;
}

export type HtmlValue = SafeHtml | string | number | boolean | null | undefined | readonly HtmlValue[];

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Đánh dấu chuỗi là HTML tin cậy (chỉ dùng cho nội dung do chính code tạo ra, ví dụ SVG icon). */
export function raw(value: string): SafeHtml {
  return { [SAFE]: true, value, toString: () => value };
}

export function isSafeHtml(value: unknown): value is SafeHtml {
  return typeof value === "object" && value !== null && SAFE in value;
}

function render(value: HtmlValue): string {
  if (value == null || value === false || value === true) return "";
  if (Array.isArray(value)) return value.map(render).join("");
  if (isSafeHtml(value)) return value.value;
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) out += render(values[i]) + (strings[i + 1] ?? "");
  return raw(out);
}

/** Gán nội dung cho phần tử. */
export function mount(target: Element | null | undefined, content: HtmlValue): void {
  if (target) target.innerHTML = render(content);
}
