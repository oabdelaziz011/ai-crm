import type { Express } from "express";
import express from "express";

/**
 * Global JSON stays small. Customer-import files are base64 and are parsed
 * only on `/api/customers/import` before this limit runs.
 * Email and WhatsApp attachments upload to storage from the browser.
 * Webhook signature checks keep their own raw-body limit in app.ts.
 */
export const API_JSON_LIMIT = "1mb";
export const API_URLENCODED_LIMIT = "1mb";
export const CUSTOMER_IMPORT_JSON_LIMIT = "8mb";
export const WEBHOOK_JSON_LIMIT = "2mb";
export const SMS_WEBHOOK_LIMIT = "1mb";

export function applySharedBodyParsers(app: Express): void {
  app.use("/api/customers/import", express.json({ limit: CUSTOMER_IMPORT_JSON_LIMIT }));
  app.use(express.json({ limit: API_JSON_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: API_URLENCODED_LIMIT }));
}
