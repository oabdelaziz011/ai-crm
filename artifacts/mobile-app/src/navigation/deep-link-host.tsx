import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { decideMobileDeepLink } from "./deep-link";
import { useAppSession } from "../providers";

let pendingUrl: string | null = null;

export function DeepLinkHost() {
  const app = useAppSession();
  const router = useRouter();
  const openedInitial = useRef(false);

  useEffect(() => {
    if (app.booting) return;
    const open = (url: string | null, payload?: Record<string, unknown> | null) => {
      const decision = decideMobileDeepLink({
        url,
        payload,
        authenticated: Boolean(app.session),
        sessionExpired: false,
        companyId: app.session?.company?.id ?? null,
      });
      if (!decision.ok && !app.session && url) {
        pendingUrl = url;
        router.replace("/login");
        return;
      }
      if (!decision.ok) {
        router.replace(decision.href);
        return;
      }
      router.push(decision.href as never);
    };
    if (app.session && pendingUrl) {
      const url = pendingUrl;
      pendingUrl = null;
      open(url);
    }
    if (!openedInitial.current) {
      openedInitial.current = true;
      void Linking.getInitialURL().then((url) => {
        if (url) open(url);
      }).catch(() => undefined);
    }
    const links = Linking.addEventListener("url", (event) => open(event.url));
    const notifications = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      open(null, data && typeof data === "object" ? data as Record<string, unknown> : null);
    });
    return () => {
      links.remove();
      notifications.remove();
    };
  }, [app.booting, app.session, router]);

  return null;
}
