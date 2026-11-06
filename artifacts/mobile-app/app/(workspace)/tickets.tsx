import { PermissionListScreen } from "../../src/screens/list-screen";
import { presentStoredValue } from "../../src/i18n/present";
import { useAppSession } from "../../src/providers";

export default function TicketsRoute() {
  const app = useAppSession();
  return (
    <PermissionListScreen
      title={app.t("tickets")}
      permission="tickets.view"
      table="support_tickets"
      columns="id,subject,status,priority,created_at"
      searchColumn="subject"
      channels={[
        { id: "open", label: presentStoredValue(app.language, "open"), column: "status" },
        { id: "in_progress", label: presentStoredValue(app.language, "in_progress"), column: "status" },
        { id: "waiting_customer", label: presentStoredValue(app.language, "waiting_customer"), column: "status" },
        { id: "pending", label: presentStoredValue(app.language, "pending"), column: "status" },
        { id: "resolved", label: presentStoredValue(app.language, "resolved"), column: "status" },
        { id: "closed", label: presentStoredValue(app.language, "closed"), column: "status" },
      ]}
      href={(id) => `/ticket/${id}`}
      map={(row) => ({
        id: String(row.id),
        title: String(row.subject ?? row.id),
        subtitle: `${presentStoredValue(app.language, row.status)} · ${presentStoredValue(app.language, row.priority)}`,
      })}
    />
  );
}
