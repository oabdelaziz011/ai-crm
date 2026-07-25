export type CalendarSelectionModifiers = {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
};

export class CalendarSelectionService {
  private selectedIds = new Set<string>();
  private anchorId: string | null = null;
  private orderedIds: string[] = [];

  setOrderedEvents(eventIds: string[]): void {
    this.orderedIds = eventIds;
  }

  select(eventId: string, modifiers: CalendarSelectionModifiers = {}): string[] {
    const multi = modifiers.ctrlKey || modifiers.metaKey;
    const range = modifiers.shiftKey && this.anchorId;

    if (range) {
      const anchorIndex = this.orderedIds.indexOf(this.anchorId!);
      const targetIndex = this.orderedIds.indexOf(eventId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] =
          anchorIndex <= targetIndex
            ? [anchorIndex, targetIndex]
            : [targetIndex, anchorIndex];
        const rangeIds = this.orderedIds.slice(start, end + 1);
        if (!multi) this.selectedIds.clear();
        rangeIds.forEach((id) => this.selectedIds.add(id));
        return this.getSelectedIds();
      }
    }

    if (multi) {
      if (this.selectedIds.has(eventId)) {
        this.selectedIds.delete(eventId);
      } else {
        this.selectedIds.add(eventId);
      }
      this.anchorId = eventId;
      return this.getSelectedIds();
    }

    this.selectedIds.clear();
    this.selectedIds.add(eventId);
    this.anchorId = eventId;
    return this.getSelectedIds();
  }

  clear(): void {
    this.selectedIds.clear();
    this.anchorId = null;
  }

  isSelected(eventId: string): boolean {
    return this.selectedIds.has(eventId);
  }

  getPrimaryId(): string | null {
    if (this.selectedIds.size === 0) return null;
    if (this.anchorId && this.selectedIds.has(this.anchorId)) return this.anchorId;
    return [...this.selectedIds][0] ?? null;
  }

  getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  replaceSelection(ids: string[]): void {
    this.selectedIds = new Set(ids);
    this.anchorId = ids[0] ?? null;
  }
}
