// Bounded insertion-ordered cache used to ignore redelivered WhatsApp message
// IDs. One instance per connection, so IDs only need to be unique per socket.
export class DedupeCache {
  private readonly entries = new Map<string, true>();
  private readonly maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  // Returns true when the key is new, false when it was already seen.
  add(key: string): boolean {
    if (this.entries.has(key)) return false;
    this.entries.set(key, true);
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return true;
  }

  get size(): number {
    return this.entries.size;
  }
}
