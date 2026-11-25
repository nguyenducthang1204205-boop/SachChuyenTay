/**
 * Bọc localStorage an toàn: không bao giờ ném lỗi (chế độ ẩn danh, bộ nhớ đầy, JSON hỏng).
 */
export function readJson<T>(key: string, fallback: T, isValid?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (isValid && !isValid(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage đầy / bị chặn — bỏ qua, giữ trạng thái trong bộ nhớ */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Lắng nghe thay đổi từ tab khác để đồng bộ trạng thái. */
export function onExternalChange(key: string, handler: () => void): void {
  window.addEventListener("storage", (e) => {
    if (e.key === key) handler();
  });
}
