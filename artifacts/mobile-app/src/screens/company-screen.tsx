import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text } from "react-native";
import { Button, Card, Field, Loading, Muted, Screen, StateMessage, Title } from "../components/ui";
import { canAccess } from "../auth/session-policy";
import { useAppSession } from "../providers";
import { presentStoredValue, queryErrorText } from "../i18n/present";
import { recordMessage, submitRecord } from "./record-action";

export function CompanyScreen() {
  const app = useAppSession();
  const companyId = app.session?.company?.id;
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [timezone, setTimezone] = useState("Africa/Cairo");
  const [roleName, setRoleName] = useState("");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const allowed = canAccess(app.session, "company.view") || canAccess(app.session, "settings.view");
  const query = useQuery({
    queryKey: ["company-settings", companyId],
    enabled: Boolean(app.supabase && companyId && allowed),
    queryFn: async () => {
      const company = await app.supabase!.from("companies").select("id,name,status,subdomain").eq("id", companyId!).maybeSingle();
      if (company.error) throw new Error(company.error.message);
      const branches = await app.supabase!.from("branches").select("id,name,city,phone,is_primary,timezone,settings").eq("company_id", companyId!).is("deleted_at", null);
      if (branches.error) throw new Error(branches.error.message);
      const users = canAccess(app.session, "users.view")
        ? await app.supabase!.from("profiles").select("id,full_name").eq("company_id", companyId!)
        : { data: [], error: null };
      if (users.error) throw new Error(users.error.message);
      const roles = canAccess(app.session, "roles.view")
        ? await app.supabase!.from("roles").select("id,name,is_system").eq("company_id", companyId!)
        : { data: [], error: null };
      if (roles.error) throw new Error(roles.error.message);
      return { company: company.data, branches: branches.data ?? [], users: users.data ?? [], roles: roles.data ?? [] };
    },
  });
  if (!allowed) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  if (query.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (query.error) return <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, query.error)} />;
  return (
    <Screen palette={app.palette}>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <Title palette={app.palette}>{String(query.data?.company?.name ?? app.t("company"))}</Title>
        <Muted palette={app.palette}>{presentStoredValue(app.language, query.data?.company?.status)} · {String(query.data?.company?.subdomain ?? "")}</Muted>
        <Title palette={app.palette}>{app.t("branches")}</Title>
        {(query.data?.branches ?? []).map((branch) => (
          <Card key={String(branch.id)} palette={app.palette}>
            <Text style={{ color: app.palette.text, fontWeight: "700" }}>{String(branch.name ?? "")}</Text>
            <Muted palette={app.palette}>{[branch.city, branch.phone, branch.timezone].filter(Boolean).join(" · ")}</Muted>
            <Muted palette={app.palette}>{Array.isArray((branch.settings as { weeklyHours?: unknown } | null)?.weeklyHours) ? app.t("saveHours") : app.t("scheduleMissing")}</Muted>
            {canAccess(app.session, "settings.edit") ? (
              <Button palette={app.palette} tone="secondary" label={app.t("saveHours")} onPress={() => void saveHours(String(branch.id))} />
            ) : null}
          </Card>
        ))}
        {canAccess(app.session, "settings.edit") ? (
          <>
            <Field palette={app.palette} label={app.t("name")} value={branchName} onChangeText={setBranchName} />
            <Field palette={app.palette} label={app.t("branchCode")} value={branchCode} onChangeText={setBranchCode} autoCapitalize="characters" />
            <Field palette={app.palette} label={app.t("timezone")} value={timezone} onChangeText={setTimezone} />
            <Button palette={app.palette} label={app.t("branches")} onPress={() => void createBranch()} />
          </>
        ) : null}
        <Title palette={app.palette}>{app.t("users")}</Title>
        {(query.data?.users ?? []).map((user) => <Muted key={String(user.id)} palette={app.palette}>{String(user.full_name ?? user.id)}</Muted>)}
        <Title palette={app.palette}>{app.t("roles")}</Title>
        {(query.data?.roles ?? []).map((role) => (
          <Card key={String(role.id)} palette={app.palette}>
            <Text style={{ color: app.palette.text, textAlign: app.direction === "rtl" ? "right" : "left" }}>{String(role.name ?? role.id)}{role.is_system ? ` · ${app.t("systemRole")}` : ""}</Text>
            {canAccess(app.session, "roles.edit") && role.is_system !== true ? (
              <Button palette={app.palette} tone="secondary" label={app.t("editRole")} onPress={() => { setRoleId(String(role.id)); setRoleName(String(role.name ?? "")); }} />
            ) : null}
          </Card>
        ))}
        {roleId && canAccess(app.session, "roles.edit") ? (
          <>
            <Field palette={app.palette} label={app.t("roles")} value={roleName} onChangeText={setRoleName} />
            <Button palette={app.palette} label={app.t("editRole")} onPress={() => void saveRole()} />
          </>
        ) : null}
        {message ? <Muted palette={app.palette}>{message}</Muted> : null}
      </ScrollView>
    </Screen>
  );

  async function createBranch() {
    const result = await submitRecord(app, { type: "branch.create", name: branchName, code: branchCode, timezone });
    setMessage(recordMessage(app, result, app.t("branchSaved")));
    if (result.ok) {
      setBranchName("");
      setBranchCode("");
      await query.refetch();
    }
  }

  async function saveHours(id: string) {
    const weeklyHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day_of_week: day,
      is_closed: day === 5,
      opens_at: day === 5 ? null : "09:00",
      closes_at: day === 5 ? null : "17:00",
    }));
    const result = await submitRecord(app, { type: "branch.hours", id, weeklyHours });
    setMessage(recordMessage(app, result, app.t("branchSaved")));
    if (result.ok) await query.refetch();
  }

  async function saveRole() {
    if (!roleId) return;
    const result = await submitRecord(app, { type: "role.update", id: roleId, name: roleName });
    setMessage(recordMessage(app, result, app.t("roleSaved")));
    if (result.ok) await query.refetch();
  }
}
