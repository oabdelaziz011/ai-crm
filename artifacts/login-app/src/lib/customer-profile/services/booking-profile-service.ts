import type { Customer } from "@/lib/types";

export type BookingModalPrefill = {
  customerId: string;
  customerName: string;
  phone: string | null;
  companyId?: string | null;
};

export class BookingProfileService {
  static buildModalPrefill(
    customer: Customer,
    companyId?: string | null,
  ): BookingModalPrefill {
    return {
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      companyId: companyId ?? null,
    };
  }
}
