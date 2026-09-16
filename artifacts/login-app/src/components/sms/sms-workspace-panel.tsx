import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { Link } from "wouter";
import { AlertTriangle, Loader2, MessageSquareText, Search, Send } from "lucide-react";
import type { ConversationMessageRecord, ConversationRecord } from "@workspace/ai-conversation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import { useAssignableEmployees } from "@/hooks/assignment-governance/use-assignable-employees";
import { useConversationList } from "@/hooks/conversations/use-conversation-list";
import { useConversationMessages } from "@/hooks/conversations/use-conversation-messages";
import { useTeamInboxReply } from "@/hooks/conversations/use-team-inbox-reply";
import { useSmsControlCenter } from "@/hooks/sms/use-sms-control-center";
import { useSmsWorkspaceRealtime } from "@/hooks/sms/use-sms-workspace-realtime";
import { SmsConversationAssigneeControl } from "@/components/sms/sms-conversation-assignee-control";
import { SMS_SETTINGS_HREF } from "@/components/sms/layout/sms-sub-nav";
import { canAssignEmailConversation } from "@/lib/email-workspace/email-conversation-assignment";
import { formatAssignableEmployeeLabel } from "@/lib/assignment-governance/assignable-employee-labels";
import {
  readSmsWorkspaceAssigneeFromSearch,
  smsAssigneeFilterToListAssignedUserId,
  writeSmsAssigneeToSearchParams,
  SMS_WORKSPACE_ASSIGNEE_ALL,
  SMS_WORKSPACE_ASSIGNEE_UNASSIGNED,
  type SmsWorkspaceAssigneeFilter,
} from "@/lib/sms-workspace/sms-workspace-assignee-filter";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** Twilio hard cap for a single concatenated SMS body. */
const SMS_MAX_LENGTH = 1600;
/** GSM-7 single-segment size; used for the segment hint only. */
const SMS_SEGMENT_LENGTH = 160;
const SEARCH_DEBOUNCE_MS = 300;

type SmsListCustomer = {
  id: string;
  companyId: string;
  name: string | null;
  phone: string | null;
};

function buildSmsWorkspaceSearch(input: {
  conversationId?: string | null;
  assignee?: SmsWorkspaceAssigneeFilter | null;
}): string {
  const params = new URLSearchParams();
  const conversation = input.conversationId?.trim();
  if (conversation) params.set("conversation", conversation);
  const withAssignee = writeSmsAssigneeToSearchParams(
    params,
    input.assignee ?? SMS_WORKSPACE_ASSIGNEE_ALL,
  );
  const qs = withAssignee.toString();
  return qs ? `/?${qs}` : "/";
}

