/** Lấy phần tử theo id, ném lỗi rõ ràng nếu HTML thiếu (lỗi lập trình, phát hiện sớm). */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Thiếu phần tử #${id} trong HTML`);
  return el as T;
}

export const qs = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T>(selector);

export const qsa = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(selector));

export const param = (key: string) => new URLSearchParams(location.search).get(key);

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Đặt meta description (SEO) cho trang được render phía client. */
export function setMetaDescription(content: string) {
  qs<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", content);
}
