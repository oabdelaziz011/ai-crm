import { useState } from "react";
import { Alert, ScrollView, Share, Text } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Field, Loading, Muted, Screen, StateMessage, Title } from "../components/ui";
import { canAccess, tenantCompanyId } from "../auth/session-policy";
import { deliverConfirmedMessage } from "../data/mobile-records";
import { useAppSession } from "../providers";
import { recordMessage, submitRecord } from "./record-action";
import { AttachmentSection } from "./attachment-section";
import { aiDraftInstruction, presentStoredValue, queryErrorText } from "../i18n/present";

export function CustomerDetailScreen({ id }: { id: string }) {
  const app = useAppSession();
  const client = useQueryClient();
  const companyId = app.session?.company?.id;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["customer", companyId, id],
    enabled: Boolean(app.supabase && companyId && canAccess(app.session, "customers.view")),
    queryFn: async () => {
      const { data, error } = await app.supabase!.from("customers").select("id,name,email,phone,status,company_id").eq("company_id", companyId!).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("not_found");
      setName(String(data.name ?? ""));
      setPhone(String(data.phone ?? ""));
      return data;
    },
  });
  if (!canAccess(app.session, "customers.view")) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  if (query.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (query.error) return <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, query.error)} />;
  return (
    <Screen palette={app.palette}>
      <Title palette={app.palette}>{app.t("details")}</Title>
      <Field palette={app.palette} label={app.t("name")} value={name} onChangeText={setName} editable={canAccess(app.session, "customers.edit")} />
      <Field palette={app.palette} label={app.t("phone")} value={phone} onChangeText={setPhone} editable={canAccess(app.session, "customers.edit")} />
      <Muted palette={app.palette}>{String(query.data?.email ?? "")}</Muted>
      <Muted palette={app.palette}>{presentStoredValue(app.language, query.data?.status)}</Muted>
      {message ? <Muted palette={app.palette}>{message}</Muted> : null}
      {canAccess(app.session, "customers.edit") ? (
        <Button palette={app.palette} label={app.t("save")} onPress={() => void save()} />
      ) : null}
      <Button palette={app.palette} tone="secondary" label={app.t("share")} onPress={() => void Share.share({ message: name })} />
    </Screen>
  );

  async function save() {
    const result = await submitRecord(app, { type: "customer.update", id, name, phone });
    setMessage(recordMessage(app, result, app.t("customerSaved")));
    if (result.ok) await client.invalidateQueries({ queryKey: ["customer", companyId, id] });
  }
}

