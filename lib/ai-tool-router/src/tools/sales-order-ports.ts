export type SalesOrderRequiredFields = {
  customerName: boolean;
  mobileNumber: boolean;
  governorate: boolean;
  cityArea: boolean;
  detailedAddress: boolean;
  deliveryNotes: boolean;
  deliveryLocation: boolean;
  secondaryPhone: boolean;
};

export type CompanyOrderSettingsSnapshot = {
  aiOrderCollectionEnabled: boolean;
  requireHumanApproval: boolean;
  notifyOnPendingApproval: boolean;
  paymentMethods: string[];
  requiredFields: SalesOrderRequiredFields;
};

export type DeliveryZoneSnapshot = {
  id: string;
  governorate: string;
  zoneName: string;
  deliveryFee: number;
  etaMin: number;
  etaMax: number;
  etaUnit: "hours" | "days";
};

export type CatalogPricedLine = {
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
};

export type ConversationOrderAttribution = {
  aiEmployeeId: string | null;
  assignedSalespersonId: string | null;
  sourceChannel: string;
  leadId: string | null;
  existingCustomerId: string | null;
};

export type UpsertOrderCustomerResult = {
  customerId: string;
  created: boolean;
};

export type CreateSalesOrderWriteInput = {
  companyId: string;
  actorUserId: string | null;
  conversationId: string;
  orderNumber: string;
  status: "pending_approval" | "confirmed";
  requireHumanApproval: boolean;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  preferredLanguage: string;
  deliveryZoneId: string;
  deliveryGovernorate: string;
  deliveryCityArea: string;
  deliveryAddress: string;
  deliveryNotes: string;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryLocationUrl: string;
  customerSecondaryPhone: string;
  etaMinSnapshot: number;
  etaMaxSnapshot: number;
  etaUnitSnapshot: "hours" | "days";
  deliveryFee: number;
  subtotal: number;
  totalAmount: number;
  currency: string;
  sourceChannel: string;
  paymentStatus: "unpaid";
  aiEmployeeId: string | null;
  assignedSalespersonId: string | null;
  createdByAi: boolean;
  confirmationFingerprint: string;
  items: CatalogPricedLine[];
};

export type CreateSalesOrderWriteResult = {
  orderId: string;
  orderNumber: string;
  status: string;
  customerId: string;
  alreadyExisted: boolean;
};

export type SalesOrderToolPorts = {
  loadOrderSettings(companyId: string): Promise<CompanyOrderSettingsSnapshot>;

  findEnabledDeliveryZone(input: {
    companyId: string;
    governorate: string;
    zoneName: string;
  }): Promise<
    | { status: "ok"; zone: DeliveryZoneSnapshot }
    | { status: "none" }
    | {
        status: "ambiguous";
        candidates: Array<{ id: string; governorate: string; zoneName: string }>;
      }
  >;

  priceCatalogLines(input: {
    companyId: string;
    items: Array<{ productId: string; quantity: number }>;
  }): Promise<
    | { ok: true; lines: CatalogPricedLine[]; currency: string; subtotal: number }
    | { ok: false; reason: string }
  >;

  loadConversationAttribution(input: {
    companyId: string;
    conversationId: string;
    aiAssistantIdHint?: string | null;
  }): Promise<ConversationOrderAttribution>;

  upsertCustomerByPhone(input: {
    companyId: string;
    userId: string | null;
    conversationId: string;
    name: string;
    phone: string;
    email?: string | null;
    preferredLanguage?: string | null;
    secondaryPhone?: string | null;
    deliveryAddress?: string | null;
    deliveryGovernorate?: string | null;
    deliveryCityArea?: string | null;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    deliveryLocationUrl?: string | null;
  }): Promise<UpsertOrderCustomerResult>;

  createSalesOrder(input: CreateSalesOrderWriteInput): Promise<CreateSalesOrderWriteResult>;

  cancelFollowUpAfterPurchase?(input: {
    companyId: string;
    leadId: string;
  }): Promise<void>;

  nextOrderNumber(companyId: string): Promise<string>;

  /** Optional: resolve phone from conversation CRM link / latest order attribution. */
  resolveConversationCustomerPhone?(input: {
    companyId: string;
    conversationId: string;
  }): Promise<string | null>;

  listCustomerActiveOrders(input: {
    companyId: string;
    customerPhone: string;
    orderNumber?: string | null;
    statuses: string[];
  }): Promise<
    Array<{
      id: string;
      orderNumber: string;
      status: string;
      totalAmount: number;
      currency: string;
      customerName: string;
      customerPhone: string;
      hasPendingCancellationRequest: boolean;
      latestRejectionReason?: string | null;
    }>
  >;

  executeCustomerDirectCancellation(input: {
    companyId: string;
    conversationId: string;
    orderId: string;
    reason: string | null;
    customerPhone?: string | null;
  }): Promise<
    | {
        ok: true;
        workerNotify?: {
          workerPhone: string;
          message: string;
          idempotencyKey: string;
        } | null;
      }
    | { ok: false; code: string; reason: string }
  >;

  createCustomerCancellationRequest(input: {
    companyId: string;
    conversationId: string;
    orderId: string;
    reason: string | null;
  }): Promise<
    | { ok: true; requestId: string }
    | { ok: false; code: string; reason: string }
  >;

  /** Best-effort worker WhatsApp; must never roll back a completed cancellation. */
  notifyCancellationWorkerWhatsApp?(input: {
    companyId: string;
    orderId: string;
    workerPhone: string;
    message: string;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; messageId?: string | null; error?: string | null }>;

  /** Best-effort customer WhatsApp status follow-up; never rolls back order writes. */
  notifyCustomerOrderStatusWhatsApp?(input: {
    companyId: string;
    orderId: string;
    orderNumber: string;
    status: string;
    customerPhone: string;
    customerName: string;
    conversationId: string | null;
    idempotencyKey: string;
  }): Promise<{ ok: boolean; skipped?: boolean; messageId?: string | null; error?: string | null }>;
};
