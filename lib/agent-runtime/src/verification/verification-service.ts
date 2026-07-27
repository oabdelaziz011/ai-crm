import type { AgentTaskNode } from "../types.js";

export type VerificationResult = {
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
};

export class VerificationService {
  verify(task: AgentTaskNode, output: Record<string, unknown> | null): VerificationResult {
    const rule = task.verificationRule;
    if (!rule) {
      return { passed: true, message: "No verification required." };
    }

    switch (rule) {
      case "customer_exists":
        return this.verifyCustomerExists(output);
      case "lookup_has_results":
        return this.verifyHasResults(output, "CRM lookup");
      case "knowledge_has_results":
        return this.verifyHasResults(output, "Knowledge search");
      case "booking_created":
        return this.verifyBookingCreated(output);
      case "merge_completed":
        return this.verifyMergeCompleted(output);
      case "import_completed":
        return this.verifyImportCompleted(output);
      case "confirmation_pending":
        return this.verifyConfirmationPending(output);
      default:
        return { passed: Boolean(output), message: `Verification rule ${rule}` };
    }
  }

  private verifyCustomerExists(output: Record<string, unknown> | null): VerificationResult {
    const customerId = output?.customerId ?? output?.id ?? (output?.customer as Record<string, unknown>)?.id;
    if (customerId) {
      return { passed: true, message: "Customer record verified.", details: { customerId } };
    }
    return { passed: false, message: "Customer was not created or ID missing from tool output." };
  }

  private verifyHasResults(output: Record<string, unknown> | null, label: string): VerificationResult {
    const results = output?.results ?? output?.items ?? output?.matches;
    const count = Array.isArray(results) ? results.length : output ? 1 : 0;
    if (count > 0) {
      return { passed: true, message: `${label} returned ${count} result(s).`, details: { count } };
    }
    return { passed: false, message: `${label} returned no results.` };
  }

  private verifyBookingCreated(output: Record<string, unknown> | null): VerificationResult {
    const bookingId = output?.bookingId ?? output?.id;
    if (bookingId) {
      return { passed: true, message: "Booking verified.", details: { bookingId } };
    }
    return { passed: false, message: "Booking ID not found in tool output." };
  }

  private verifyMergeCompleted(output: Record<string, unknown> | null): VerificationResult {
    if (output?.requiresConfirmation) {
      return {
        passed: false,
        message: String(output.message ?? "Merge requires user confirmation."),
        details: { requiresConfirmation: true },
      };
    }
    if (output?.merged === true) {
      return {
        passed: true,
        message: String(output.message ?? "Customer merge verified."),
        details: { primaryCustomerId: output.primaryCustomerId, mergedCount: output.mergedCount },
      };
    }
    return { passed: false, message: "Merge did not complete successfully." };
  }

  private verifyImportCompleted(output: Record<string, unknown> | null): VerificationResult {
    if (output?.requiresConfirmation) {
      return {
        passed: false,
        message: String(output.message ?? "Import requires user confirmation."),
        details: { requiresConfirmation: true },
      };
    }
    const imported = Number(output?.imported ?? 0);
    if (imported > 0 || Number(output?.skipped ?? 0) >= 0) {
      return {
        passed: true,
        message: `Import verified: ${imported} customer(s) created.`,
        details: { imported, skipped: output?.skipped, errors: output?.errors },
      };
    }
    return { passed: false, message: "Import produced no results." };
  }

  private verifyConfirmationPending(output: Record<string, unknown> | null): VerificationResult {
    if (output?.requiresConfirmation) {
      return {
        passed: false,
        message: String(output.message ?? "Waiting for user confirmation."),
        details: { requiresConfirmation: true },
      };
    }
    return { passed: true, message: "Confirmation received." };
  }
}
