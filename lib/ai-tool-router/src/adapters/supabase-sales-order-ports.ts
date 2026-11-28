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
import {
  buildCancellationNotificationRow,
  insertIdempotentCancellationNotification,
} from "../tools/cancellation-notification-helper.js";

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
  notifyCancellationWorkerWhatsApp?: (input: {
    companyId: string;
    orderId: string;
    workerPhone: string;
    message: string;
    idempotencyKey: string;
  }) => Promise<{ ok: boolean; messageId?: string | null; error?: string | null }>;
};

export function createSupabaseSalesOrderPorts(
  client: SupabaseClient,
  options: CreateSupabaseSalesOrderPortsOptions,
): SalesOrderToolPorts {
  const { customerService } = options;

  async function resolveConversationCustomerPhone(input: {
    companyId: string;
    conversationId: string;
  }): Promise<string | null> {
    const { data: conv } = await client
      .from("conversations")
      .select("customer_id, metadata")
      .eq("id", input.conversationId)
      .eq("company_id", input.companyId)
      .maybeSingle();
    if (conv?.customer_id) {
      const { data: cust } = await client
        .from("customers")
        .select("phone, phone_e164")
        .eq("id", conv.customer_id)
        .eq("company_id", input.companyId)
        .maybeSingle();
      const phone = String(cust?.phone_e164 || cust?.phone || "").trim();
      if (phone) return phone;
    }
    const { data: latest } = await client
      .from("sales_orders")
      .select("customer_phone")
      .eq("company_id", input.companyId)
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return latest?.customer_phone ? String(latest.customer_phone) : null;
  }

  return {
    async loadOrderSettings(companyId) {
      const { data, error } = await client
        .from("company_order_settings")
        .select(
          "ai_order_collection_enabled, require_human_approval, notify_on_pending_approval, payment_methods, required_fields",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        return {
          aiOrderCollectionEnabled: false,
          requireHumanApproval: true,
          notifyOnPendingApproval: true,
          paymentMethods: ["cash_on_delivery"],
          requiredFields: { ...DEFAULT_REQUIRED_FIELDS },
        };
      }
      return {
        aiOrderCollectionEnabled: data.ai_order_collection_enabled === true,
        requireHumanApproval: data.require_human_approval !== false,
        notifyOnPendingApproval: data.notify_on_pending_approval !== false,
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

    resolveConversationCustomerPhone,

    async listCustomerActiveOrders(input) {
      const phoneVariants = [
        ...new Set(
          [
            input.customerPhone,
            ...buildWhatsAppSenderPhoneLookupVariants(input.customerPhone),
            resolveWhatsAppSenderPhoneE164(input.customerPhone) || "",
          ]
            .map((p) => String(p || "").trim())
            .filter(Boolean),
        ),
      ];
      let query = client
        .from("sales_orders")
        .select(
          "id, order_number, status, total_amount, currency, customer_name, customer_phone",
        )
        .eq("company_id", input.companyId)
        .in("customer_phone", phoneVariants.length ? phoneVariants : [input.customerPhone])
        .in("status", input.statuses)
        .order("created_at", { ascending: false })
        .limit(20);
      if (input.orderNumber?.trim()) {
        query = query.ilike("order_number", input.orderNumber.trim());
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const ids = rows.map((r) => String(r.id));
      const pending = new Set<string>();
      const rejected = new Map<string, string>();
      if (ids.length) {
        const { data: reqs } = await client
          .from("sales_order_cancellation_requests")
          .select("order_id, status, decision_reason, decided_at")
          .eq("company_id", input.companyId)
          .in("order_id", ids)
          .in("status", ["pending", "rejected"])
          .order("requested_at", { ascending: false });
        for (const r of reqs ?? []) {
          const oid = String(r.order_id);
          if (r.status === "pending") pending.add(oid);
          else if (r.status === "rejected" && !rejected.has(oid)) {
            rejected.set(oid, String(r.decision_reason || "Cancellation was not approved."));
          }
        }
      }
      return rows.map((r) => ({
        id: String(r.id),
        orderNumber: String(r.order_number),
        status: String(r.status),
        totalAmount: Number(r.total_amount ?? 0),
        currency: String(r.currency ?? "EGP"),
        customerName: String(r.customer_name ?? ""),
        customerPhone: String(r.customer_phone ?? ""),
        hasPendingCancellationRequest: pending.has(String(r.id)),
        latestRejectionReason: rejected.get(String(r.id)) ?? null,
      }));
    },

    async executeCustomerDirectCancellation(input) {
      const { data: order, error } = await client
        .from("sales_orders")
        .select(
          "id, status, customer_phone, customer_name, order_number, assigned_delivery_worker_id, assigned_salesperson_id, conversation_id",
        )
        .eq("company_id", input.companyId)
        .eq("id", input.orderId)
        .maybeSingle();
      if (error) return { ok: false as const, code: "order_not_found", reason: error.message };
      if (!order) return { ok: false as const, code: "order_not_found", reason: "Order not found." };

      const trustedPhone =
        String(input.customerPhone || "").trim() ||
        (await resolveConversationCustomerPhone({
          companyId: input.companyId,
          conversationId: input.conversationId,
        })) ||
        "";
      if (trustedPhone) {
        const orderPhone = String(order.customer_phone || "").replace(/[^\d+]/g, "");
        const variants = new Set(
          [
            trustedPhone,
            ...buildWhatsAppSenderPhoneLookupVariants(trustedPhone),
            resolveWhatsAppSenderPhoneE164(trustedPhone) || "",
          ]
            .map((p) => p.replace(/[^\d+]/g, ""))
            .filter(Boolean),
        );
        if (orderPhone && !variants.has(orderPhone)) {
          return {
            ok: false as const,
            code: "ownership_verification_required",
            reason: "Order does not belong to this customer.",
          };
        }
      }

      if (!["pending_approval", "confirmed"].includes(String(order.status))) {
        return {
          ok: false as const,
          code: "order_state_changed",
          reason: `Order status is now ${order.status}; direct cancellation is no longer available.`,
        };
      }
      const fromStatus = String(order.status);
      const now = new Date().toISOString();
      const notifyKey = order.assigned_delivery_worker_id
        ? `order-cancel:${input.orderId}:${order.assigned_delivery_worker_id}`
        : null;
      const { data: updated, error: updError } = await client
        .from("sales_orders")
        .update({
          status: "cancelled",
          cancelled_at: now,
          cancellation_source: "customer",
          cancellation_reason: input.reason,
          cancelled_from_status: fromStatus,
          updated_at: now,
          cancellation_notify_status: order.assigned_delivery_worker_id ? "pending" : "skipped",
          cancellation_notify_idempotency_key: notifyKey,
        })
        .eq("company_id", input.companyId)
        .eq("id", input.orderId)
        .eq("status", fromStatus)
        .select("id");
      if (updError) return { ok: false as const, code: "order_state_changed", reason: updError.message };
      if (!updated?.length) {
        return {
          ok: false as const,
          code: "order_state_changed",
          reason: "Order status changed before cancellation could complete.",
        };
      }
      await client.from("sales_order_status_events").insert({
        company_id: input.companyId,
        order_id: input.orderId,
        from_status: fromStatus,
        to_status: "cancelled",
        note: input.reason
          ? `Cancelled by customer. Reason: ${input.reason}`
          : "Cancelled by customer",
        changed_by: null,
      });
      // Best-effort idempotent in-app notification (correct schema + unique idempotency_key).
      try {
        const recipients: string[] = [];
        if (order.assigned_salesperson_id) recipients.push(String(order.assigned_salesperson_id));
        if (!recipients.length) {
          const { data: profiles } = await client
            .from("profiles")
            .select("id")
            .eq("company_id", input.companyId)
            .limit(5);
          for (const p of profiles ?? []) recipients.push(String(p.id));
        }
        const detail = `Order ${order.order_number} (${order.customer_name || "customer"}) was cancelled by the customer. Previous status: ${fromStatus}.${input.reason ? ` Reason: ${input.reason}` : ""}`;
        for (const userId of [...new Set(recipients)].slice(0, 5)) {
          const idem = `order-cancel-notice:${input.orderId}:${fromStatus}:${userId}`;
          await insertIdempotentCancellationNotification(
            client,
            buildCancellationNotificationRow({
              companyId: input.companyId,
              userId,
              kind: "completed",
              detail,
              idempotencyKey: idem,
              orderId: input.orderId,
              orderNumber: String(order.order_number),
              extraParams: {
                cancellationSource: "customer",
                previousStatus: fromStatus,
              },
            }),
          );
        }
      } catch {
        /* non-blocking */
      }

      let workerNotify: {
        workerPhone: string;
        message: string;
        idempotencyKey: string;
      } | null = null;
      if (order.assigned_delivery_worker_id && notifyKey) {
        const { data: worker } = await client
          .from("company_delivery_workers")
          .select("phone_e164, full_name")
          .eq("id", order.assigned_delivery_worker_id)
          .eq("company_id", input.companyId)
          .maybeSingle();
        const workerPhone = String(worker?.phone_e164 || "").trim();
        if (workerPhone) {
          const lines = [
            "Order Cancellation Notice",
            "",
            `Order: ${order.order_number}`,
            `Customer: ${order.customer_name || "—"}`,
            "",
            "This order has been cancelled by the customer.",
            "",
            "Please do not proceed with preparation or delivery.",
          ];
          if (input.reason?.trim()) {
            lines.push("", `Reason: ${input.reason.trim()}`);
          }
          workerNotify = {
            workerPhone,
            message: lines.join("\n"),
            idempotencyKey: notifyKey,
          };
        }
      }
      return { ok: true as const, workerNotify };
    },

    notifyCancellationWorkerWhatsApp: options.notifyCancellationWorkerWhatsApp
      ? async (input) => {
          const result = await options.notifyCancellationWorkerWhatsApp!(input);
          const now = new Date().toISOString();
          try {
            if (result.ok) {
              await client
                .from("sales_orders")
                .update({
                  cancellation_notify_status: "sent",
                  cancellation_notify_message_id: result.messageId ?? null,
                  cancellation_notify_error: null,
                  cancellation_notify_attempted_at: now,
                })
                .eq("company_id", input.companyId)
                .eq("id", input.orderId)
                .eq("cancellation_notify_idempotency_key", input.idempotencyKey);
            } else {
              await client
                .from("sales_orders")
                .update({
                  cancellation_notify_status: "failed",
                  cancellation_notify_error: result.error || "WhatsApp notify failed",
                  cancellation_notify_attempted_at: now,
                })
                .eq("company_id", input.companyId)
                .eq("id", input.orderId)
                .eq("cancellation_notify_idempotency_key", input.idempotencyKey);
            }
          } catch {
            /* non-blocking */
          }
          return result;
        }
      : undefined,

    async createCustomerCancellationRequest(input) {
      const { data: order, error } = await client
        .from("sales_orders")
        .select("id, status, customer_phone, customer_name, customer_id, order_number, assigned_salesperson_id")
        .eq("company_id", input.companyId)
        .eq("id", input.orderId)
        .maybeSingle();
      if (error || !order) {
        return { ok: false as const, code: "order_not_found", reason: "Order not found." };
      }
      const trustedPhone =
        (await resolveConversationCustomerPhone({
          companyId: input.companyId,
          conversationId: input.conversationId,
        })) || "";
      if (trustedPhone) {
        const orderPhone = String(order.customer_phone || "").replace(/[^\d+]/g, "");
        const variants = new Set(
          [
            trustedPhone,
            ...buildWhatsAppSenderPhoneLookupVariants(trustedPhone),
            resolveWhatsAppSenderPhoneE164(trustedPhone) || "",
          ]
            .map((p) => p.replace(/[^\d+]/g, ""))
            .filter(Boolean),
        );
        if (orderPhone && !variants.has(orderPhone)) {
          return {
            ok: false as const,
            code: "ownership_verification_required",
            reason: "Order does not belong to this customer.",
          };
        }
      }
      if (!["processing", "out_for_delivery"].includes(String(order.status))) {
        return {
          ok: false as const,
          code: "order_state_changed",
          reason: `Order status is now ${order.status}; a cancellation request is not available.`,
        };
      }
      const { data: existing } = await client
        .from("sales_order_cancellation_requests")
        .select("id")
        .eq("order_id", input.orderId)
        .eq("status", "pending")
        .maybeSingle();
      if (existing?.id) {
        return { ok: true as const, requestId: String(existing.id) };
      }
      const idem = `order-cancel-request:${input.orderId}`;
      const conversationId =
        typeof input.conversationId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          input.conversationId,
        )
          ? input.conversationId
          : null;
      const { data: req, error: reqError } = await client
        .from("sales_order_cancellation_requests")
        .insert({
          company_id: input.companyId,
          order_id: input.orderId,
          status: "pending",
          source: "customer",
          reason: input.reason,
          order_status_at_request: order.status,
          customer_id: order.customer_id,
          customer_phone: order.customer_phone ?? "",
          conversation_id: conversationId,
          notification_idempotency_key: idem,
        })
        .select("id")
        .single();
      if (reqError) {
        if (/unique|duplicate/i.test(reqError.message)) {
          const { data: again } = await client
            .from("sales_order_cancellation_requests")
            .select("id")
            .eq("order_id", input.orderId)
            .eq("status", "pending")
            .maybeSingle();
          if (again?.id) return { ok: true as const, requestId: String(again.id) };
        }
        return { ok: false as const, code: "cancellation_not_allowed", reason: reqError.message };
      }
      try {
        const recipients: string[] = [];
        if (order.assigned_salesperson_id) recipients.push(String(order.assigned_salesperson_id));
        if (!recipients.length) {
          const { data: profiles } = await client
            .from("profiles")
            .select("id")
            .eq("company_id", input.companyId)
            .limit(5);
          for (const p of profiles ?? []) recipients.push(String(p.id));
        }
        const detail = `Order ${order.order_number} (${order.customer_name || "customer"}) requested cancellation while status was ${order.status}.${input.reason ? ` Reason: ${input.reason}` : ""}`;
        for (const userId of [...new Set(recipients)].slice(0, 5)) {
          await insertIdempotentCancellationNotification(
            client,
            buildCancellationNotificationRow({
              companyId: input.companyId,
              userId,
              kind: "request_pending",
              detail,
              idempotencyKey: `${idem}:${userId}`,
              orderId: input.orderId,
              orderNumber: String(order.order_number),
              extraParams: { requestId: String(req.id) },
            }),
          );
        }
      } catch {
        /* non-blocking */
      }
      return { ok: true as const, requestId: String(req.id) };
    },
  };
}
