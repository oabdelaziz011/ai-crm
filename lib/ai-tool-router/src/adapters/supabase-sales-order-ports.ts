/**
 * Supabase ports for AI sales order tools.
 * Reuses CRM phone upsert + conversation stamping via ToolCustomerServicePort.
 * Keeps AI employee and human salesperson as separate attribution fields.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectivePrice } from "@workspace/product-platform";
import type { ToolCustomerServicePort } from "../tools/customer-service-port.js";
import type {
  CatalogPricedLine,
  CompanyOrderSettingsSnapshot,
  SalesOrderToolPorts,
} from "../tools/sales-order-ports.js";
import {
  buildCustomerPhoneIdentityColumns,
} from "../utils/customer-phone-identity-dual-write.js";
import { resolvePhoneIdentity } from "../utils/phone-identity-resolver.js";
import {
  buildWhatsAppSenderPhoneLookupVariants,
  resolveWhatsAppSenderPhoneE164,
} from "../utils/resolve-trusted-channel-customer.js";
import {
  findAllMatchingDeliveryZones,
  findMatchingDeliveryZone,
} from "../tools/delivery-zone-match.js";

const DEFAULT_REQUIRED_FIELDS: CompanyOrderSettingsSnapshot["requiredFields"] = {
  customerName: true,
  mobileNumber: true,
  governorate: true,
  cityArea: true,
  detailedAddress: true,
  deliveryNotes: false,
  deliveryLocation: false,
  secondaryPhone: true,
};

function readRequiredFields(raw: unknown): CompanyOrderSettingsSnapshot["requiredFields"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_REQUIRED_FIELDS };
  const row = raw as Record<string, unknown>;
  return {
    customerName: row.customerName !== false,
    mobileNumber: row.mobileNumber !== false,
    governorate: row.governorate !== false,
    cityArea: row.cityArea !== false,
    detailedAddress: row.detailedAddress !== false,
    deliveryNotes: row.deliveryNotes === true,
    deliveryLocation: row.deliveryLocation === true,
    secondaryPhone: row.secondaryPhone !== false,
  };
}


async function findCustomerByPhone(
  customerService: ToolCustomerServicePort,
  input: { companyId: string; userId: string; phone: string },
) {
  const phoneE164 =
    resolveWhatsAppSenderPhoneE164(input.phone) ||
    buildCustomerPhoneIdentityColumns({ phone: input.phone, source: "explicit" }).phone_e164;
  if (phoneE164) {
    const byE164 = await customerService.findCustomer({
      companyId: input.companyId,
      userId: input.userId,
      lookupBy: "phone_e164",
      lookupValue: phoneE164,
    });
    if (byE164.status === "found" && byE164.customer) return byE164;
    if (byE164.status === "duplicate") return byE164;
  }
  for (const variant of buildWhatsAppSenderPhoneLookupVariants(input.phone)) {
    const result = await customerService.findCustomer({
      companyId: input.companyId,
      userId: input.userId,
      lookupBy: "phone",
      lookupValue: variant,
    });
    if (result.status === "found" && result.customer) return result;
    if (result.status === "duplicate") return result;
  }
  return { status: "not_found" as const, count: 0 as const };
}

export type CreateSupabaseSalesOrderPortsOptions = {
  customerService: ToolCustomerServicePort;
  resolveActorUserIdForCompany?: (companyId: string) => Promise<string | null>;
  cancelFollowUpAfterPurchase?: (input: {
    companyId: string;
    leadId: string;
  }) => Promise<void>;
};

export function createSupabaseSalesOrderPorts(
  client: SupabaseClient,
  options: CreateSupabaseSalesOrderPortsOptions,
): SalesOrderToolPorts {
  const { customerService } = options;

  return {
    async loadOrderSettings(companyId) {
      const { data, error } = await client
        .from("company_order_settings")
        .select(
          "ai_order_collection_enabled, require_human_approval, payment_methods, required_fields",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        return {
          aiOrderCollectionEnabled: false,
          requireHumanApproval: true,
          paymentMethods: ["cash_on_delivery"],
          requiredFields: { ...DEFAULT_REQUIRED_FIELDS },
        };
      }
      return {
        aiOrderCollectionEnabled: data.ai_order_collection_enabled === true,
        requireHumanApproval: data.require_human_approval !== false,
        paymentMethods: Array.isArray(data.payment_methods)
          ? data.payment_methods.map(String)
          : ["cash_on_delivery"],
        requiredFields: readRequiredFields(data.required_fields),
      };
    },

    async findEnabledDeliveryZone({ companyId, governorate, zoneName }) {
      const { data, error } = await client
        .from("company_delivery_zones")
        .select(
          "id, governorate, zone_name, aliases, delivery_fee, eta_min, eta_max, eta_unit, enabled",
        )
        .eq("company_id", companyId)
        .eq("enabled", true);
      if (error) throw new Error(error.message);
      const candidates = (data ?? []).map((row) => ({
        id: String(row.id),
        governorate: String(row.governorate ?? ""),
        zoneName: String(row.zone_name ?? ""),
        aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
        delivery_fee: row.delivery_fee,
        eta_min: row.eta_min,
        eta_max: row.eta_max,
        eta_unit: row.eta_unit,
      }));
      const matches = findAllMatchingDeliveryZones(candidates, { governorate, zoneName });
      if (matches.length === 0) return { status: "none" as const };
      if (matches.length > 1) {
        return {
          status: "ambiguous" as const,
          candidates: matches.map((row) => ({
            id: row.id,
            governorate: row.governorate,
            zoneName: row.zoneName,
          })),
        };
      }
      const match = findMatchingDeliveryZone(candidates, { governorate, zoneName });
      if (!match) return { status: "none" as const };
      const fee = Number(match.delivery_fee);
      const etaMin = Number(match.eta_min);
      const etaMax = Number(match.eta_max);
      const etaUnit = match.eta_unit === "hours" ? "hours" : "days";
      if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(etaMin) || !Number.isFinite(etaMax)) {
        return { status: "none" as const };
      }
      return {
        status: "ok" as const,
        zone: {
          id: String(match.id),
          governorate: String(match.governorate),
          zoneName: String(match.zoneName),
          deliveryFee: fee,
          etaMin,
          etaMax,
          etaUnit,
        },
      };
    },

    async priceCatalogLines({ companyId, items }) {
      const lines: CatalogPricedLine[] = [];
      let currency = "";
      let subtotal = 0;
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      for (const item of items) {
        const key = String(item.productId ?? "").trim();
        let lookup = client
          .from("catalog_products")
          .select(
            "id, name, sku, base_price, currency, subscription_price, product_type, is_active, deleted_at",
          )
          .eq("company_id", companyId)
          .is("deleted_at", null);
        lookup = uuidRe.test(key) ? lookup.eq("id", key) : lookup.eq("sku", key);
        const { data: row, error } = await lookup.maybeSingle();
        if (error) throw new Error(error.message);
        if (!row || row.is_active !== true) {
          return { ok: false, reason: `Product not found or inactive: ${key}` };
        }
        const resolvedProductId = String(row.id);

        const { data: regionalRows, error: regionalError } = await client
          .from("product_regional_prices")
          .select("country, market, region, local_price, currency_override, is_active")
          .eq("company_id", companyId)
          .eq("product_id", resolvedProductId);
        if (regionalError) throw new Error(regionalError.message);

        const basePrice =
          row.product_type === "subscription" && row.subscription_price != null
            ? Number(row.subscription_price)
            : Number(row.base_price);
        const rowCurrency = typeof row.currency === "string" ? row.currency : "";
        if (!Number.isFinite(basePrice) || basePrice <= 0 || !rowCurrency) {
          return { ok: false, reason: `Catalog price unavailable for product ${key}` };
        }

        const priced = resolveEffectivePrice({
          basePrice,
          currency: rowCurrency,
          regionalPrices: (regionalRows ?? []).map((r, i) => ({
            id: String(i),
            companyId,
            productId: resolvedProductId,
            country: r.country ?? null,
            market: r.market ?? null,
            region: r.region ?? null,
            localPrice: Number(r.local_price),
            currencyOverride: r.currency_override ?? null,
            isActive: r.is_active === true,
            createdAt: "",
            updatedAt: "",
          })),
          country: null,
          market: null,
        });
        if (!Number.isFinite(priced.unitPrice) || priced.unitPrice <= 0) {
          return { ok: false, reason: `Catalog price unavailable for product ${key}` };
        }
        if (currency && currency !== priced.currency) {
          return { ok: false, reason: "Order items must share one currency." };
        }
        currency = priced.currency;
        const lineTotal = Number((priced.unitPrice * item.quantity).toFixed(2));
        subtotal = Number((subtotal + lineTotal).toFixed(2));
        lines.push({
          productId: resolvedProductId,
          productName: String(row.name ?? "").trim() || "Product",
          productSku: typeof row.sku === "string" ? row.sku : "",
          quantity: item.quantity,
          unitPrice: priced.unitPrice,
          lineTotal,
          currency: priced.currency,
        });
      }
      return { ok: true, lines, currency: currency || "EGP", subtotal };
    },

    async loadConversationAttribution({ companyId, conversationId, aiAssistantIdHint }) {
      const { data, error } = await client
        .from("conversations")
        .select(
          "ai_assistant_id, assigned_user_id, channel_type, lead_id, customer_id, company_channel_id, metadata",
        )
        .eq("id", conversationId)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);

      let leadId = data?.lead_id ? String(data.lead_id) : null;
      let assignedSalespersonId = data?.assigned_user_id ? String(data.assigned_user_id) : null;

      if (leadId) {
        const { data: lead, error: leadError } = await client
          .from("leads")
          .select("id, assigned_user_id")
          .eq("id", leadId)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .maybeSingle();
        if (leadError) throw new Error(leadError.message);
        if (lead && !assignedSalespersonId && lead.assigned_user_id) {
          assignedSalespersonId = String(lead.assigned_user_id);
        }
      }

      const meta =
        data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      const metaEmployeeId =
        typeof meta.aiEmployeeId === "string" && meta.aiEmployeeId.trim()
          ? meta.aiEmployeeId.trim()
          : typeof meta.ai_employee_id === "string" && meta.ai_employee_id.trim()
            ? meta.ai_employee_id.trim()
            : null;

      let channelEmployeeId: string | null = null;
      if (data?.company_channel_id) {
        const { data: channel, error: channelError } = await client
          .from("company_channels")
          .select("id, assigned_ai_employee_id")
          .eq("id", data.company_channel_id)
          .eq("company_id", companyId)
          .maybeSingle();
        // assigned_ai_employee_id may be absent on older local DBs — do not fail order create.
        if (!channelError && channel?.assigned_ai_employee_id) {
          channelEmployeeId = String(channel.assigned_ai_employee_id);
        }
      }

      const candidates = [
        typeof aiAssistantIdHint === "string" && aiAssistantIdHint.trim()
          ? aiAssistantIdHint.trim()
          : null,
        metaEmployeeId,
        channelEmployeeId,
      ].filter((value): value is string => Boolean(value));

      let aiEmployeeId: string | null = null;
      for (const candidate of candidates) {
        const { data: employee, error: employeeError } = await client
          .from("ai_employees")
          .select("id")
          .eq("id", candidate)
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .maybeSingle();
        if (employeeError) throw new Error(employeeError.message);
        if (employee?.id) {
          aiEmployeeId = String(employee.id);
          break;
        }
      }

      // Never conflate AI employee with human salesperson.
      if (assignedSalespersonId && aiEmployeeId && assignedSalespersonId === aiEmployeeId) {
        assignedSalespersonId = null;
      }

      return {
        aiEmployeeId,
        assignedSalespersonId,
        sourceChannel: typeof data?.channel_type === "string" ? data.channel_type : "",
        leadId,
        existingCustomerId: data?.customer_id ? String(data.customer_id) : null,
      };
    },

    async upsertCustomerByPhone(input) {
      let actorUserId = input.userId?.trim() || "";
      if (!actorUserId && options.resolveActorUserIdForCompany) {
        actorUserId = (await options.resolveActorUserIdForCompany(input.companyId))?.trim() || "";
      }
      if (!actorUserId) {
        throw new Error("An authenticated actor is required to upsert the CRM customer.");
      }

      const phone = input.phone.trim();
      const existing = await findCustomerByPhone(customerService, {
        companyId: input.companyId,
        userId: actorUserId,
        phone,
      });
      if (existing.status === "duplicate") {
        throw new Error("Multiple customers match this phone. A human must resolve the duplicate.");
      }

      let customerId = "";
      let created = false;
      if (existing.status === "found" && existing.customer) {
        customerId = existing.customer.id;
        if (
          input.name.trim() &&
          existing.customer.name.trim().toLowerCase() !== input.name.trim().toLowerCase() &&
          customerService.updateCustomerName
        ) {
          await customerService.updateCustomerName({
            companyId: input.companyId,
            userId: actorUserId,
            customerId,
            name: input.name.trim(),
          });
        }
      } else {
        const resolved = resolvePhoneIdentity({ phone, source: "explicit" });
        const phoneIdentity =
          resolved.status === "resolved"
            ? buildCustomerPhoneIdentityColumns({ phone, source: "explicit" })
            : buildCustomerPhoneIdentityColumns({ phone, source: "explicit" });
        const channelType = await customerService.getConversationChannelType?.({
          conversationId: input.conversationId,
        });
        const source =
          channelType === "web_chat"
            ? "website"
            : channelType === "whatsapp"
              ? "whatsapp"
              : channelType === "messenger"
                ? "messenger"
                : channelType === "instagram"
                  ? "instagram"
                  : channelType === "email"
                    ? "email"
                    : channelType === "sms"
                      ? "sms"
                      : "manual";
        const createdRow = await customerService.createCustomer({
          companyId: input.companyId,
          userId: actorUserId,
          name: input.name.trim(),
          phone,
          email: input.email?.trim() || null,
          source,
          phoneIdentity,
        });
        customerId = createdRow.customer.id;
        created = true;
      }

      await customerService.linkConversationCustomer?.({
        conversationId: input.conversationId,
        customerId,
        customerName: input.name.trim(),
        stampTrustedIdentity: true,
      });

      const deliveryPatch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (input.secondaryPhone?.trim()) {
        deliveryPatch.secondary_phone = input.secondaryPhone.trim();
        deliveryPatch.secondary_phone_e164 = input.secondaryPhone.trim();
      }
      if (input.deliveryAddress?.trim()) deliveryPatch.delivery_address = input.deliveryAddress.trim();
      if (input.deliveryGovernorate?.trim()) {
        deliveryPatch.delivery_governorate = input.deliveryGovernorate.trim();
      }
      if (input.deliveryCityArea?.trim()) {
        deliveryPatch.delivery_city_area = input.deliveryCityArea.trim();
      }
      if (typeof input.deliveryLat === "number" && Number.isFinite(input.deliveryLat)) {
        deliveryPatch.delivery_lat = input.deliveryLat;
      }
      if (typeof input.deliveryLng === "number" && Number.isFinite(input.deliveryLng)) {
        deliveryPatch.delivery_lng = input.deliveryLng;
      }
      if (input.deliveryLocationUrl?.trim()) {
        deliveryPatch.delivery_location_url = input.deliveryLocationUrl.trim();
      }
      if (Object.keys(deliveryPatch).length > 1) {
        const { error: deliveryError } = await client
          .from("customers")
          .update(deliveryPatch)
          .eq("id", customerId)
          .eq("company_id", input.companyId);
        if (deliveryError) {
          // Best-effort CRM enrichment; order creation must still proceed.
        }
      }

      return { customerId, created };
    },

    async nextOrderNumber(companyId) {
      const prefix = `SO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-`;
      const { count, error } = await client
        .from("sales_orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .like("order_number", `${prefix}%`);
      if (error) throw new Error(error.message);
      const seq = String((count ?? 0) + 1).padStart(4, "0");
      return `${prefix}${seq}`;
    },

    async createSalesOrder(input) {
      if (input.confirmationFingerprint) {
        const { data: existing, error: existingError } = await client
          .from("sales_orders")
          .select("id, order_number, status, customer_id")
          .eq("company_id", input.companyId)
          .eq("confirmation_fingerprint", input.confirmationFingerprint)
          .maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if (existing) {
          return {
            orderId: String(existing.id),
            orderNumber: String(existing.order_number),
            status: String(existing.status),
            customerId: existing.customer_id ? String(existing.customer_id) : input.customerId,
            alreadyExisted: true,
          };
        }
      }

      const { data: order, error: orderError } = await client
        .from("sales_orders")
        .insert({
          company_id: input.companyId,
          order_number: input.orderNumber,
          status: input.status,
          payment_method: "cash_on_delivery",
          customer_id: input.customerId,
          customer_name: input.customerName,
          customer_phone: input.customerPhone,
          customer_email: input.customerEmail,
          preferred_language: input.preferredLanguage,
          conversation_id: input.conversationId,
          delivery_zone_id: input.deliveryZoneId,
          delivery_governorate: input.deliveryGovernorate,
          delivery_city_area: input.deliveryCityArea,
          delivery_address: input.deliveryAddress,
          delivery_notes: input.deliveryNotes,
          delivery_lat: input.deliveryLat,
          delivery_lng: input.deliveryLng,
          delivery_location_url: input.deliveryLocationUrl,
          customer_secondary_phone: input.customerSecondaryPhone,
          eta_min_snapshot: input.etaMinSnapshot,
          eta_max_snapshot: input.etaMaxSnapshot,
          eta_unit_snapshot: input.etaUnitSnapshot,
          delivery_fee: input.deliveryFee,
          subtotal: input.subtotal,
          total_amount: input.totalAmount,
          currency: input.currency,
          require_human_approval: input.requireHumanApproval,
          source_channel: input.sourceChannel,
          payment_status: input.paymentStatus,
          ai_employee_id: input.aiEmployeeId,
          assigned_salesperson_id: input.assignedSalespersonId,
          created_by_ai: input.createdByAi,
          confirmation_fingerprint: input.confirmationFingerprint,
          created_by: input.actorUserId,
          updated_by: input.actorUserId,
        })
        .select("id, order_number, status, customer_id")
        .single();
      if (orderError) {
        if (/confirmation_fingerprint|duplicate key/i.test(orderError.message)) {
          const { data: raced } = await client
            .from("sales_orders")
            .select("id, order_number, status, customer_id")
            .eq("company_id", input.companyId)
            .eq("confirmation_fingerprint", input.confirmationFingerprint)
            .maybeSingle();
          if (raced) {
            return {
              orderId: String(raced.id),
              orderNumber: String(raced.order_number),
              status: String(raced.status),
              customerId: raced.customer_id ? String(raced.customer_id) : input.customerId,
              alreadyExisted: true,
            };
          }
        }
        throw new Error(orderError.message);
      }

      const orderId = String(order.id);
      const itemRows = input.items.map((line, index) => ({
        company_id: input.companyId,
        order_id: orderId,
        product_id: line.productId,
        product_name: line.productName,
        product_sku: line.productSku,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        line_total: line.lineTotal,
        sort_order: index,
      }));
      const { error: itemsError } = await client.from("sales_order_items").insert(itemRows);
      if (itemsError) throw new Error(itemsError.message);

      const { error: eventError } = await client.from("sales_order_status_events").insert({
        company_id: input.companyId,
        order_id: orderId,
        from_status: null,
        to_status: input.status,
        note: input.createdByAi
          ? "Created by AI after explicit customer confirmation"
          : "Sales order created",
        changed_by: input.actorUserId,
      });
      if (eventError) throw new Error(eventError.message);

      return {
        orderId,
        orderNumber: String(order.order_number),
        status: String(order.status),
        customerId: order.customer_id ? String(order.customer_id) : input.customerId,
        alreadyExisted: false,
      };
    },

    cancelFollowUpAfterPurchase: options.cancelFollowUpAfterPurchase,
  };
}
