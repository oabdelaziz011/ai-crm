import type { WorkspacePersonalization } from "../types/personalization-types.js";
import { DEFAULT_PERSONALIZATION } from "../types/personalization-types.js";

export class PersonalizationEngine {
  private store = new Map<string, WorkspacePersonalization>();

  get(userId: string): WorkspacePersonalization {
    const existing = this.store.get(userId);
    if (existing) return existing;
    const fresh: WorkspacePersonalization = { userId, ...DEFAULT_PERSONALIZATION };
    this.store.set(userId, fresh);
    return fresh;
  }

  update(userId: string, patch: Partial<Omit<WorkspacePersonalization, "userId">>): WorkspacePersonalization {
    const current = this.get(userId);
    const next = { ...current, ...patch };
    this.store.set(userId, next);
    return next;
  }

  togglePinnedSection(userId: string, sectionId: string): WorkspacePersonalization {
    const current = this.get(userId);
    const pinned = new Set(current.pinnedSectionIds);
    if (pinned.has(sectionId)) pinned.delete(sectionId);
    else pinned.add(sectionId);
    return this.update(userId, { pinnedSectionIds: [...pinned] });
  }

  toggleCollapsedSection(userId: string, sectionId: string): WorkspacePersonalization {
    const current = this.get(userId);
    const collapsed = new Set(current.collapsedSectionIds);
    if (collapsed.has(sectionId)) collapsed.delete(sectionId);
    else collapsed.add(sectionId);
    return this.update(userId, { collapsedSectionIds: [...collapsed] });
  }

  reorderWidgets(userId: string, widgetOrder: string[]): WorkspacePersonalization {
    return this.update(userId, { widgetOrder });
  }

  saveFilter(userId: string, name: string, query: string, entityType?: string): WorkspacePersonalization {
    const current = this.get(userId);
    const filter = {
      id: `filter_${Date.now()}`,
      name,
      query,
      entityType,
      createdAt: new Date().toISOString(),
    };
    return this.update(userId, { savedFilters: [...current.savedFilters, filter] });
  }
}

export const personalizationEngine = new PersonalizationEngine();
