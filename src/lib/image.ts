const store = new Map<string, Blob>();

export const imageHolder = {
  put(blob: Blob): string {
    const id = crypto.randomUUID();
    store.set(id, blob);
    return id;
  },
  get(id: string): Blob | undefined {
    return store.get(id);
  },
  drop(id: string): void {
    store.delete(id);
  },
  // test-only
  _size(): number {
    return store.size;
  },
  _clear(): void {
    store.clear();
  },
};
