/** @deprecated Use stores/memory-stores.js — re-exported for backward compatibility. */
export {
  createMemoryAuditTrailStore as AuditTrailStore,
  sharedMemoryAuditTrailStore as sharedAuditTrailStore,
} from "../stores/memory-stores.js";
export type { AuditTrailEntry } from "../stores/store-ports.js";
