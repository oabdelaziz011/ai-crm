export type PaymentMethodOption = {
  code: string;
  display_name: string;
  category: string | null;
};

export type BillingPaymentOptions = {
  schema_version: number;
  payment_methods: PaymentMethodOption[];
  payment_sandbox_mode: boolean;
  active_provider_code: string;
  active_mode: "sandbox" | "production";
};

export function computeInvoiceDueAt(issuedAt: Date, paymentTermsDays: number): Date {
  const due = new Date(issuedAt);
  due.setUTCDate(due.getUTCDate() + Math.max(0, paymentTermsDays));
  return due;
}

export function computeTrialEndsAt(startAt: Date, trialDurationDays: number): Date {
  const end = new Date(startAt);
  end.setUTCDate(end.getUTCDate() + Math.max(0, trialDurationDays));
  return end;
}

export function computeGracePeriodEndsAt(startAt: Date, gracePeriodDays: number): Date {
  const end = new Date(startAt);
  end.setUTCDate(end.getUTCDate() + Math.max(1, gracePeriodDays));
  return end;
}

export function filterSupportedPaymentMethods(
  supportedCodes: string[],
  allMethods: PaymentMethodOption[],
): PaymentMethodOption[] {
  const allowed = new Set(supportedCodes.map((code) => code.trim()).filter(Boolean));
  return allMethods.filter((method) => allowed.has(method.code));
}

export function resolveActivePaymentProvider(sandboxMode: boolean): string {
  return sandboxMode ? "sandbox" : "manual";
}

export function resolveActivePaymentMode(sandboxMode: boolean): "sandbox" | "production" {
  return sandboxMode ? "sandbox" : "production";
}

export function parseSupportedPaymentMethodCodes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function isMissingBillingPaymentOptionsRpcError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    (lower.includes("could not find the function") || lower.includes("does not exist")) &&
    lower.includes("get_billing_payment_options")
  );
}
