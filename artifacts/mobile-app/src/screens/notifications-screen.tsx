import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { Button, Card, Loading, Muted, Screen, StateMessage, Title } from "../components/ui";
import { useAppSession } from "../providers";
import { formatLocaleDate, queryErrorText } from "../i18n/present";
import { submitRecord } from "./record-action";

export function NotificationsScreen() {
  const app = useAppSession();
  const client = useQueryClient();
  const router = useRouter();
  const companyId = app.session?.scope === "tenant" ? app.session.company?.id : null;
  const query = useQuery({
    queryKey: ["notifications", companyId],
    enabled: Boolean(app.supabase && companyId),
    queryFn: async () => {
      const { data, error } = await app.supabase!
        .from("notifications")
        .select("id,title,message,is_read,type,created_at")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  if (!companyId) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  if (query.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (query.error) return <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, query.error)} />;
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{app.t("notifications")}</Title>
      <Button palette={app.palette} tone="secondary" label={app.t("markAllRead")} onPress={() => void markAll()} />
      {(query.data ?? []).length === 0 ? <Muted palette={app.palette}>{app.t("empty")}</Muted> : null}
      {(query.data ?? []).map((item) => (
        <Pressable key={String(item.id)} accessibilityRole="button" style={{ minHeight: 48 }} onPress={() => void openItem(item)}>
          <Card palette={app.palette}>
            <Text style={{ color: app.palette.text, fontWeight: item.is_read ? "400" : "700", textAlign: app.direction === "rtl" ? "right" : "left" }}>{String(item.title ?? "")}</Text>
            <Muted palette={app.palette}>{String(item.message ?? "")}</Muted>
            <Muted palette={app.palette}>{formatLocaleDate(app.language, String(item.created_at ?? ""))}</Muted>
            {!item.is_read ? <Button palette={app.palette} tone="secondary" label={app.t("markRead")} onPress={() => void markRead(String(item.id))} /> : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );

  async function markRead(id: string) {
    await submitRecord(app, { type: "notification.read", id });
    await client.invalidateQueries({ queryKey: ["notifications", companyId] });
  }

  async function markAll() {
    const result = await submitRecord(app, { type: "notification.read_all" });
    if (!result.ok) return;
    await client.invalidateQueries({ queryKey: ["notifications", companyId] });
  }

  async function openItem(item: { id: unknown; type?: unknown; message?: unknown }) {
    await markRead(String(item.id));
    const message = String(item.message ?? "");
    const ticket = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    const type = String(item.type ?? "");
    if (ticket && /ticket/i.test(type)) router.push(`/ticket/${ticket[0]}` as never);
    else if (ticket && /conversation|message/i.test(type)) router.push(`/conversation/${ticket[0]}` as never);
  }
}
