import { useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Button, Muted, Screen, Title } from "../components/ui";
import { APP_LANGUAGES } from "../i18n/catalog";
import { useAppSession } from "../providers";

export function ProfileScreen() {
  const app = useAppSession();
  const [notice, setNotice] = useState<string | null>(null);

  async function enablePush() {
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) {
      setNotice(app.t("pushNeedsDevice"));
      return;
    }
    const accessToken = await app.accessToken();
    if (!accessToken || !app.apiUrl || !app.instanceHostname) {
      setNotice(app.t("sessionExpired"));
      return;
    }
    let deviceToken = "";
    try {
      const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      const issued = await Notifications.getExpoPushTokenAsync(typeof projectId === "string" ? { projectId } : undefined);
      deviceToken = issued.data;
    } catch {
      setNotice(app.t("pushNeedsDevice"));
      return;
    }
    try {
      const response = await fetch(`${app.apiUrl}/api/mobile/push-token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-ValueOR-Instance": app.instanceHostname,
          Accept: "application/json",
        },
        body: JSON.stringify({
          token: deviceToken,
          platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown",
        }),
      });
      const body = await response.json().catch(() => ({}));
      setNotice(response.ok && body.stored === true ? app.t("pushRegistered") : app.t("pushUnverified"));
    } catch {
      setNotice(app.t("networkError"));
    }
  }

  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{app.session?.displayName ?? app.t("profile")}</Title>
      <Muted palette={app.palette}>{app.t("version")} {Constants.expoConfig?.version ?? "0.1.0"}</Muted>
      <Title palette={app.palette}>{app.t("language")}</Title>
      {APP_LANGUAGES.map((language) => (
        <Button key={language} palette={app.palette} tone={app.language === language ? "primary" : "secondary"} label={app.t(language === "en" ? "english" : language === "ar" ? "arabic" : "german")} onPress={() => app.setLanguage(language)} />
      ))}
      <Title palette={app.palette}>{app.t("theme")}</Title>
      {(["system", "light", "dark"] as const).map((choice) => (
        <Button key={choice} palette={app.palette} tone={app.theme === choice ? "primary" : "secondary"} label={app.t(choice)} onPress={() => app.setTheme(choice)} />
      ))}
      <Button palette={app.palette} tone="secondary" label={app.t("pushEnable")} onPress={() => void enablePush()} />
      {app.directionNotice ? <Muted palette={app.palette}>{app.directionNotice}</Muted> : null}
      {notice ? <Muted palette={app.palette}>{notice}</Muted> : null}
      <Button palette={app.palette} tone="danger" label={app.t("signOut")} onPress={() => void app.signOut()} />
    </Screen>
  );
}
