export type Listener = () => void;

/** Nguồn sự kiện tối giản cho store (pattern observer) — không cần thư viện state management. */
export class Observable {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected notify(): void {
    for (const l of this.listeners) l();
  }
}
