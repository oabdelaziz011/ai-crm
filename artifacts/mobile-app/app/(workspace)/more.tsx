import { useRouter } from "expo-router";
import { Button, Muted, Screen, Title } from "../../src/components/ui";
import { visibleModules } from "../../src/auth/session-policy";
import { useAppSession } from "../../src/providers";

export default function MoreRoute() {
  const app = useAppSession();
  const router = useRouter();
  const modules = visibleModules(app.session);
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{app.t("more")}</Title>
      {app.offline ? <Muted palette={app.palette}>{app.t("offline")}</Muted> : null}
      {modules.includes("email") ? <Button palette={app.palette} label={app.t("emailModule")} onPress={() => router.push("/email")} /> : null}
      {modules.includes("company") ? <Button palette={app.palette} label={app.t("company")} onPress={() => router.push("/company")} /> : null}
      {modules.includes("notifications") ? <Button palette={app.palette} label={app.t("notifications")} onPress={() => router.push("/notifications")} /> : null}
      {modules.includes("ai") ? <Button palette={app.palette} label={app.t("ai")} onPress={() => router.push("/ai")} /> : null}
      <Button palette={app.palette} tone="secondary" label={app.t("profile")} onPress={() => router.push("/profile")} />
    </Screen>
  );
}
