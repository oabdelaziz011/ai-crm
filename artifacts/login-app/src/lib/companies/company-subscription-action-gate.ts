import type { CompanySubscription } from "@/lib/billing/types";

export type CompanySubscriptionActionMode = "changePackage" | "convertTrial";

export type CompanySubscriptionActionGate =
  | { kind: "pending" }
  | { kind: "load" }
  | { kind: "missing" }
  | { kind: "cancelled" }
  | { kind: "trial"; subscription: CompanySubscription }
  | { kind: "state"; subscription: CompanySubscription }
  | { kind: "ready"; subscription: CompanySubscription };

const CHANGEABLE_STATUSES = new Set(["active", "past_due", "grace_period"]);

export function resolveCompanySubscriptionActionGate(input: {
  mode: CompanySubscriptionActionMode;
  isLoading: boolean;
  error: unknown;
  data: CompanySubscription | null | undefined;
}): CompanySubscriptionActionGate {
  if (input.isLoading) return { kind: "pending" };
  if (input.error) return { kind: "load" };
  if (!input.data) return { kind: "missing" };

  if (input.mode === "convertTrial") {
    return input.data.status === "trialing"
      ? { kind: "ready", subscription: input.data }
      : { kind: "state", subscription: input.data };
  }

  if (input.data.status === "trialing") {
    return { kind: "trial", subscription: input.data };
  }

  if (CHANGEABLE_STATUSES.has(input.data.status)) {
    return { kind: "ready", subscription: input.data };
  }

  return { kind: "state", subscription: input.data };
}
