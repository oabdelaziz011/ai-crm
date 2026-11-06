import { useQuery } from "@tanstack/react-query";
import { Card, Loading, Muted, Screen, StateMessage, Title } from "../components/ui";
import { canAccess } from "../auth/session-policy";
import { useAppSession } from "../providers";

export function SimpleRecordScreen({
  id,
  table,
  permission,
  columns,
  titleColumn,
}: {
  id: string;
  table: string;
  permission: string;
  columns: string;
  titleColumn: string;
}) {
  const app = useAppSession();
  const companyId = app.session?.company?.id;
  const query = useQuery({
    queryKey: [table, companyId, id],
    enabled: Boolean(app.supabase && companyId && canAccess(app.session, permission)),
    queryFn: async () => {
      const { data, error } = await app.supabase!.from(table).select(columns).eq("company_id", companyId!).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("not_found");
      return data as unknown as Record<string, unknown>;
    },
  });
  if (!canAccess(app.session, permission)) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  if (query.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (query.error) return <StateMessage palette={app.palette} title={app.t("error")} body={query.error.message} />;
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{String(query.data?.[titleColumn] ?? app.t("details"))}</Title>
      <Card palette={app.palette}>
        {Object.entries(query.data ?? {}).filter(([key]) => key !== "company_id").map(([key, value]) => (
          <Muted key={key} palette={app.palette}>{key}: {String(value ?? "")}</Muted>
        ))}
      </Card>
    </Screen>
  );
}
