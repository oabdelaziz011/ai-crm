import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscountValidation } from "@/lib/billing/types/financial-types";
import { applyPercentageDiscount, clampCents } from "@/lib/billing/utilities/money";

/** Discount and coupon validation engine. */
export class DiscountEngineService {
  constructor(private readonly client: SupabaseClient) {}

  async validate(
    companyId: string,
    code: string,
    subtotalCents: number,
  ): Promise<DiscountValidation> {
    const { data, error } = await this.client
      .from("discount_codes")
      .select("*")
      .eq("company_id", companyId)
      .ilike("code", code)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { valid: false, discountCents: 0, error: "Invalid discount code" };

    if (data.expires_at && new Date(String(data.expires_at)) < new Date()) {
      return { valid: false, discountCents: 0, error: "Discount code expired" };
    }

    if (data.max_uses !== null && Number(data.used_count) >= Number(data.max_uses)) {
      return { valid: false, discountCents: 0, error: "Discount usage limit reached" };
    }

    const discountType = String(data.discount_type);
    const value = Number(data.value);
    let discountCents = 0;

    if (discountType === "percentage") {
      discountCents = applyPercentageDiscount(subtotalCents, value);
    } else {
      discountCents = clampCents(Math.round(value * 100), 0, subtotalCents);
    }

    return {
      valid: true,
      discountCents,
      discountId: String(data.id),
    };
  }

  async recordRedemption(
    companyId: string,
    discountId: string,
    invoiceId: string,
    amountCents: number,
  ): Promise<void> {
    const { error: redemptionError } = await this.client.from("discount_redemptions").insert({
      company_id: companyId,
      discount_id: discountId,
      invoice_id: invoiceId,
      amount_cents: amountCents,
    });
    if (redemptionError) throw new Error(redemptionError.message);

    const { data: current } = await this.client
      .from("discount_codes")
      .select("used_count")
      .eq("id", discountId)
      .single();
    if (current) {
      await this.client
        .from("discount_codes")
        .update({ used_count: Number(current.used_count) + 1 })
        .eq("id", discountId);
    }
  }
}
