/** Cross-layout request to mount + open the real Floating AI assistant. */

import type { FloatingAiSurface } from "@/lib/floating-ai/guide/guide-security";

export const FLOATING_AI_OPEN_EVENT = "valueor:floating-ai:open";

export type FloatingAiOpenDetail = {
  draft?: string;
  /** Phase 1 — open as Guide (product help) or Assist (default). */
  surface?: FloatingAiSurface;
};

export function requestOpenFloatingAi(detail?: FloatingAiOpenDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<FloatingAiOpenDetail>(FLOATING_AI_OPEN_EVENT, {
      detail: detail ?? {},
    }),
  );
}
