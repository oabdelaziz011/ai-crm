import { getSchedulingServices } from "@/lib/scheduling";
import type { SchedulingService } from "@/lib/scheduling/types";

export type ServiceCommercialEdit = {
  serviceId: string;
  name: string;
  status: SchedulingService["status"];
  category: string | null;
  description: string | null;
  currency: string;
  price: number;
  durationMinutes: number;
};

export async function persistServiceCommercialEdits(
  companyId: string,
  userId: string,
  edits: ServiceCommercialEdit[],
): Promise<void> {
  if (edits.length === 0) return;
  const api = getSchedulingServices();
  for (const edit of edits) {
    const rules = await api.servicePricing.listRules(companyId, edit.serviceId);
    if (rules.length === 0) {
      await api.serviceCatalog.update(edit.serviceId, companyId, userId, {
        name: edit.name,
        status: edit.status,
        category: edit.category,
        description: edit.description,
        service_kind: "operational",
        price: edit.price,
        duration_minutes: edit.durationMinutes,
        currency: edit.currency,
      });
      continue;
    }
    await api.servicePricing.saveRules(
      companyId,
      edit.serviceId,
      userId,
      rules.map((rule) => ({
        id: rule.id,
        typeId: rule.type_id,
        price: rule.is_default ? edit.price : rule.price_cents / 100,
        currency: rule.currency,
        durationMinutes: rule.is_default ? edit.durationMinutes : rule.duration_minutes,
        isDefault: rule.is_default,
        description: rule.description,
      })),
    );
  }
}
