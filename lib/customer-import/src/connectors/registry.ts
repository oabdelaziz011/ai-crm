import type { CustomerImportSourceKind } from "../types.js";

export type CustomerImportConnectorDescriptor = {
  id: string;
  kind: CustomerImportSourceKind;
  labelKey: string;
  descriptionKey: string;
  status: "available" | "planned";
};

/**
 * Extension point for future CRM connectors (HubSpot, Salesforce, Zoho, REST).
 * Only csv_xlsx is operational in this release.
 */
export const CUSTOMER_IMPORT_CONNECTORS: readonly CustomerImportConnectorDescriptor[] = [
  {
    id: "csv_xlsx",
    kind: "csv_xlsx",
    labelKey: "customerImport.connectors.csvXlsx.label",
    descriptionKey: "customerImport.connectors.csvXlsx.description",
    status: "available",
  },
  {
    id: "hubspot",
    kind: "connector_planned",
    labelKey: "customerImport.connectors.hubspot.label",
    descriptionKey: "customerImport.connectors.hubspot.description",
    status: "planned",
  },
  {
    id: "salesforce",
    kind: "connector_planned",
    labelKey: "customerImport.connectors.salesforce.label",
    descriptionKey: "customerImport.connectors.salesforce.description",
    status: "planned",
  },
] as const;
