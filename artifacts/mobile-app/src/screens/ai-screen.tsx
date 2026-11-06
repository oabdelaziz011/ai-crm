import { Muted, Screen, StateMessage, Title } from "../components/ui";
import { canAccess } from "../auth/session-policy";
import { useAppSession } from "../providers";

export function AiScreen() {
  const app = useAppSession();
  const allowed = canAccess(app.session, "ai_chat.use") || canAccess(app.session, "ai.conversations.reply");
  if (!allowed) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{app.t("ai")}</Title>
      <Muted palette={app.palette}>{app.t("aiDraftOnly")}</Muted>
      {canAccess(app.session, "ai.conversations.reply") ? <Muted palette={app.palette}>{app.t("requestDraft")}</Muted> : null}
    </Screen>
  );
}
