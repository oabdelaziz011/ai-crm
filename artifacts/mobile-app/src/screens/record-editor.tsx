import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Field, Loading, Muted, Screen, StateMessage, Title } from "../components/ui";
import { canAccess } from "../auth/session-policy";
import { useAppSession } from "../providers";
import { formatLocaleDate, presentStoredValue, queryErrorText } from "../i18n/present";
import { recordMessage, submitRecord } from "./record-action";

export function LeadEditor({ id }: { id: string }) {
  const app = useAppSession();
  const companyId = app.session?.company?.id;
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["lead-editor", companyId, id],
    enabled: Boolean(app.supabase && companyId && canAccess(app.session, "leads.view")),
    queryFn: async () => {
      const lead = await app.supabase!.from("leads").select("id,title,lifecycle_status,email,phone").eq("company_id", companyId!).eq("id", id).maybeSingle();
      if (lead.error) throw new Error(lead.error.message);
      if (!lead.data) throw new Error("not_found");
      setTitle(String(lead.data.title ?? ""));
      const activities = await app.supabase!.from("lead_activities").select("id,activity_type,created_at").eq("company_id", companyId!).eq("lead_id", id).order("created_at", { ascending: false }).limit(20);
      return { lead: lead.data, activities: activities.error ? [] : activities.data ?? [] };
    },
  });
  if (!canAccess(app.session, "leads.view")) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  if (query.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (query.error) return <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, query.error)} />;
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{app.t("leads")}</Title>
      <Field palette={app.palette} label={app.t("recordTitle")} value={title} onChangeText={setTitle} editable={canAccess(app.session, "leads.edit")} />
      <Muted palette={app.palette}>{presentStoredValue(app.language, query.data?.lead.lifecycle_status)}</Muted>
      {canAccess(app.session, "leads.edit") ? <Button palette={app.palette} label={app.t("save")} onPress={() => void save()} /> : null}
      {message ? <Muted palette={app.palette}>{message}</Muted> : null}
      <Title palette={app.palette}>{app.t("activities")}</Title>
      {(query.data?.activities ?? []).length === 0 ? <Muted palette={app.palette}>{app.t("empty")}</Muted> : null}
      {(query.data?.activities ?? []).map((item) => (
        <Card key={String(item.id)} palette={app.palette}><Muted palette={app.palette}>{presentStoredValue(app.language, item.activity_type)} · {formatLocaleDate(app.language, String(item.created_at ?? ""))}</Muted></Card>
      ))}
    </Screen>
  );

  async function save() {
    const result = await submitRecord(app, { type: "lead.update", id, title });
    setMessage(recordMessage(app, result, app.t("leadSaved")));
  }
}

export function OpportunityEditor({ id }: { id: string }) {
  const app = useAppSession();
  const companyId = app.session?.company?.id;
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["opportunity-editor", companyId, id],
    enabled: Boolean(app.supabase && companyId && canAccess(app.session, "opportunities.view")),
    queryFn: async () => {
      const { data, error } = await app.supabase!.from("opportunities").select("id,name,currency,created_at").eq("company_id", companyId!).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("not_found");
      setName(String(data.name ?? ""));
      return data;
    },
  });
  if (!canAccess(app.session, "opportunities.view")) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  if (query.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (query.error) return <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, query.error)} />;
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{app.t("opportunities")}</Title>
      <Field palette={app.palette} label={app.t("name")} value={name} onChangeText={setName} editable={canAccess(app.session, "opportunities.edit")} />
      <Muted palette={app.palette}>{String(query.data?.currency ?? "")}</Muted>
      {canAccess(app.session, "opportunities.edit") ? <Button palette={app.palette} label={app.t("save")} onPress={() => void save()} /> : null}
      {message ? <Muted palette={app.palette}>{message}</Muted> : null}
    </Screen>
  );

  async function save() {
    const result = await submitRecord(app, { type: "opportunity.update", id, name });
    setMessage(recordMessage(app, result, app.t("opportunitySaved")));
  }
}
