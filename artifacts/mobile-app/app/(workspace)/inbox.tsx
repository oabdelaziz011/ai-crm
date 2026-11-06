import { PermissionListScreen } from "../../src/screens/list-screen";
import { presentStoredValue } from "../../src/i18n/present";
import { useAppSession } from "../../src/providers";

export default function InboxRoute() {
  const app = useAppSession();
  return (
    <PermissionListScreen
      title={app.t("inbox")}
      permission="ai.conversations.view"
      table="conversations"
      columns="id,channel_type,state,last_message_preview,created_at"
      searchColumn="last_message_preview"
      channels={[
        { id: "whatsapp", label: app.t("whatsapp"), column: "channel_type" },
        { id: "instagram", label: app.t("instagram"), column: "channel_type" },
        { id: "messenger", label: app.t("facebook"), column: "channel_type" },
        { id: "web_chat", label: app.t("webChat"), column: "channel_type" },
      ]}
      showUnread
      href={(id) => `/conversation/${id}`}
      map={(row) => ({
        id: String(row.id),
        title: presentStoredValue(app.language, row.channel_type),
        subtitle: row.last_message_preview ? String(row.last_message_preview) : presentStoredValue(app.language, row.state),
      })}
    />
  );
}
