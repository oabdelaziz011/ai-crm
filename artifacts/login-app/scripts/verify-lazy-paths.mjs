import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../src/pages");

const entries = [
  ["customers", "dashboard/customers-page.tsx", "default"],
  ["bookings", "dashboard/bookings-page.tsx", "default"],
  ["invoices", "dashboard/invoices-page.tsx", "default"],
  ["companies", "companies.tsx", "CompaniesPage"],
  ["subscriptions", "subscriptions.tsx", "SubscriptionsPage"],
  ["audit-logs", "audit-logs.tsx", "AuditLogsPage"],
  ["users", "users.tsx", "UsersPage"],
  ["roles", "roles.tsx", "RolesPage"],
  ["whatsapp", "dashboard/whatsapp-page.tsx", "default"],
  ["ai-assistant", "ai-assistant.tsx", "AiAssistantPage"],
  ["ai-chat", "dashboard/ai-chat-page.tsx", "default"],
  ["reports", "dashboard/reports-page.tsx", "default"],
  ["settings", "dashboard/settings-page.tsx", "default"],
];

for (const [id, rel, exp] of entries) {
  const abs = path.join(root, rel);
  const exists = fs.existsSync(abs);
  const exact = exists ? fs.readdirSync(path.dirname(abs)).includes(path.basename(abs)) : false;
  console.log(`${id}: exists=${exists} exactCase=${exact} path=${rel} export=${exp}`);
}
