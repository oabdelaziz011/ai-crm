/** @deprecated Use stores/memory-stores.js — re-exported for backward compatibility. */
export {
  createMemoryDeadLetterQueue as DeadLetterQueue,
  sharedMemoryDeadLetterQueue as sharedDeadLetterQueue,
} from "../stores/memory-stores.js";
export type { DeadLetterEntry } from "../stores/store-ports.js";