/** SMS threads are keyed by the customer phone on the channel session. */
function resolveConversationPhone(conversation: ConversationRecord): string | null {
  const thread = conversation.external_thread_id?.trim();
  if (thread) return thread;
  const metadata = conversation.metadata ?? {};
  for (const key of ["customerPhone", "customer_phone", "phone", "from"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function formatTimestamp(value: string | null, language: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(language, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messageTone(message: ConversationMessageRecord): "incoming" | "outgoing" | "note" {
  if (message.message_type === "incoming") return "incoming";
  if (message.message_type === "internal_note") return "note";
  return "outgoing";
}

/**
 * Dashboard → SMS workspace: conversation list + thread + plain-text composer.
 * Outbound destination always comes from the conversation channel session —
 * the composer never accepts a client-supplied recipient.
 */
export function SmsWorkspacePanel() {
  const { t, i18n } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const search = useSearch();
  const [, setLocation] = useLocation();

  const canAssign = canAssignEmailConversation({ isSuperAdmin, hasPermission });
  const canConfigure = isSuperAdmin || hasPermission("settings.edit");

  const assigneeFilter = readSmsWorkspaceAssigneeFromSearch(search);
  const selectedConversationId = useMemo(
    () => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("conversation"),
    [search],
  );

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { snapshot, isLoading: settingsLoading } = useSmsControlCenter();

  const filters = useMemo(
    () => ({
      channelType: "sms" as const,
      searchQuery: searchQuery || undefined,
      hasEmployeeUnread: unreadOnly ? true : undefined,
      assignedUserId: smsAssigneeFilterToListAssignedUserId(assigneeFilter),
    }),
    [assigneeFilter, searchQuery, unreadOnly],
  );

  const listQuery = useConversationList(filters, 100);
  const conversations = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const selected = useMemo(
    () => conversations.find((row) => row.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  // Marking read on open is owned by useConversationMessages (resetEmployeeUnread).
  const messagesQuery = useConversationMessages(selected?.id ?? null);
  const messages = messagesQuery.data ?? [];

  useSmsWorkspaceRealtime(companyId, selected?.id ?? null);

  const { sendReply, isSending, error: sendError, clearError } = useTeamInboxReply(companyId);

  useEffect(() => {
    setBody("");
    setValidationError(null);
    clearError();
  }, [clearError, selected?.id]);

  const listCustomerIds = useMemo(
    () =>
      [
        ...new Set(
          conversations.map((row) => row.customer_id).filter((id): id is string => Boolean(id)),
        ),
      ].sort(),
    [conversations],
  );

  const listCustomersQuery = useQuery({
    queryKey: ["sms-workspace-list-customers", companyId, listCustomerIds.join(",")],
    enabled: Boolean(companyId && listCustomerIds.length > 0),
    staleTime: 30_000,
    queryFn: async (): Promise<SmsListCustomer[]> => {
      if (!companyId || listCustomerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, company_id")
        .eq("company_id", companyId)
        .in("id", listCustomerIds);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: String(row.id),
        companyId: String(row.company_id),
        name: typeof row.name === "string" ? row.name : null,
        phone: typeof row.phone === "string" ? row.phone : null,
      }));
    },
  });

  const customersById = useMemo(() => {
    const map = new Map<string, SmsListCustomer>();
    for (const row of listCustomersQuery.data ?? []) {
      if (row.companyId === companyId) map.set(row.id, row);
    }
    return map;
  }, [companyId, listCustomersQuery.data]);

  const assignableQuery = useAssignableEmployees({
    enabled: Boolean(companyId && canAssign),
    resource: "conversation",
  });

  const assigneeFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    const options: SearchableSelectOption[] = [
      { value: SMS_WORKSPACE_ASSIGNEE_ALL, label: t("smsModule.workspace.assigneeAll") },
      { value: SMS_WORKSPACE_ASSIGNEE_UNASSIGNED, label: t("smsModule.workspace.unassigned") },
    ];
    const seen = new Set(options.map((option) => option.value));
    for (const employee of assignableQuery.data ?? []) {
      const userId = employee.userId?.trim();
      if (!userId || seen.has(userId)) continue;
      seen.add(userId);
      options.push({
        value: userId,
        label: formatAssignableEmployeeLabel(employee),
        description: employee.email ?? undefined,
      });
    }
    return options;
  }, [assignableQuery.data, t]);

  function selectConversation(conversationId: string | null) {
    setLocation(buildSmsWorkspaceSearch({ conversationId, assignee: assigneeFilter }));
  }

  function applyAssigneeFilter(next: string) {
    setLocation(
      buildSmsWorkspaceSearch({
        conversationId: selectedConversationId,
        assignee: next as SmsWorkspaceAssigneeFilter,
      }),
    );
  }

  function customerLabel(conversation: ConversationRecord): string {
    const customer = conversation.customer_id
      ? customersById.get(conversation.customer_id) ?? null
      : null;
    const name = customer?.name?.trim();
    if (name) return name;
    return (
      resolveConversationPhone(conversation) ??
      t("smsModule.workspace.unknownCustomer")
    );
  }

  const selectedPhone = selected ? resolveConversationPhone(selected) : null;
  const selectedCustomer =
    selected?.customer_id ? customersById.get(selected.customer_id) ?? null : null;

  const trimmedBody = body.trim();
  const segments = Math.max(1, Math.ceil(body.length / SMS_SEGMENT_LENGTH));
  const overLimit = body.length > SMS_MAX_LENGTH;
  const sendBlocked =
    !selected || isSending || !trimmedBody || overLimit || !snapshot.smsConfigured;

  async function handleSend() {
    if (!selected || !companyId) return;
    if (!trimmedBody || overLimit) return;

    setValidationError(null);
    clearError();

    if (!snapshot.smsConfigured) {
      setValidationError(t("smsModule.workspace.notConfiguredSendBlocked"));
      return;
    }
    const companyChannelId = selected.company_channel_id;
    if (!companyChannelId) {
      setValidationError(t("smsModule.workspace.channelNotConfigured"));
      return;
    }
    if (!selected.external_thread_id) {
      setValidationError(t("smsModule.workspace.destinationMissing"));
      return;
    }

    const ok = await sendReply(
      {
        conversationId: selected.id,
        companyChannelId,
        channelKey: "sms",
        // Destination is the inbound thread (customer phone) — never client supplied.
        externalThreadId: selected.external_thread_id,
      },
      { text: trimmedBody, mode: "reply" },
    );

    if (ok) setBody("");
  }

  const hasActiveFilters = Boolean(searchQuery) || unreadOnly || assigneeFilter !== SMS_WORKSPACE_ASSIGNEE_ALL;

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:flex-row"
      data-testid="sms-workspace-panel"
    >
      {/* Conversation list */}
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background lg:w-[22rem] lg:shrink-0">
        <div className="shrink-0 space-y-2 border-b border-border/60 p-2">
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("smsModule.workspace.search")}
              className="h-8 ps-8 text-xs"
              data-testid="sms-workspace-search"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchableSelect
                value={assigneeFilter}
                onValueChange={applyAssigneeFilter}
                options={assigneeFilterOptions}
                placeholder={t("smsModule.workspace.assignedTo")}
                searchPlaceholder={t("smsModule.workspace.assigneeSearch")}
                emptyLabel={t("smsModule.workspace.assigneeEmpty")}
                className="h-8 rounded-lg px-2.5 text-xs"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant={unreadOnly ? "default" : "outline"}
              className="h-8 shrink-0 px-2 text-xs"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((prev) => !prev)}
              data-testid="sms-workspace-unread-toggle"
            >
              {t("smsModule.workspace.unread")}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto" data-testid="sms-workspace-list">
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("smsModule.workspace.loading")}
            </div>
          ) : listQuery.isError ? (
            <p className="p-4 text-xs text-destructive">{t("smsModule.workspace.listFailed")}</p>
          ) : conversations.length === 0 ? (
            <div className="space-y-2 p-4">
              <p className="text-xs text-muted-foreground">
                {hasActiveFilters
                  ? t("smsModule.workspace.emptyResults")
                  : snapshot.settingsLoaded && !snapshot.smsConfigured
                    ? t("smsModule.workspace.emptyNoConfig")
                    : t("smsModule.workspace.emptyConversations")}
              </p>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setSearchInput("");
                    setUnreadOnly(false);
                    applyAssigneeFilter(SMS_WORKSPACE_ASSIGNEE_ALL);
                  }}
                >
                  {t("smsModule.workspace.clearFilters")}
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((conversation) => {
                const active = conversation.id === selected?.id;
                const unread = conversation.unread_count_employee > 0;
                return (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(conversation.id)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-3 py-2 text-start transition-colors",
                        active ? "bg-primary/10" : "hover:bg-muted/60",
                      )}
                      data-testid="sms-workspace-list-item"
                      data-conversation-id={conversation.id}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            unread ? "font-semibold" : "font-medium",
                          )}
                        >
                          {customerLabel(conversation)}
                        </span>
                        {unread ? (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                            {conversation.unread_count_employee}
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {conversation.last_message_preview?.trim() ||
                          t("smsModule.workspace.noMessages")}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatTimestamp(
                          conversation.last_message_at ?? conversation.created_at,
                          i18n.language,
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Thread + composer */}
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-background">
        {!selected ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <MessageSquareText className="h-6 w-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              {snapshot.settingsLoaded && !snapshot.smsConfigured && !settingsLoading
                ? t("smsModule.workspace.emptyNoConfig")
                : t("smsModule.workspace.selectConversation")}
            </p>
            {canConfigure && snapshot.settingsLoaded && !snapshot.smsConfigured ? (
              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                <Link href={SMS_SETTINGS_HREF}>{t("smsModule.workspace.configureSms")}</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <header className="shrink-0 space-y-1 border-b border-border/60 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate text-sm font-semibold">
                  {t("smsModule.workspace.customer")}: {customerLabel(selected)}
                </span>
                {selectedPhone ? (
                  <span
                    className="truncate font-mono text-xs text-muted-foreground"
                    data-testid="sms-workspace-phone"
                  >
                    {t("smsModule.workspace.phone")}: {selectedPhone}
                  </span>
                ) : null}
                {selectedCustomer?.phone && selectedCustomer.phone !== selectedPhone ? (
                  <span className="truncate text-[11px] text-muted-foreground">
                    ({t("smsModule.workspace.crmPhone")}: {selectedCustomer.phone})
                  </span>
                ) : null}
              </div>
              {companyId ? (
                <SmsConversationAssigneeControl
                  conversation={selected}
                  companyId={companyId}
                  canAssign={canAssign}
                />
              ) : null}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3" data-testid="sms-workspace-thread">
              {messagesQuery.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {t("smsModule.workspace.loading")}
                </div>
              ) : messagesQuery.isError ? (
                <p className="text-xs text-destructive">{t("smsModule.workspace.threadFailed")}</p>
              ) : messages.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("smsModule.workspace.noMessages")}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {messages.map((message) => {
                    const tone = messageTone(message);
                    return (
                      <li
                        key={message.id}
                        className={cn(
                          "flex flex-col gap-0.5",
                          tone === "incoming" ? "items-start" : "items-end",
                        )}
                        data-testid="sms-workspace-message"
                        data-message-type={message.message_type}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm",
                            tone === "incoming" && "bg-muted text-foreground",
                            tone === "outgoing" && "bg-primary text-primary-foreground",
                            tone === "note" && "border border-dashed border-border bg-background text-muted-foreground",
                          )}
                        >
                          {message.content}
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {formatTimestamp(message.created_at, i18n.language)}
                          {message.status ? ` · ${message.status}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="shrink-0 space-y-1.5 border-t border-border/60 p-2">
              {validationError || sendError ? (
                <p
                  className="flex items-center gap-1.5 text-xs text-destructive"
                  data-testid="sms-workspace-send-error"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {validationError ?? t("smsModule.workspace.sendFailed")}
                </p>
              ) : null}

              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t("smsModule.workspace.composer")}
                rows={3}
                disabled={isSending}
                className="min-h-[4.5rem] resize-y text-sm"
                data-testid="sms-workspace-composer"
              />

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "text-[11px]",
                    overLimit ? "text-destructive" : "text-muted-foreground",
                  )}
                  data-testid="sms-workspace-char-count"
                >
                  {t("smsModule.workspace.characterCount", {
                    chars: body.length,
                    max: SMS_MAX_LENGTH,
                    segments,
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="ms-auto h-8 gap-1.5 px-3 text-xs"
                  disabled={sendBlocked}
                  onClick={() => void handleSend()}
                  data-testid="sms-workspace-send"
                >
                  {isSending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Send className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {isSending ? t("smsModule.workspace.sending") : t("smsModule.workspace.send")}
                </Button>
              </div>

              {!snapshot.smsConfigured && snapshot.settingsLoaded ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("smsModule.workspace.notConfiguredSendBlocked")}
                  {canConfigure ? (
                    <>
                      {" "}
                      <Link
                        href={SMS_SETTINGS_HREF}
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {t("smsModule.workspace.configureSms")}
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : null}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
