/** Cross-layout request to mount + open the real Floating AI assistant. */

export const FLOATING_AI_OPEN_EVENT = "valueor:floating-ai:open";

export type FloatingAiOpenDetail = {
  draft?: string;
};

export function requestOpenFloatingAi(detail?: FloatingAiOpenDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<FloatingAiOpenDetail>(FLOATING_AI_OPEN_EVENT, {
      detail: detail ?? {},
    }),
  );
}
