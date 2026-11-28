/**
 * Sales / ops WhatsApp message purposes and the Meta templates they require.
 * Approval is never assumed — company bindings must mark status "approved"
 * after Meta verifies the template on the WABA.
 */

export const WHATSAPP_MESSAGE_PURPOSES = [
  "connection_test",
  "delivery_worker_dispatch",
  "delivery_worker_cancellation",
  "customer_order_status_pending_approval",
  "customer_order_status_confirmed",
  "customer_order_status_processing",
  "customer_order_status_out_for_delivery",
  "customer_order_status_delivered",
  "customer_order_status_cancelled",
] as const;

export type WhatsAppMessagePurpose = (typeof WHATSAPP_MESSAGE_PURPOSES)[number];

export type WhatsAppTemplateApprovalStatus = "pending" | "approved" | "rejected";

export type CompanyWhatsAppTemplateBinding = {
  /** Exact Meta template name on the WABA. */
  metaName: string;
  /** Meta language code, e.g. en_US or ar. */
  language: string;
  /**
   * Only "approved" may be sent. Set after Meta shows APPROVED —
   * never claim approved from code defaults alone.
   */
  approvalStatus: WhatsAppTemplateApprovalStatus;
};

export type CompanyWhatsAppTemplateBindings = Partial<
  Record<WhatsAppMessagePurpose, CompanyWhatsAppTemplateBinding>
>;

export type WhatsAppPurposeTemplateSpec = {
  purpose: WhatsAppMessagePurpose;
  /** Recommended Meta template name to create in Business Manager. */
  recommendedMetaName: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  header: string | null;
  body: string;
  variableKeys: string[];
  examples: Record<string, string>;
  recipient: "customer" | "worker";
  /** hello_world is allowed only for connection_test. */
  allowsHelloWorld: boolean;
  description: string;
};

/** Exact templates needed for the sales-order WhatsApp journey. */
export const WHATSAPP_PURPOSE_TEMPLATE_SPECS: Record<
  WhatsAppMessagePurpose,
  WhatsAppPurposeTemplateSpec
> = {
  connection_test: {
    purpose: "connection_test",
    recommendedMetaName: "hello_world",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "Hello World",
    variableKeys: [],
    examples: {},
    recipient: "customer",
    allowsHelloWorld: true,
    description: "Meta connection / sandbox test only. Never use for transactional sales messages.",
  },
  delivery_worker_dispatch: {
    purpose: "delivery_worker_dispatch",
    recommendedMetaName: "valueor_delivery_worker_dispatch",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "New delivery assignment {{1}}. Customer {{2}}. Address {{3}}. Phone {{4}}. Total {{5}}.",
    variableKeys: ["orderNumber", "customerName", "deliveryAddress", "customerPhone", "totalAmount"],
    examples: {
      orderNumber: "SO-20261128-001",
      customerName: "Omar",
      deliveryAddress: "Nasr City, Cairo",
      customerPhone: "+2010xxxxxxx",
      totalAmount: "125 EGP",
    },
    recipient: "worker",
    allowsHelloWorld: false,
    description: "Worker notification when an order is assigned for delivery (outside customer session).",
  },
  delivery_worker_cancellation: {
    purpose: "delivery_worker_cancellation",
    recommendedMetaName: "valueor_delivery_worker_cancellation",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "Delivery cancelled for order {{1}}. Customer {{2}}. Do not deliver.",
    variableKeys: ["orderNumber", "customerName"],
    examples: {
      orderNumber: "SO-20261128-001",
      customerName: "Omar",
    },
    recipient: "worker",
    allowsHelloWorld: false,
    description: "Worker notification when an assigned order is cancelled.",
  },
  customer_order_status_pending_approval: {
    purpose: "customer_order_status_pending_approval",
    recommendedMetaName: "valueor_order_pending_approval",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "Hi {{1}}, we received order {{2}}. It is pending team approval. We will update you once it is confirmed.",
    variableKeys: ["customerName", "orderNumber"],
    examples: { customerName: "Omar", orderNumber: "SO-20261128-001" },
    recipient: "customer",
    allowsHelloWorld: false,
    description: "Customer update when order enters pending_approval (required outside 24h window).",
  },
  customer_order_status_confirmed: {
    purpose: "customer_order_status_confirmed",
    recommendedMetaName: "valueor_order_confirmed",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "Hi {{1}}, order {{2}} is confirmed. We are preparing it for delivery.",
    variableKeys: ["customerName", "orderNumber"],
    examples: { customerName: "Omar", orderNumber: "SO-20261128-001" },
    recipient: "customer",
    allowsHelloWorld: false,
    description: "Customer update when order is confirmed (outside 24h window).",
  },
  customer_order_status_processing: {
    purpose: "customer_order_status_processing",
    recommendedMetaName: "valueor_order_processing",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "Hi {{1}}, order {{2}} is now being processed.",
    variableKeys: ["customerName", "orderNumber"],
    examples: { customerName: "Omar", orderNumber: "SO-20261128-001" },
    recipient: "customer",
    allowsHelloWorld: false,
    description: "Customer update when order moves to processing (outside 24h window).",
  },
  customer_order_status_out_for_delivery: {
    purpose: "customer_order_status_out_for_delivery",
    recommendedMetaName: "valueor_order_out_for_delivery",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "Hi {{1}}, order {{2}} is out for delivery.",
    variableKeys: ["customerName", "orderNumber"],
    examples: { customerName: "Omar", orderNumber: "SO-20261128-001" },
    recipient: "customer",
    allowsHelloWorld: false,
    description: "Customer update when order is out for delivery (outside 24h window).",
  },
  customer_order_status_delivered: {
    purpose: "customer_order_status_delivered",
    recommendedMetaName: "valueor_order_delivered",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "Hi {{1}}, order {{2}} has been marked delivered. Thank you.",
    variableKeys: ["customerName", "orderNumber"],
    examples: { customerName: "Omar", orderNumber: "SO-20261128-001" },
    recipient: "customer",
    allowsHelloWorld: false,
    description: "Customer update when order is delivered (outside 24h window).",
  },
  customer_order_status_cancelled: {
    purpose: "customer_order_status_cancelled",
    recommendedMetaName: "valueor_order_cancelled",
    language: "en_US",
    category: "UTILITY",
    header: null,
    body: "Hi {{1}}, order {{2}} has been cancelled. If you have questions, reply here.",
    variableKeys: ["customerName", "orderNumber"],
    examples: { customerName: "Omar", orderNumber: "SO-20261128-001" },
    recipient: "customer",
    allowsHelloWorld: false,
    description: "Customer update when order is cancelled (outside 24h window).",
  },
};

export function customerStatusToWhatsAppPurpose(
  status: string,
): WhatsAppMessagePurpose | null {
  switch (status) {
    case "pending_approval":
      return "customer_order_status_pending_approval";
    case "confirmed":
      return "customer_order_status_confirmed";
    case "processing":
      return "customer_order_status_processing";
    case "out_for_delivery":
      return "customer_order_status_out_for_delivery";
    case "delivered":
      return "customer_order_status_delivered";
    case "cancelled":
      return "customer_order_status_cancelled";
    default:
      return null;
  }
}

export function isWhatsAppMessagePurpose(value: string): value is WhatsAppMessagePurpose {
  return (WHATSAPP_MESSAGE_PURPOSES as readonly string[]).includes(value);
}
