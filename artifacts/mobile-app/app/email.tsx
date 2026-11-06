import { PermissionListScreen } from "../src/screens/list-screen";
import { presentStoredValue } from "../src/i18n/present";
import { useAppSession } from "../src/providers";

export default function EmailRoute() {
  const app = useAppSession();
  return (
    <PermissionListScreen
      title={app.t("emailModule")}
      permission="email.view"
      table="conversations"
      columns="id,state,last_message_preview,created_at"
      searchColumn="last_message_preview"
      equals={{ channel_type: "email" }}
      href={(id) => `/conversation/${id}`}
      map={(row) => ({
        id: String(row.id),
        title: String(row.last_message_preview ?? app.t("emailModule")),
        subtitle: presentStoredValue(app.language, row.state),
      })}
    />
  );
}
