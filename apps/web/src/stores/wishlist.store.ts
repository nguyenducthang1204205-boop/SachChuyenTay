import { Observable } from "../lib/observable.js";
import { onExternalChange, readJson, writeJson } from "../lib/storage.js";

const KEY = "sct_wish_v1";
const isIds = (v: unknown): v is number[] => Array.isArray(v) && v.every((x) => Number.isInteger(x));

/** Danh sách yêu thích (chỉ lưu id). Điểm nâng cấp: đồng bộ lên server khi có tài khoản. */
class WishlistStore extends Observable {
  private state: number[] = readJson(KEY, [], isIds);

  constructor() {
    super();
    onExternalChange(KEY, () => {
      this.state = readJson(KEY, [], isIds);
      this.notify();
    });
  }

  ids(): readonly number[] {
    return this.state;
  }

  has(id: number): boolean {
    return this.state.includes(id);
  }

  count(): number {
    return this.state.length;
  }

  /** Bật/tắt; trả về true nếu vừa được thêm. */
  toggle(id: number): boolean {
    const added = !this.has(id);
    this.state = added ? [...this.state, id] : this.state.filter((x) => x !== id);
    writeJson(KEY, this.state);
    this.notify();
    return added;
  }
}

export const wishlistStore = new WishlistStore();
