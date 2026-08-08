import { Banknote, FileText, Printer, RotateCcw } from "lucide-react";
import type { OperationsActionDefinition } from "../types";
import {
  hasOutstandingBalance,
  isBillingEnabled,
  isPaymentIn,
  isStatusIn,
  rowAmountCents,
} from "../context-helpers";

export const billingActions: OperationsActionDefinition[] = [
  {
    id: "billing.collect_payment",
    titleKey: "universalOperations.actions.items.collectPayment",
    icon: Banknote,
    group: "billing",
    order: 10,
    requiredPermissions: ["invoices.create", "operations.write"],
    permissionMode: "disable",
    dialog: "modal",
    surfaces: ["menu", "quickBar"],
    // Modal collects method/discount/tax; execute is a no-op fallback.
    visible: (runtime) => isBillingEnabled(runtime) && Boolean(runtime.row.customerId),
    enabled: (runtime) =>
      isBillingEnabled(runtime) &&
      Boolean(runtime.row.customerId) &&
      rowAmountCents(runtime.row) > 0 &&
      isPaymentIn(runtime, ["pending", "unpaid", "partial"]),
    execute: async () => {
      // Handled by CollectPaymentDialog via action engine modal flow.
    },
  },
  {
    id: "billing.generate_invoice",
    titleKey: "universalOperations.actions.items.generateInvoice",
    icon: FileText,
    group: "billing",
    order: 25,
    requiredPermissions: ["invoices.create", "operations.write"],
    permissionMode: "disable",
    surfaces: ["menu", "quickBar"],
    dialog: "confirm",
    visible: (runtime) => isBillingEnabled(runtime) && Boolean(runtime.row.customerId),
    enabled: (runtime) => Boolean(runtime.row.customerId) && rowAmountCents(runtime.row) > 0,
    execute: async (runtime) => {
      if (!runtime.row.customerId) return;
      const amountCents = rowAmountCents(runtime.row);
      if (amountCents <= 0) throw new Error("Service price is required before generating an invoice");
      const currency = String(runtime.row.values.currency ?? "USD");
      await runtime.commands.generateInvoice({
        customerId: runtime.row.customerId,
        amountCents,
        currency,
      });
    },
  },
  {
    id: "billing.refund",
    titleKey: "universalOperations.actions.items.refund",
    icon: RotateCcw,
    group: "billing",
    order: 20,
    requiredPermissions: ["payment.write"],
    clinicRoles: ["accountant", "manager"],
    permissionMode: "disable",
    comingSoon: true,
    visible: (runtime) => isBillingEnabled(runtime) && isPaymentIn(runtime, ["paid"]),
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
  {
    id: "billing.view_invoice",
    titleKey: "universalOperations.actions.items.viewInvoice",
    icon: FileText,
    group: "billing",
    order: 30,
    requiredPermissions: ["invoices.view", "invoice.write"],
    clinicRoles: ["accountant", "manager"],
    permissionMode: "disable",
    comingSoon: true,
    visible: (runtime) =>
      isBillingEnabled(runtime) && (hasOutstandingBalance(runtime.row) || isPaymentIn(runtime, ["paid", "partial", "unpaid", "pending"])),
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
  {
    id: "billing.print_receipt",
    titleKey: "universalOperations.actions.items.printReceipt",
    icon: Printer,
    group: "billing",
    order: 40,
    requiredPermissions: ["payment.write", "invoices.view", "operations.write"],
    clinicRoles: ["accountant", "reception", "manager"],
    permissionMode: "disable",
    supportedStatuses: ["completed"],
    comingSoon: true,
    surfaces: ["menu", "quickBar"],
    visible: (runtime) => isBillingEnabled(runtime) && isStatusIn(runtime, ["completed"]),
    enabled: () => false,
    execute: async () => {
      throw new Error("Coming soon");
    },
  },
];
