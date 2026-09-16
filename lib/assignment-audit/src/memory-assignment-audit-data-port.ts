import { AssignmentAuditCompanyScopeError } from "./errors.js";
import type {
  AssignmentAuditDataPort,
  AssignmentAuditEvent,
  GetAssignmentHistoryInput,
} from "./types.js";

export type MemoryAssignmentAuditStore = {
  events: AssignmentAuditEvent[];
  profileCompanies: Map<string, string>;
};

export function createMemoryAssignmentAuditStore(): MemoryAssignmentAuditStore {
  return {
    events: [],
    profileCompanies: new Map(),
  };
}

export function createMemoryAssignmentAuditDataPort(
  store: MemoryAssignmentAuditStore,
): AssignmentAuditDataPort {
  return {
    async assertCompanyScope(companyId, actorUserId) {
      if (!actorUserId) return;
      const actorCompanyId = store.profileCompanies.get(actorUserId);
      if (actorCompanyId && actorCompanyId !== companyId) {
        throw new AssignmentAuditCompanyScopeError();
      }
    },

    async insertEvent(input) {
      const event: AssignmentAuditEvent = {
        id: `audit-${store.events.length + 1}`,
        createdAt: new Date().toISOString(),
        ...input,
      };
      store.events.push(Object.freeze({ ...event }));
      return event;
    },

    async listEvents(input: GetAssignmentHistoryInput) {
      const limit = input.limit ?? 50;
      const offset = input.offset ?? 0;
      return store.events
        .filter(
          (event) =>
            event.companyId === input.companyId &&
            event.resourceType === input.resourceType &&
            event.resourceId === input.resourceId,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(offset, offset + limit);
    },
  };
}
