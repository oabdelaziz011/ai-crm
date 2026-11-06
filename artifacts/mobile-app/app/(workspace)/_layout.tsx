import { Redirect, Tabs } from "expo-router";
import { BootScreen } from "../../src/components/boot-screen";
import { useAppSession } from "../../src/providers";
import { visibleModules } from "../../src/auth/session-policy";

export default function WorkspaceLayout() {
  const app = useAppSession();
  if (app.booting) return <BootScreen label={app.t("loading")} />;
  if (!app.session) return <Redirect href="/login" />;
  const modules = visibleModules(app.session);
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: app.palette.primary, tabBarStyle: { backgroundColor: app.palette.card } }}>
      <Tabs.Screen name="index" options={{ title: app.t("dashboard") }} />
      <Tabs.Screen name="crm" options={{ title: app.t("crm"), href: modules.includes("crm") ? undefined : null }} />
      <Tabs.Screen name="inbox" options={{ title: app.t("inbox"), href: modules.includes("omnichannel") ? undefined : null }} />
      <Tabs.Screen name="tickets" options={{ title: app.t("tickets"), href: modules.includes("tickets") ? undefined : null }} />
      <Tabs.Screen name="more" options={{ title: app.t("more") }} />
    </Tabs>
  );
}
