/**
 * Company-level AI order collection + approval settings (settings phase only).
 * Isolated from sales_follow_up_* — no order runtime or channel side effects here.
 */

export const ORDER_PAYMENT_METHODS = ["cash_on_delivery"] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

export type OrderRequiredFields = {
  customerName: boolean;
  mobileNumber: boolean;
  governorate: boolean;
  cityArea: boolean;
  detailedAddress: boolean;
  deliveryNotes: boolean;
  /** Maps link or coordinates — configurable required. */
  deliveryLocation: boolean;
  /** Always optional in the journey; toggle only controls whether AI asks. */
  secondaryPhone: boolean;
};

export const DELIVERY_ASSIGNMENT_MODES = ["manual", "ai"] as const;
export type DeliveryAssignmentMode = (typeof DELIVERY_ASSIGNMENT_MODES)[number];

export type CompanyOrderSettingsFormValues = {
  aiOrderCollectionEnabled: boolean;
  paymentMethods: OrderPaymentMethod[];
  requiredFields: OrderRequiredFields;
  requireHumanApproval: boolean;
  defaultReviewerProfileId: string | null;
  notifyOnPendingApproval: boolean;
  /** manual = human assigns on sales order details; ai = auto-assign after confirm. */
  deliveryAssignmentMode: DeliveryAssignmentMode;
};

export const DEFAULT_ORDER_REQUIRED_FIELDS: OrderRequiredFields = {
  customerName: true,
  mobileNumber: true,
  governorate: true,
  cityArea: true,
  detailedAddress: true,
  deliveryNotes: false,
  deliveryLocation: false,
  secondaryPhone: true,
};

export const DEFAULT_COMPANY_ORDER_SETTINGS: CompanyOrderSettingsFormValues = {
  aiOrderCollectionEnabled: false,
  paymentMethods: ["cash_on_delivery"],
  requiredFields: { ...DEFAULT_ORDER_REQUIRED_FIELDS },
  requireHumanApproval: true,
  defaultReviewerProfileId: null,
  notifyOnPendingApproval: true,
  deliveryAssignmentMode: "manual",
};

export type CompanyOrderConfigState = "unconfigured" | "configured";

export function companyOrderConfigState(
  row: { company_id?: string | null } | null | undefined,
): CompanyOrderConfigState {
  return row?.company_id ? "configured" : "unconfigured";
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeRequiredFields(raw: unknown): OrderRequiredFields {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    customerName: asBoolean(obj.customerName, DEFAULT_ORDER_REQUIRED_FIELDS.customerName),
    mobileNumber: asBoolean(obj.mobileNumber, DEFAULT_ORDER_REQUIRED_FIELDS.mobileNumber),
    governorate: asBoolean(obj.governorate, DEFAULT_ORDER_REQUIRED_FIELDS.governorate),
    cityArea: asBoolean(obj.cityArea, DEFAULT_ORDER_REQUIRED_FIELDS.cityArea),
    detailedAddress: asBoolean(obj.detailedAddress, DEFAULT_ORDER_REQUIRED_FIELDS.detailedAddress),
    deliveryNotes: asBoolean(obj.deliveryNotes, DEFAULT_ORDER_REQUIRED_FIELDS.deliveryNotes),
    deliveryLocation: asBoolean(obj.deliveryLocation, DEFAULT_ORDER_REQUIRED_FIELDS.deliveryLocation),
    secondaryPhone: asBoolean(obj.secondaryPhone, DEFAULT_ORDER_REQUIRED_FIELDS.secondaryPhone),
  };
}

function normalizePaymentMethods(raw: unknown): OrderPaymentMethod[] {
  const list = Array.isArray(raw) ? raw : [];
  const allowed = list.filter((item): item is OrderPaymentMethod =>
    (ORDER_PAYMENT_METHODS as readonly string[]).includes(String(item)),
  );
  return allowed.length > 0 ? [...new Set(allowed)] : ["cash_on_delivery"];
}

function normalizeDeliveryAssignmentMode(raw: unknown): DeliveryAssignmentMode {
  return raw === "ai" ? "ai" : "manual";
}

export function normalizeCompanyOrderSettings(
  row: Partial<{
    ai_order_collection_enabled: boolean | null;
    payment_methods: string[] | null;
    required_fields: OrderRequiredFields | Record<string, unknown> | null;
    require_human_approval: boolean | null;
    default_reviewer_profile_id: string | null;
    notify_on_pending_approval: boolean | null;
    delivery_assignment_mode: string | null;
  }> | null,
): CompanyOrderSettingsFormValues {
  if (!row) return { ...DEFAULT_COMPANY_ORDER_SETTINGS, requiredFields: { ...DEFAULT_ORDER_REQUIRED_FIELDS } };
  return {
    aiOrderCollectionEnabled: row.ai_order_collection_enabled === true,
    paymentMethods: normalizePaymentMethods(row.payment_methods),
    requiredFields: normalizeRequiredFields(row.required_fields),
    requireHumanApproval: row.require_human_approval !== false,
    defaultReviewerProfileId:
      typeof row.default_reviewer_profile_id === "string" && row.default_reviewer_profile_id.trim()
        ? row.default_reviewer_profile_id.trim()
        : null,
    notifyOnPendingApproval: row.notify_on_pending_approval !== false,
    deliveryAssignmentMode: normalizeDeliveryAssignmentMode(row.delivery_assignment_mode),
  };
}

export function validateCompanyOrderSettings(values: CompanyOrderSettingsFormValues): string | null {
  if (!values.paymentMethods?.length) return "payment_methods_required";
  for (const method of values.paymentMethods) {
    if (!(ORDER_PAYMENT_METHODS as readonly string[]).includes(method)) {
      return "payment_method_unsupported";
    }
  }
  if (values.aiOrderCollectionEnabled && !values.paymentMethods.includes("cash_on_delivery")) {
    return "cod_required_when_enabled";
  }
  return null;
}

export function companyOrderSettingsToRow(companyId: string, values: CompanyOrderSettingsFormValues) {
  const paymentMethods = normalizePaymentMethods(values.paymentMethods);
  return {
    company_id: companyId,
    ai_order_collection_enabled: values.aiOrderCollectionEnabled === true,
    payment_methods: paymentMethods,
    required_fields: normalizeRequiredFields(values.requiredFields),
    require_human_approval: values.requireHumanApproval !== false,
    default_reviewer_profile_id: values.defaultReviewerProfileId?.trim() || null,
    notify_on_pending_approval: values.notifyOnPendingApproval !== false,
    delivery_assignment_mode: values.deliveryAssignmentMode === "ai" ? "ai" : "manual",
    updated_at: new Date().toISOString(),
  };
}
