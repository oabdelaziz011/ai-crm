export type HistoryBufferState = {
  capacity: number;
  count: number;
  index: number;
  canStepBack: boolean;
  canStepForward: boolean;
};

export class ImmutableHistoryBuffer<T> {
  private entries: Readonly<T>[] = [];
  private index = -1;

  constructor(
    private readonly capacity: number,
    private readonly freeze: (entry: T) => Readonly<T>,
  ) {}

  append(entry: T): number {
    const frozen = this.freeze(structuredClone(entry) as T);

    if (this.entries.length >= this.capacity) {
      this.entries.shift();
      if (this.index > 0) {
        this.index -= 1;
      }
    }

    this.entries.push(frozen);
    this.index = this.entries.length - 1;
    return this.index;
  }

  previous(): boolean {
    if (this.index <= 0) return false;
    this.index -= 1;
    return true;
  }

  next(): boolean {
    if (this.index >= this.entries.length - 1) return false;
    this.index += 1;
    return true;
  }

  jump(index: number): boolean {
    if (index < 0 || index >= this.entries.length) return false;
    this.index = index;
    return true;
  }

  reset(): void {
    this.entries = [];
    this.index = -1;
  }

  current(): Readonly<T> | null {
    if (this.index < 0) return null;
    return this.entries[this.index] ?? null;
  }

  list(): ReadonlyArray<Readonly<T>> {
    return this.entries;
  }

  getState(): HistoryBufferState {
    return {
      capacity: this.capacity,
      count: this.entries.length,
      index: this.index,
      canStepBack: this.index > 0,
      canStepForward: this.index >= 0 && this.index < this.entries.length - 1,
    };
  }
}