export function ConversationDetailScreen({ id }: { id: string }) {
  const app = useAppSession();
  const companyId = app.session?.company?.id;
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["conversation", companyId, id],
    enabled: Boolean(app.supabase && companyId && canAccess(app.session, "ai.conversations.view")),
    queryFn: async () => {
      const conversation = await app.supabase!.from("conversations").select("id,channel_type,state,last_message_preview,assigned_user_id").eq("company_id", companyId!).eq("id", id).maybeSingle();
      if (conversation.error) throw new Error(conversation.error.message);
      if (!conversation.data) throw new Error("not_found");
      const messages = await app.supabase!.from("conversation_messages").select("id,content,created_at").eq("conversation_id", id).order("created_at", { ascending: false }).limit(30);
      if (messages.error) throw new Error(messages.error.message);
      return { conversation: conversation.data, messages: messages.data ?? [] };
    },
  });
  if (!canAccess(app.session, "ai.conversations.view")) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  if (query.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (query.error) return <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, query.error)} />;
  return (
    <Screen palette={app.palette}>
      <ScrollView contentContainerStyle={{ gap: 10 }}>
        <Title palette={app.palette}>{presentStoredValue(app.language, query.data?.conversation.channel_type) || app.t("inbox")}</Title>
        <Muted palette={app.palette}>{presentStoredValue(app.language, query.data?.conversation.state)}</Muted>
        <Muted palette={app.palette}>{app.t("outboundDisabled")}</Muted>
        <AttachmentSection conversationId={id} />
        {(query.data?.messages ?? []).map((message) => (
          <Card key={String(message.id)} palette={app.palette}>
            <Text style={{ color: app.palette.text, textAlign: app.direction === "rtl" ? "right" : "left" }}>{String(message.content ?? "")}</Text>
          </Card>
        ))}
        {canAccess(app.session, "ai.conversations.takeover") ? (
          <Button palette={app.palette} label={app.t("assigned")} onPress={() => void assign()} />
        ) : null}
        <Button palette={app.palette} tone="secondary" label={app.t("markRead")} onPress={() => void markRead()} />
        <Button palette={app.palette} tone="secondary" label={app.t("markUnread")} onPress={() => void markUnread()} />
        {canAccess(app.session, "ai.conversations.reply") ? (
          <Button palette={app.palette} tone="secondary" label={presentStoredValue(app.language, "closed")} onPress={() => void changeState("closed")} />
        ) : null}
        {canAccess(app.session, "ai.conversations.reply") ? (
          <>
            <Field palette={app.palette} label={app.t("sendMessage")} value={text} onChangeText={setText} />
            <Button palette={app.palette} label={app.t("confirmSend")} onPress={() => void send()} />
            <DraftButton kind="email" conversationId={id} />
          </>
        ) : null}
        {notice ? <Muted palette={app.palette}>{notice}</Muted> : null}
      </ScrollView>
    </Screen>
  );

  async function assign() {
    if (!app.session?.userId) return;
    const result = await submitRecord(app, { type: "conversation.assign", id, assignedUserId: app.session.userId });
    setNotice(recordMessage(app, result, app.t("saved")));
    if (result.ok) await query.refetch();
  }

  async function changeState(state: string) {
    const result = await submitRecord(app, { type: "conversation.state", id, state });
    setNotice(recordMessage(app, result, app.t("saved")));
    if (result.ok) await query.refetch();
  }

  async function markRead() {
    const result = await submitRecord(app, { type: "conversation.read", id });
    setNotice(recordMessage(app, result, app.t("saved")));
  }

  async function markUnread() {
    const result = await submitRecord(app, { type: "conversation.unread", id });
    setNotice(recordMessage(app, result, app.t("saved")));
    if (result.ok) await query.refetch();
  }

  async function send() {
    const prepared = await submitRecord(app, { type: "conversation.send", id, text, confirmSend: true });
    if (!prepared.ok) {
      setNotice(recordMessage(app, prepared, app.t("saved")));
      return;
    }
    const token = await app.accessToken();
    if (!token || !app.apiUrl || !app.instanceHostname || !app.session?.company?.id) return;
    const delivered = await deliverConfirmedMessage({
      apiUrl: app.apiUrl,
      token,
      instanceHostname: app.instanceHostname,
      sessionCompanyId: app.session.company.id,
      prepared: prepared.body,
    });
    setNotice(recordMessage(app, delivered, app.t("saved")));
    if (delivered.ok) {
      setText("");
      await query.refetch();
    }
  }
}

