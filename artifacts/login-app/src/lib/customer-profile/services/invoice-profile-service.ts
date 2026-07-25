import type { Customer } from "@/lib/types";

export type InvoiceModalPrefill = {
  customerId: string;
  companyId?: string | null;
};

export class InvoiceProfileService {
  static buildModalPrefill(
    customer: Customer,
    companyId?: string | null,
  ): InvoiceModalPrefill {
    return {
      customerId: customer.id,
      companyId: companyId ?? null,
    };
  }
}
