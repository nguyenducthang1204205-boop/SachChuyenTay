import { calculateTotals, MAX_LINE_QUANTITY, type BookSummary, type CartQuote, type OrderTotals } from "@sct/shared";
import { Observable } from "../lib/observable.js";
import { onExternalChange, readJson, removeKey, writeJson } from "../lib/storage.js";

/**
 * Giỏ hàng phía client (lưu localStorage).
 * Mỗi dòng giữ "ảnh chụp" thông tin sách để hiển thị tức thì; giá & tồn kho chính thức
 * luôn được server xác nhận lại qua /cart/quote (xem `reconcile`).
 */

export interface CartLine {
  bookId: number;
  quantity: number;
  book: BookSummary;
}

export type AddResult = { ok: true; capped: boolean } | { ok: false; reason: "sold" | "max" };

export interface ReconcileNotice {
  kind: "removed" | "reduced";
  title: string;
  quantity: number;
}

const KEY = "sct_cart_v2";
const LEGACY_KEY = "sct_cart_v1";

const isLines = (v: unknown): v is CartLine[] =>
  Array.isArray(v) &&
  v.every(
    (l) => l && typeof l.bookId === "number" && typeof l.quantity === "number" && typeof l.book?.title === "string"
  );

class CartStore extends Observable {
  private state: CartLine[] = readJson(KEY, [], isLines);

  constructor() {
    super();
    removeKey(LEGACY_KEY); // định dạng v1 (chỉ có id) không còn đủ dữ liệu hiển thị
    onExternalChange(KEY, () => {
      this.state = readJson(KEY, [], isLines);
      this.notify();
    });
  }

  private commit(next: CartLine[]) {
    this.state = next;
    writeJson(KEY, next);
    this.notify();
  }

  lines(): readonly CartLine[] {
    return this.state;
  }

  get(bookId: number): CartLine | undefined {
    return this.state.find((l) => l.bookId === bookId);
  }

  count(): number {
    return this.state.reduce((s, l) => s + l.quantity, 0);
  }

  isEmpty(): boolean {
    return this.state.length === 0;
  }

  /** Dữ liệu gửi lên API. */
  items() {
    return this.state.map((l) => ({ bookId: l.bookId, quantity: l.quantity }));
  }

  /** Chữ ký nội dung giỏ — dùng để biết khi nào cần báo giá lại. */
  signature(): string {
    return this.state.map((l) => `${l.bookId}x${l.quantity}`).join(",");
  }

  /** Tổng tạm tính dựa trên ảnh chụp (hiển thị nhanh; số chính thức lấy từ server). */
  estimate(): OrderTotals {
    return calculateTotals({
      lines: this.state.map((l) => ({
        unitPrice: l.book.price,
        originalPrice: l.book.originalPrice,
        quantity: l.quantity
      }))
    });
  }

  add(book: BookSummary, quantity = 1): AddResult {
    if (book.stock <= 0) return { ok: false, reason: "sold" };
    const max = Math.min(book.stock, MAX_LINE_QUANTITY);
    const current = this.get(book.id)?.quantity ?? 0;
    if (current >= max) return { ok: false, reason: "max" };

    const next = Math.min(max, current + quantity);
    const line: CartLine = { bookId: book.id, quantity: next, book };
    this.commit(current ? this.state.map((l) => (l.bookId === book.id ? line : l)) : [...this.state, line]);
    return { ok: true, capped: next < current + quantity };
  }

  setQuantity(bookId: number, quantity: number) {
    const line = this.get(bookId);
    if (!line) return;
    if (quantity <= 0) return this.remove(bookId);
    const q = Math.min(quantity, Math.max(1, line.book.stock), MAX_LINE_QUANTITY);
    if (q === line.quantity) return;
    this.commit(this.state.map((l) => (l.bookId === bookId ? { ...l, quantity: q } : l)));
  }

  remove(bookId: number) {
    this.commit(this.state.filter((l) => l.bookId !== bookId));
  }

  clear() {
    this.commit([]);
  }

  /**
   * Đồng bộ giỏ với báo giá từ server: cập nhật giá/tồn kho mới, giảm số lượng vượt tồn,
   * bỏ sách đã bán hết. Trả về danh sách thay đổi để UI thông báo cho người dùng.
   */
  reconcile(quote: CartQuote): ReconcileNotice[] {
    const notices: ReconcileNotice[] = [];
    const byId = new Map(quote.lines.map((l) => [l.bookId, l]));
    const next: CartLine[] = [];

    for (const line of this.state) {
      const q = byId.get(line.bookId);
      if (!q) {
        next.push(line);
        continue;
      }
      if (!q.book || q.quantity === 0) {
        notices.push({ kind: "removed", title: line.book.title, quantity: 0 });
        continue;
      }
      if (q.quantity < line.quantity) notices.push({ kind: "reduced", title: q.book.title, quantity: q.quantity });
      next.push({ bookId: line.bookId, quantity: q.quantity, book: q.book });
    }

    if (JSON.stringify(next) !== JSON.stringify(this.state)) this.commit(next);
    return notices;
  }
}

export const cartStore = new CartStore();