export function TicketDetailScreen({ id }: { id: string }) {
  const app = useAppSession();
  const companyId = app.session?.company?.id;
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["ticket", companyId, id],
    enabled: Boolean(app.supabase && companyId && canAccess(app.session, "tickets.view")),
    queryFn: async () => {
      const ticket = await app.supabase!.from("support_tickets").select("id,subject,description,status,priority,assigned_user_id").eq("company_id", companyId!).eq("id", id).is("deleted_at", null).maybeSingle();
      if (ticket.error) throw new Error(ticket.error.message);
      if (!ticket.data) throw new Error("not_found");
      const notes = await app.supabase!.from("support_ticket_comments").select("id,body,is_internal,created_at").eq("company_id", companyId!).eq("ticket_id", id).order("created_at", { ascending: false });
      if (notes.error) throw new Error(notes.error.message);
      return { ticket: ticket.data, notes: notes.data ?? [] };
    },
  });
  if (!canAccess(app.session, "tickets.view")) return <StateMessage palette={app.palette} title={app.t("noPermission")} />;
  if (query.isLoading) return <Loading palette={app.palette} label={app.t("loading")} />;
  if (query.error) return <StateMessage palette={app.palette} title={app.t("error")} body={queryErrorText(app.language, query.error)} />;
  return (
    <Screen palette={app.palette}>
      <ScrollView contentContainerStyle={{ gap: 10 }}>
        <Title palette={app.palette}>{String(query.data?.ticket.subject ?? "")}</Title>
        <Muted palette={app.palette}>{app.t("status")}: {presentStoredValue(app.language, query.data?.ticket.status)}</Muted>
        <Muted palette={app.palette}>{app.t("priority")}: {presentStoredValue(app.language, query.data?.ticket.priority)}</Muted>
        <Muted palette={app.palette}>{String(query.data?.ticket.description ?? "")}</Muted>
        {canAccess(app.session, "tickets.edit") ? (
          <>
            <Button palette={app.palette} label={presentStoredValue(app.language, "in_progress")} onPress={() => void setStatus("in_progress")} />
            <Button palette={app.palette} tone="secondary" label={presentStoredValue(app.language, "high")} onPress={() => void setPriority("high")} />
          </>
        ) : null}
        {canAccess(app.session, "tickets.close") ? (
          <Button palette={app.palette} tone="danger" label={app.t("closeTicket")} onPress={() => Alert.alert(app.t("closeTicket"), app.t("confirmClose"), [
            { text: app.t("cancel"), style: "cancel" },
            { text: app.t("closeTicket"), style: "destructive", onPress: () => void setStatus("closed") },
          ])} />
        ) : null}
        {canAccess(app.session, "tickets.assign") && app.session?.userId ? (
          <Button palette={app.palette} tone="secondary" label={app.t("assigned")} onPress={() => void assignTicket(app.session!.userId)} />
        ) : null}
        {(query.data?.notes ?? []).map((item) => (
          <Card key={String(item.id)} palette={app.palette}>
            <Muted palette={app.palette}>{item.is_internal ? app.t("internalNote") : app.t("customerReply")}</Muted>
            <Text style={{ color: app.palette.text, textAlign: app.direction === "rtl" ? "right" : "left" }}>{String(item.body ?? "")}</Text>
          </Card>
        ))}
        {canAccess(app.session, "tickets.comment") ? (
          <>
            <Field palette={app.palette} label={app.t("internalNote")} value={note} onChangeText={setNote} />
            <Button palette={app.palette} label={app.t("addNote")} onPress={() => void addNote(true)} />
            <Field palette={app.palette} label={app.t("customerReply")} value={reply} onChangeText={setReply} />
            <Button palette={app.palette} tone="secondary" label={app.t("customerReply")} onPress={() => void addNote(false)} />
          </>
        ) : null}
        {canAccess(app.session, "ai.conversations.reply") ? <DraftButton kind="ticket" ticketId={id} /> : null}
        {message ? <Muted palette={app.palette}>{message}</Muted> : null}
      </ScrollView>
    </Screen>
  );

  async function setStatus(status: string) {
    const result = await submitRecord(app, { type: "ticket.status", id, status });
    setMessage(recordMessage(app, result, app.t("ticketSaved")));
    if (result.ok) await query.refetch();
  }

  async function setPriority(priority: string) {
    const result = await submitRecord(app, { type: "ticket.priority", id, priority });
    setMessage(recordMessage(app, result, app.t("ticketSaved")));
    if (result.ok) await query.refetch();
  }

  async function assignTicket(assignedUserId: string) {
    const result = await submitRecord(app, { type: "ticket.assign", id, assignedUserId });
    setMessage(recordMessage(app, result, app.t("ticketSaved")));
    if (result.ok) await query.refetch();
  }

  async function addNote(internal: boolean) {
    const body = (internal ? note : reply).trim();
    if (!body) return;
    const result = await submitRecord(app, { type: internal ? "ticket.note" : "ticket.reply", id, body });
    setMessage(recordMessage(app, result, internal ? app.t("noteSaved") : app.t("ticketSaved")));
    if (result.ok) {
      if (internal) setNote("");
      else setReply("");
      await query.refetch();
    }
  }
}

function DraftButton({ kind, conversationId, ticketId }: { kind: "email" | "ticket"; conversationId?: string; ticketId?: string }) {
  const app = useAppSession();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button palette={app.palette} tone="secondary" label={app.t("requestDraft")} onPress={() => void requestDraft()} />
      {draft ? (
        <Card palette={app.palette}>
          <Text style={{ color: app.palette.text }}>{draft}</Text>
          <Muted palette={app.palette}>{app.t("draftReady")}</Muted>
          {kind === "email" && conversationId ? <Button palette={app.palette} label={app.t("drafts")} onPress={() => void saveDraft()} /> : null}
        </Card>
      ) : null}
      {error ? <Muted palette={app.palette}>{error}</Muted> : null}
    </>
  );

  async function requestDraft() {
    const token = await app.accessToken();
    const companyId = tenantCompanyId(app.session);
    if (!token || !app.apiUrl || !app.instanceHostname) return;
    const path = kind === "email" ? "/api/email/ai/draft" : "/api/tickets/ai/resolution-message";
    const response = await fetch(`${app.apiUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-ValueOR-Instance": app.instanceHostname,
        Accept: "application/json",
      },
      body: JSON.stringify({
        companyId,
        instruction: kind === "email" ? aiDraftInstruction(app.language) : undefined,
        ticketId,
        conversationId,
        outputLanguage: app.language === "de" ? "de" : app.language,
      }),
    });
    const body = await response.json().catch(() => null) as { body?: string; message?: string } | null;
    if (!response.ok) {
      setError(body?.message ?? app.t("error"));
      return;
    }
    setDraft(typeof body?.body === "string" ? body.body : app.t("draftReady"));
  }

  async function saveDraft() {
    if (!conversationId || !draft) return;
    const result = await submitRecord(app, { type: "email.draft", id: conversationId, subject: app.t("reply"), body: draft, mode: "reply" });
    setError(result.ok ? app.t("emailSendUnavailable") : recordMessage(app, result, app.t("draftSaved")));
  }
}
