import { useState } from "react";
import { Button, Field, Muted, Screen } from "../components/ui";
import { canAccess } from "../auth/session-policy";
import { PermissionListScreen } from "./list-screen";
import { recordMessage, submitRecord } from "./record-action";
import { presentStoredValue } from "../i18n/present";
import { useAppSession } from "../providers";

type Tab = "customers" | "leads" | "opportunities";

export function CrmScreen() {
  const app = useAppSession();
  const [tab, setTab] = useState<Tab>("customers");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [currency, setCurrency] = useState("EGP");
  const [message, setMessage] = useState<string | null>(null);
  const tabs = [
    canAccess(app.session, "customers.view") ? "customers" : null,
    canAccess(app.session, "leads.view") ? "leads" : null,
    canAccess(app.session, "opportunities.view") ? "opportunities" : null,
  ].filter((value): value is Tab => Boolean(value));
  const active = tabs.includes(tab) ? tab : tabs[0];
  if (!active) return <Screen palette={app.palette}><Muted palette={app.palette}>{app.t("noPermission")}</Muted></Screen>;
  return (
    <Screen palette={app.palette}>
      {tabs.map((item) => (
        <Button key={item} palette={app.palette} tone={item === active ? "primary" : "secondary"} label={app.t(item)} onPress={() => setTab(item)} />
      ))}
      {active === "customers" && canAccess(app.session, "customers.create") ? (
        <>
          <Field palette={app.palette} label={app.t("name")} value={name} onChangeText={setName} />
          <Field palette={app.palette} label={app.t("email")} value={email} onChangeText={setEmail} autoCapitalize="none" />
          <Button palette={app.palette} label={app.t("createCustomer")} onPress={() => void createCustomer()} />
          {message ? <Muted palette={app.palette}>{message}</Muted> : null}
        </>
      ) : null}
      {active === "leads" && canAccess(app.session, "leads.create") ? (
        <>
          <Field palette={app.palette} label={app.t("recordTitle")} value={title} onChangeText={setTitle} />
          <Button palette={app.palette} label={app.t("createLead")} onPress={() => void createLead()} />
          {message ? <Muted palette={app.palette}>{message}</Muted> : null}
        </>
      ) : null}
      {active === "opportunities" && canAccess(app.session, "opportunities.create") ? (
        <>
          <Field palette={app.palette} label={app.t("name")} value={name} onChangeText={setName} />
          <Field palette={app.palette} label={app.t("currency")} value={currency} onChangeText={setCurrency} autoCapitalize="characters" />
          <Button palette={app.palette} label={app.t("createOpportunity")} onPress={() => void createOpportunity()} />
          {message ? <Muted palette={app.palette}>{message}</Muted> : null}
        </>
      ) : null}
      {active === "customers" ? (
        <PermissionListScreen title={app.t("customers")} permission="customers.view" table="customers" columns="id,name,email,status,created_at" searchColumn="name" href={(id) => `/customer/${id}`} map={(row) => ({ id: String(row.id), title: String(row.name ?? row.id), subtitle: presentStoredValue(app.language, row.status) })} />
      ) : null}
      {active === "leads" ? (
        <PermissionListScreen title={app.t("leads")} permission="leads.view" table="leads" columns="id,title,lifecycle_status,email,created_at" searchColumn="title" href={(id) => `/lead/${id}`} map={(row) => ({ id: String(row.id), title: String(row.title ?? row.id), subtitle: presentStoredValue(app.language, row.lifecycle_status) })} />
      ) : null}
      {active === "opportunities" ? (
        <PermissionListScreen title={app.t("opportunities")} permission="opportunities.view" table="opportunities" columns="id,name,created_at" searchColumn="name" href={(id) => `/opportunity/${id}`} map={(row) => ({ id: String(row.id), title: String(row.name ?? row.id), subtitle: "" })} />
      ) : null}
    </Screen>
  );

  async function createCustomer() {
    const result = await submitRecord(app, { type: "customer.create", name, email });
    setMessage(recordMessage(app, result, app.t("customerSaved")));
    if (result.ok) {
      setName("");
      setEmail("");
    }
  }

  async function createLead() {
    const result = await submitRecord(app, { type: "lead.create", title, email });
    setMessage(recordMessage(app, result, app.t("leadSaved")));
    if (result.ok) setTitle("");
  }

  async function createOpportunity() {
    const result = await submitRecord(app, { type: "opportunity.create", name, currency });
    setMessage(recordMessage(app, result, app.t("opportunitySaved")));
    if (result.ok) setName("");
  }
}
