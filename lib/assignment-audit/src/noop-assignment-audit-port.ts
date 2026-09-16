import type { AssignmentAuditPort } from "./assignment-audit-service.js";

export function createNoopAssignmentAuditPort(): AssignmentAuditPort {
  return {
    async recordAssignmentChange() {
      return null;
    },
    async getAssignmentHistory() {
      return [];
    },
  };
}
