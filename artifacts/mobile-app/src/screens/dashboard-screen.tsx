import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Button, Card, Loading, Muted, Screen, StateMessage, Title } from "../components/ui";
import { canAccess, visibleModules } from "../auth/session-policy";
import { formatLocaleNumber, presentStoredValue, queryErrorText } from "../i18n/present";
import { useAppSession } from "../providers";

async function countRows(client: NonNullable<ReturnType<typeof useAppSession>["supabase"]>, table: string, companyId: string, column = "id") {
  const { count, error } = await client.from(table).select(column, { count: "exact", head: true }).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function DashboardScreen() {
  const app = useAppSession();
  const router = useRouter();
  const session = app.session;
  const companyId = session?.company?.id ?? null;
  const enabled = Boolean(app.supabase && companyId && session?.scope === "tenant");
  const summary = useQuery({
    queryKey: ["dashboard", companyId],
    enabled,
    queryFn: async () => {
      const client = app.supabase!;
      const [customers, conversations, tickets, unread] = await Promise.all([
        canAccess(session, "customers.view") ? countRows(client, "customers", companyId!) : Promise.resolve(null),
        canAccess(session, "ai.conversations.view") ? countRows(client, "conversations", companyId!) : Promise.resolve(null),
        canAccess(session, "tickets.view") ? countRows(client, "support_tickets", companyId!) : Promise.resolve(null),
        countRows(client, "notifications", companyId!),
      ]);
      const recentCustomers = canAccess(session, "customers.view")
        ? await client.from("customers").select("id,name,status").eq("company_id", companyId!).order("created_at", { ascending: false }).limit(5)
        : { data: [], error: null };
      if (recentCustomers.error) throw new Error(recentCustomers.error.message);
      return { customers, conversations, tickets, unread, recent: recentCustomers.data ?? [] };
    },
  });

  if (!session) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (session.scope !== "tenant" || !companyId) {
    return (
      <Screen palette={app.palette}>
        <Title palette={app.palette}>{app.t("platformTitle")}</Title>
        <Muted palette={app.palette}>{app.t("platformBody")}</Muted>
      </Screen>
    );
  }
  if (summary.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (summary.error) {
    return <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, summary.error)} actionLabel={app.t("retry")} onAction={() => void summary.refetch()} />;
  }

  const modules = visibleModules(session);
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{session.company?.name ?? app.t("dashboard")}</Title>
      {app.offline ? <Muted palette={app.palette}>{app.t("offline")}</Muted> : null}
      <Card palette={app.palette}>
        {summary.data?.customers != null ? <Muted palette={app.palette}>{app.t("kpiCustomers")}: {formatLocaleNumber(app.language, summary.data.customers)}</Muted> : null}
        {summary.data?.conversations != null ? <Muted palette={app.palette}>{app.t("kpiConversations")}: {formatLocaleNumber(app.language, summary.data.conversations)}</Muted> : null}
        {summary.data?.tickets != null ? <Muted palette={app.palette}>{app.t("kpiTickets")}: {formatLocaleNumber(app.language, summary.data.tickets)}</Muted> : null}
        <Muted palette={app.palette}>{app.t("kpiUnread")}: {formatLocaleNumber(app.language, summary.data?.unread ?? 0)}</Muted>
      </Card>
      <Title palette={app.palette}>{app.t("recentCustomers")}</Title>
      {(summary.data?.recent ?? []).map((row) => (
        <Card key={String(row.id)} palette={app.palette}>
          <Muted palette={app.palette}>{String(row.name ?? row.id)}</Muted>
          <Muted palette={app.palette}>{presentStoredValue(app.language, row.status)}</Muted>
        </Card>
      ))}
      {(summary.data?.recent ?? []).length === 0 ? <Muted palette={app.palette}>{app.t("empty")}</Muted> : null}
      <Title palette={app.palette}>{app.t("quickActions")}</Title>
      {modules.includes("crm") ? <Button palette={app.palette} label={app.t("crm")} onPress={() => router.push("/crm")} /> : null}
      {modules.includes("email") ? <Button palette={app.palette} label={app.t("emailModule")} onPress={() => router.push("/email")} /> : null}
      {modules.includes("tickets") ? <Button palette={app.palette} label={app.t("tickets")} onPress={() => router.push("/tickets")} /> : null}
      {modules.includes("notifications") ? <Button palette={app.palette} label={app.t("notifications")} onPress={() => router.push("/notifications")} /> : null}
    </Screen>
  );
}
