import type { ConnectorType } from "@/lib/integration/types";

export type ConnectorDefinition = {
  type: ConnectorType;
  name: string;
  description: string;
  category: string;
  isAvailable: boolean;
};

/** Built-in connector registry — plugins register here. */
export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [
  { type: "accounting", name: "Accounting", description: "QuickBooks, Xero, and ERP accounting sync", category: "Finance", isAvailable: false },
  { type: "erp", name: "ERP", description: "Enterprise resource planning integration", category: "Finance", isAvailable: false },
  { type: "laboratory", name: "Laboratory", description: "Lab results and orders", category: "Clinical", isAvailable: false },
  { type: "radiology", name: "Radiology", description: "Imaging and PACS integration", category: "Clinical", isAvailable: false },
  { type: "insurance", name: "Insurance", description: "Claims and eligibility verification", category: "Finance", isAvailable: false },
  { type: "email", name: "Email", description: "SMTP and transactional email", category: "Communication", isAvailable: true },
  { type: "sms", name: "SMS", description: "SMS gateway providers", category: "Communication", isAvailable: false },
  { type: "whatsapp", name: "WhatsApp", description: "WhatsApp Business API", category: "Communication", isAvailable: true },
  { type: "calendar", name: "Calendar", description: "Google Calendar, Outlook sync", category: "Scheduling", isAvailable: false },
  { type: "identity", name: "Identity", description: "SSO and identity providers", category: "Security", isAvailable: false },
  { type: "storage", name: "Storage", description: "Document and file storage", category: "Platform", isAvailable: false },
  { type: "custom", name: "Custom", description: "Custom webhook-based connector", category: "Custom", isAvailable: true },
];

export function listAvailableConnectors(): ConnectorDefinition[] {
  return CONNECTOR_REGISTRY.filter((c) => c.isAvailable);
}

export function getConnectorDefinition(type: ConnectorType): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find((c) => c.type === type);
}
