import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import { Bell, BellOff, Paperclip, PanelRight, Sparkles, Ticket, X } from "lucide-react";
import type { ConversationMessageRecord, ConversationRecord } from "@workspace/ai-conversation";
import type { EmailComposerMode } from "@workspace/channel-platform";
import {
  buildEmailComposerOutbound,
  buildReplyAllParticipants,
  buildReplyParticipants,
} from "@workspace/channel-platform";
import { DashboardCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LinkCustomerDialog } from "@/components/omnichannel/link-customer-dialog";
import { EmailAiCopilotMenu } from "@/components/email/email-ai-copilot-menu";
import { EmailComposerBodyEditor } from "@/components/email/email-composer-body-editor";
import {
  EmailMessageTranslateControl,
  EmailMessageTranslateResult,
  EmailMessageTranslateTrigger,
} from "@/components/email/email-message-translate-control";
import { EmailConversationAssigneeControl } from "@/components/email/email-conversation-assignee-control";
import { EmailMessageAttachments } from "@/components/email/email-message-attachments";
import { EmailNewEmailButton } from "@/components/email/email-new-email-button";
import { EmailRecipientChipsField } from "@/components/email/email-recipient-chips-field";
import { useAuth } from "@/context/auth-context";
import { useAuthUser, usePermissions } from "@/hooks/use-rbac";
import { useCommercialFeatureLookup } from "@/hooks/billing/use-commercial-feature-lookup";
import { useCompanyBrandCenter } from "@/hooks/company-workspace/use-company-brand-center";
import { useAiAssistantSettings } from "@/hooks/use-ai-assistant-settings";
import { useEmailSettings, useEmailWorkspaceCompanyChannel } from "@/hooks/notifications/use-email-health";
import { useEmailTemplates } from "@/hooks/email/use-email-templates";
import {
  applyAiHtmlBody,
  buildComposerOutboundHtml,
  buildComposerOutboundText,
  renderCompanySignatureHtml,
  sanitizeEmailLogoUrl,
} from "@/lib/email-workspace/email-signature-text";
import { resolveEffectiveEmailSignature } from "@/lib/email-workspace/email-personal-identity";
import { useMyEmailIdentity } from "@/hooks/email/use-my-email-identity";
import { resolveEmailLogoUrl } from "@/lib/company-workspace/brand-center/normalize";
import {
  buildEmailWorkspaceTemplateRenderContext,
  findUnresolvedTemplateTokensAfterCompanyResolution,
  resolveCompanyTemplateVariablesInComposerContent,
  resolveCompanyTemplateVariablesInText,
  resolveTrustedCompanyNameForEmailTemplates,
  renderEmailTemplate,
} from "@/lib/email-templates";
import {
  deriveEmailThreadLifecycle,
  readEmailRoutingMeta,
} from "@/lib/email-workspace/email-thread-lifecycle";
import {
  localizeEmailTicketPriority,
  localizeEmailTicketStatus,
} from "@/lib/email-workspace/email-ticket-presentation";
import { useConversationList } from "@/hooks/conversations/use-conversation-list";
import { useConversationMessages } from "@/hooks/conversations/use-conversation-messages";
import { useEmailWorkspaceRealtime } from "@/hooks/email/use-email-workspace-realtime";
import {
  isDeskSoundEnabled,
  subscribeDeskPreferences,
  toggleDeskSoundEnabled,
} from "@/lib/omnichannel/presentation/desk-notification-sound";
import { useTeamInboxReply } from "@/hooks/conversations/use-team-inbox-reply";
import { useConversationServices } from "@/lib/ai-conversation";
import { linkCustomerViaBackend } from "@/lib/conversation-lifecycle/adapters/backend-action-executor";
import {
  extractParticipantCandidatesFromConversationMetadata,
  type EmailRecipientSuggestionCandidate,
} from "@/lib/email-workspace/email-recipient-suggestions";
import { Link } from "wouter";
import {
  buildEmailComposerDraftPatch,
  buildEmailThreadParticipantSnapshot,
  buildEmailWorkspaceOutboundMetadata,
  buildSafeForwardDraftFromMessage,
  isDiscardedEmailComposeConversation,
  EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD,
  recipientFieldHasContent,
  readConversationMessageAttachments,
  readEmailComposerDraft,
  type EmailComposerDraftAttachment,
  type EmailComposerDraftState,
} from "@/lib/email-workspace/email-thread-outbound";
import {
  buildNewEmailConversationCreateInput,
  EMAIL_COMPOSE_ORIGIN,
  EMAIL_COMPOSE_ORIGIN_KEY,
  emailWorkspaceChannelToCandidate,
  ensureCompanyEmailChannelForCompose,
  evaluateNewEmailSend,
  evaluateNewEmailStart,
  formatCompanyFromIdentity,
  invalidComposerAddresses,
  listCompanyEmailSenderOptions,
  resolveNewEmailAssistantId,
  resolveNewEmailCompanyChannelId,
  resolveSelectedCompanyEmailChannelId,
  shouldShowComposeMode,
} from "@/lib/email-workspace/email-compose-new";
import {
  buildDiscardedEmailComposeMetadata,
  emailDraftHasDiscardableContent,
  planDiscardEmailDraft,
} from "@/lib/email-workspace/email-compose-discard";
import {
  buildEmailWorkspaceListItemDisplay,
  findReusableEmptyNewEmailComposeShell,
  formatEmailListTemplateDisplay,
  sortEmailWorkspaceConversations,
  type EmailWorkspaceListCustomer,
} from "@/lib/email-workspace/email-workspace-list-item";
import {
  buildEmailWorkspaceMetricSearch,
  matchesEmailWorkspaceMetricFilter,
  readEmailWorkspaceMetricFromSearch,
  type EmailWorkspaceMetricFilter,
} from "@/lib/email-workspace/email-workspace-metric-filter";
import {
  EMAIL_WORKSPACE_ASSIGNEE_ALL,
  EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED,
  assigneeFilterToListAssignedUserId,
  readEmailWorkspaceAssigneeFromSearch,
  type EmailWorkspaceAssigneeFilter,
} from "@/lib/email-workspace/email-workspace-assignee-filter";
import { EmployeeIdentityService } from "@/lib/employee-identity/employee-identity-service";
import {
  EMAIL_HTML_DOCUMENT_CLASSNAME,
  readConversationEmailHtml,
  renderConversationEmailHtml,
} from "@/lib/email-workspace/email-message-html";
import {
  emailComposerDraftAutosaveFingerprint,
  hasActiveEmailWorkspaceDraft,
  isUnchangedEmailComposerDraftPersist,
  resolveEmailComposerDraftUpdatedAtForPersist,
  shouldPersistEmailComposerDraft,
} from "@/lib/email-workspace/email-workspace-draft-integrity";
import {
  htmlToPlainText,
  insertTemplateIntoRichBody,
  plainTextToSafeHtml,
  sanitizeComposerHtml,
} from "@/lib/email-workspace/email-composer-rich-text";
import { useChannelRegistryServices } from "@/lib/channel-registry";
import { canAssignEmailConversation } from "@/lib/email-workspace/email-conversation-assignment";
import { findExactCompanyCustomerByEmail } from "@/lib/email-workspace/email-compose-customer-lookup";
import { ensureEmailComposeChannelSession } from "@/lib/omnichannel/services/channel-session-resolver";
import {
  EMAIL_COMPOSER_ATTACHMENT_ACCEPT,
  EMAIL_COMPOSER_MAX_ATTACHMENTS,
  FeatureNotEntitledError,
  formatEmailAttachmentSize,
  removeEmailComposerAttachmentObject,
  uploadEmailComposerAttachment,
  validateEmailComposerFile,
} from "@/lib/email-workspace/email-composer-attachments";
import {
  fetchEmailSuggestedReplies,
  generateEmailAiDraft,
  generateEmailThreadSummary,
  type EmailAiAssistAction,
} from "@/lib/email-workspace/email-ai-assist";
import {
  EmailAiWriteAuthError,
  requestEmailAiDraft,
  shouldApplyEmailAiDraft,
  type EmailAiDraftResponse,
  type EmailAiWriteLanguage,
  type EmailAiWriteMode,
  type EmailAiWriteTone,
} from "@/lib/email-workspace/email-ai-write";
import { EmailAiWritePanel } from "@/components/email/email-ai-write-panel";
import {
  assertTicketLinkScope,
  linkOpenTicketToConversation,
  listCompanyCustomerOpenTickets,
} from "@/lib/email-workspace/email-compose-ticket-link";
import { batchConversationActiveTicketContexts } from "@/lib/omnichannel/services/conversation-ticket-context";
import {
  EMAIL_TEMPLATES_TAB_PERMISSION,
  canManageEmailConnection,
} from "@/lib/email-workspace/email-tab-permissions";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const DRAFT_SAVE_DEBOUNCE_MS = 800;

type ComposerFields = {
  mode: EmailComposerMode;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  /** Editable rich-text HTML (signature is NOT embedded). */
  body: string;
  selectedChannelId: string | null;
  templateUnresolved: string[];
};

const EMPTY_COMPOSER: ComposerFields = {
  mode: "reply",
  to: [],
  cc: [],
  bcc: [],
  subject: "",
  body: "",
  selectedChannelId: null,
  templateUnresolved: [],
};

type ComposerAttachmentItem = EmailComposerDraftAttachment & {
  status: "uploading" | "uploaded" | "failed";
  error?: string;
  progress?: number;
};

function toDraftAttachments(items: ComposerAttachmentItem[]): EmailComposerDraftAttachment[] {
  return items
    .filter((item) => item.status === "uploaded")
    .map((item) => ({
      id: item.id,
      name: item.name,
      storagePath: item.storagePath,
      mimeType: item.mimeType,
      fileSize: item.fileSize,
      kind: item.kind,
    }));
}

const OPEN_TICKET_STATUSES = new Set(["open", "in_progress", "waiting_customer"]);

function formatMessageSubject(message: ConversationMessageRecord): string {
  const subject = message.metadata?.subject;
  return typeof subject === "string" && subject.trim() ? subject.trim() : "";
}

function formatMessageSender(message: ConversationMessageRecord): string {
  const meta = message.metadata ?? {};
  const from = meta.from;
  if (from && typeof from === "object") {
    const record = from as Record<string, unknown>;
    const email =
      typeof record.email === "string"
        ? record.email
        : typeof record.address === "string"
          ? record.address
          : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (email && name) return `${name} <${email}>`;
    if (email) return email;
  }
  if (typeof meta.senderExternalId === "string" && meta.senderExternalId.includes("@")) {
    return meta.senderExternalId;
  }
  return message.message_type === "outgoing" ? "—" : "—";
}

function buildThreadText(messages: ConversationMessageRecord[]): string {
  return messages
    .filter((m) => m.message_type === "incoming" || m.message_type === "outgoing")
    .map((m) => {
      const who = m.message_type === "incoming" ? "Customer" : "Agent";
      const subject = formatMessageSubject(m);
      return `[${who}${subject ? ` | ${subject}` : ""}]\n${m.content}`;
    })
    .join("\n\n");
}

function LtrIsolate({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" style={{ unicodeBidi: "isolate" }} className={className}>
      {children}
    </span>
  );
}

function emailDisplayPrefersLtr(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0590-\u05FF]/.test(value)) return false;
  return /[A-Za-z]/.test(value);
}

function EmailComposerFieldRow({
  label,
  htmlFor,
  children,
  trailing,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-2">
      <label
        htmlFor={htmlFor}
        className="w-[4.75rem] shrink-0 pt-1.5 text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
      {trailing ? <div className="shrink-0 pt-0.5">{trailing}</div> : null}
    </div>
  );
}

function EmailReadableText({
  children,
  className,
  ltr = false,
}: {
  children: ReactNode;
  className?: string;
  ltr?: boolean;
}) {
  const isolateLtr = ltr || emailDisplayPrefersLtr(children);
  return (
    <span
      dir={isolateLtr ? "ltr" : "auto"}
      style={{ unicodeBidi: isolateLtr ? "isolate" : "plaintext" }}
      className={cn(isolateLtr && "inline-block max-w-full", className)}
    >
      {children}
    </span>
  );
}

function formatEmailWorkspaceActivityAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type EmailWorkspacePanelProps = {
  /** Optional conversation id from parent (overrides URL when set). */
  initialConversationId?: string | null;
  /** Lock the list to one KPI (Sent route uses "sent"). */
  forcedMetric?: EmailWorkspaceMetricFilter | null;
};

export function EmailWorkspacePanel({
  initialConversationId = null,
  forcedMetric = null,
}: EmailWorkspacePanelProps) {
  const { t, i18n } = useTranslation("common");
  const { user, profile, company } = useAuth();
  const { isSuperAdmin, hasPermission } = useAuthUser();
  const { isRefreshing: rbacRefreshing } = usePermissions();
  const { lookup: commercialFeatureEnabled } = useCommercialFeatureLookup();
  const companyId = profile?.company_id ?? null;
  const [, setLocation] = useLocation();
  const canReadEmailSettings = canManageEmailConnection(hasPermission, isSuperAdmin);
  const canReadEmailTemplates = isSuperAdmin || hasPermission(EMAIL_TEMPLATES_TAB_PERMISSION);
  const workspaceChannelQuery = useEmailWorkspaceCompanyChannel(companyId);
  const emailSettingsQuery = useEmailSettings(companyId);
  const emailSettings = emailSettingsQuery.data;
  const emailSettingsReady =
    !canReadEmailSettings || emailSettingsQuery.isSuccess || emailSettingsQuery.isError;
  const composeFromEmail =
    emailSettings?.fromEmail ?? workspaceChannelQuery.data?.fromEmail ?? null;
  const composeFromName =
    emailSettings?.fromName ?? workspaceChannelQuery.data?.fromName ?? null;
  const emailWorkspaceChannels = useMemo(() => {
    if (!companyId || !workspaceChannelQuery.data) return [];
    return [emailWorkspaceChannelToCandidate(workspaceChannelQuery.data)];
  }, [companyId, workspaceChannelQuery.data]);
  const emailCompanyChannel = workspaceChannelQuery.data
    ? emailWorkspaceChannelToCandidate(workspaceChannelQuery.data)
    : null;
  const { data: assistantSettings } = useAiAssistantSettings(companyId);
  const assistantEntitled = isSuperAdmin || commercialFeatureEnabled("ai_assistant") === true;
  const suggestedEntitled =
    isSuperAdmin || commercialFeatureEnabled("ai_suggested_replies") === true;
  const canTranslateIncomingMessages =
    Boolean(companyId) &&
    assistantEntitled &&
    (isSuperAdmin || hasPermission("ai.conversations.reply"));
  const canAssignSelectedEmailConversation = canAssignEmailConversation({
    isSuperAdmin,
    hasPermission,
  });
  const { data: brandCenter } = useCompanyBrandCenter(companyId, Boolean(companyId));
  const { data: myEmailIdentity } = useMyEmailIdentity(Boolean(companyId));
  const trustedCompany = useMemo(
    () => ({
      profileCompanyId: companyId,
      company:
        company && companyId && company.id === companyId
          ? { id: company.id, name: company.name }
          : null,
      brandCenterCompanyName: brandCenter?.general?.companyName ?? null,
    }),
    [brandCenter?.general?.companyName, company, companyId],
  );
  const effectiveSignature = useMemo(
    () =>
      resolveEffectiveEmailSignature({
        personalSignature: myEmailIdentity?.personal?.signature ?? null,
        companySignature: brandCenter?.email?.signature ?? null,
      }),
    [brandCenter?.email?.signature, myEmailIdentity?.personal?.signature],
  );
  const companySignatureSourceHtml = effectiveSignature.html;
  const companyEmailLogoUrl = useMemo(
    () =>
      sanitizeEmailLogoUrl(
        brandCenter?.logos ? resolveEmailLogoUrl(brandCenter.logos) : null,
      ),
    [brandCenter?.logos],
  );
  const companySignatureHtml = useMemo(
    () =>
      renderCompanySignatureHtml({
        signatureHtml: companySignatureSourceHtml,
        trustedCompany,
      }),
    [companySignatureSourceHtml, trustedCompany],
  );
  const trustedCompanyName = useMemo(
    () => resolveTrustedCompanyNameForEmailTemplates(trustedCompany),
    [trustedCompany],
  );
  const listTemplateVariables = useMemo(
    () => (trustedCompanyName ? { "company.name": trustedCompanyName } : {}),
    [trustedCompanyName],
  );
  const findComposerUnresolved = useCallback(
    (...parts: string[]) =>
      findUnresolvedTemplateTokensAfterCompanyResolution(parts, trustedCompany),
    [trustedCompany],
  );
  const search = useSearch();
  const queryClient = useQueryClient();
  const { services, context } = useConversationServices();
  const { services: channelRegistryServices, context: channelRegistryContext } =
    useChannelRegistryServices();

  const urlConversationId = useMemo(() => {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return params.get("conversation")?.trim() || null;
  }, [search]);

  const composeRequest = useMemo(() => {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    return params.get("compose")?.trim() || null;
  }, [search]);

  const metricFilter = useMemo(
    () => forcedMetric ?? readEmailWorkspaceMetricFromSearch(search),
    [forcedMetric, search],
  );
  const assigneeFilter = useMemo(
    () => readEmailWorkspaceAssigneeFromSearch(search),
    [search],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversationId ?? urlConversationId,
  );
  const [composer, setComposer] = useState<ComposerFields>(EMPTY_COMPOSER);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachmentItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [attachDragOver, setAttachDragOver] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftSavedAgeSec, setDraftSavedAgeSec] = useState(0);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiWriteOpen, setAiWriteOpen] = useState(false);
  const [aiWriteDefaultMode, setAiWriteDefaultMode] = useState<EmailAiWriteMode>("generate");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [threadSummary, setThreadSummary] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [linkCustomerOpen, setLinkCustomerOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [composeBusy, setComposeBusy] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [pendingCreatedConversation, setPendingCreatedConversation] =
    useState<ConversationRecord | null>(null);
  const [sendValidationError, setSendValidationError] = useState<string | null>(null);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [showCcBcc, setShowCcBcc] = useState(false);

  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextDraftSaveRef = useRef(false);
  const draftSaveGenerationRef = useRef(0);
  const suppressDraftPersistForConversationIdRef = useRef<string | null>(null);
  const hydratedConversationRef = useRef<string | null>(null);
  /** Fingerprint after hydrate/prefill — open/refetch must not look like an edit. */
  const draftAutosaveBaselineRef = useRef<string | null>(null);
  const selectedForDraftRef = useRef<ConversationRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const composerCardRef = useRef<HTMLDivElement | null>(null);
  const composerAttachmentsRef = useRef<ComposerAttachmentItem[]>([]);
  const composeConsumedRef = useRef<string | null>(null);
  const composeInFlightRef = useRef(false);
  const composeQueuedRef = useRef(false);
  const aiWriteGenerationTokenRef = useRef(0);
  const aiWriteBodySnapshotRef = useRef("");
  const composerRef = useRef(composer);
  composerAttachmentsRef.current = composerAttachments;
  composerRef.current = composer;

  const emailChannelEntitled = commercialFeatureEnabled("email_channel") === true;

  useEffect(() => {
    const next = initialConversationId ?? urlConversationId;
    if (next) setSelectedId(next);
  }, [initialConversationId, urlConversationId]);

  const setAssigneeFilter = useCallback(
    (next: EmailWorkspaceAssigneeFilter) => {
      setLocation(
        buildEmailWorkspaceMetricSearch({
          metric: metricFilter,
          conversationId: selectedId,
          assignee: next,
        }),
      );
    },
    [metricFilter, selectedId, setLocation],
  );

  const listFilters = useMemo(
    () => ({
      channelType: "email" as const,
      searchQuery: searchQuery.trim() || undefined,
      hasEmployeeUnread: unreadOnly ? true : undefined,
      assignedUserId: assigneeFilterToListAssignedUserId(assigneeFilter),
    }),
    [searchQuery, unreadOnly, assigneeFilter],
  );

  const listQuery = useConversationList(listFilters, 100);
  useEmailWorkspaceRealtime(companyId, selectedId, {
    listReady: listQuery.isSuccess || listQuery.isError,
  });

  const assigneeFilterEmployeesQuery = useQuery({
    queryKey: ["email-workspace-assignee-filter-employees", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      if (!companyId) return [];
      const rows = await EmployeeIdentityService.listByCompany(companyId, 200);
      return rows.filter((row) => Boolean(row.userId) && row.status === "active");
    },
  });
  const assigneeFilterEmployees = assigneeFilterEmployeesQuery.data ?? [];
  const [soundEnabled, setSoundEnabled] = useState(() =>
    typeof window === "undefined" ? true : isDeskSoundEnabled(),
  );
  useEffect(() => subscribeDeskPreferences(() => setSoundEnabled(isDeskSoundEnabled())), []);
  const handleToggleNotificationSound = useCallback(() => {
    setSoundEnabled(toggleDeskSoundEnabled());
  }, []);

  const ticketConversationIdsQuery = useQuery({
    queryKey: ["email-workspace-metric-ticket-conversations", companyId],
    enabled: Boolean(companyId && metricFilter === "ticketsCreated"),
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      if (!companyId) return [];
      // Same membership criteria as ticketsCreated metric count (conversation_id + metadata.source=email).
      const { data, error } = await supabase
        .from("support_tickets")
        .select("conversation_id")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .not("conversation_id", "is", null)
        .filter("metadata->>source", "eq", "email");
      if (error) throw new Error(error.message);
      return [
        ...new Set(
          (data ?? [])
            .map((row) => (typeof row.conversation_id === "string" ? row.conversation_id.trim() : ""))
            .filter(Boolean),
        ),
      ];
    },
  });

  const ticketConversationIds = useMemo(
    () => new Set(ticketConversationIdsQuery.data ?? []),
    [ticketConversationIdsQuery.data],
  );

  const conversations = useMemo(
    () =>
      sortEmailWorkspaceConversations(
        (listQuery.data ?? []).filter((conversation) =>
          matchesEmailWorkspaceMetricFilter(conversation, metricFilter, {
            ticketConversationIds,
          }),
        ),
      ),
    [listQuery.data, metricFilter, ticketConversationIds],
  );
  const listCustomerIds = useMemo(
    () =>
      [
        ...new Set(
          conversations
            .map((row) => row.customer_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ].sort(),
    [conversations],
  );
  const listCustomersQuery = useQuery({
    queryKey: ["email-workspace-list-customers", companyId, listCustomerIds.join(",")],
    enabled: Boolean(companyId && listCustomerIds.length > 0),
    staleTime: 30_000,
    queryFn: async (): Promise<EmailWorkspaceListCustomer[]> => {
      if (!companyId || listCustomerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, company_id")
        .eq("company_id", companyId)
        .in("id", listCustomerIds);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: String(row.id),
        companyId: String(row.company_id),
        name: typeof row.name === "string" ? row.name : null,
        email: typeof row.email === "string" ? row.email : null,
      }));
    },
  });
  const listCustomersById = useMemo(() => {
    const map = new Map<string, EmailWorkspaceListCustomer>();
    for (const row of listCustomersQuery.data ?? []) {
      if (row.companyId === companyId) map.set(row.id, row);
    }
    return map;
  }, [companyId, listCustomersQuery.data]);
  const listLabels = useMemo(
    () => ({
      newEmail: t("emailModule.workspace.newEmail"),
      noSubject: t("emailModule.workspace.noSubject"),
    }),
    [t],
  );
  const { data: templates = [] } = useEmailTemplates(companyId, canReadEmailTemplates);
  const enabledTemplates = useMemo(() => templates.filter((row) => row.enabled), [templates]);

  const selectedConversationQuery = useQuery({
    queryKey: ["email-workspace-conversation", selectedId],
    enabled: Boolean(selectedId),
    staleTime: 10_000,
    queryFn: async () => {
      if (!selectedId) return null;
      return services.conversations.getConversation(context, selectedId);
    },
  });

  const selected =
    conversations.find((c) => c.id === selectedId) ??
    selectedConversationQuery.data ??
    (pendingCreatedConversation?.id === selectedId ? pendingCreatedConversation : null);
  selectedForDraftRef.current = selected;

  const messagesQuery = useConversationMessages(selectedId);
  const messages = useMemo(() => {
    const rows = messagesQuery.data ?? [];
    return [...rows].sort(
      (a, b) => a.sequence_number - b.sequence_number || a.created_at.localeCompare(b.created_at),
    );
  }, [messagesQuery.data]);

  /** Trusted company-scoped participant emails from inbox conversations + CRM list. */
  const recipientParticipantCandidates = useMemo((): EmailRecipientSuggestionCandidate[] => {
    const byEmail = new Map<string, EmailRecipientSuggestionCandidate>();
    const push = (candidate: EmailRecipientSuggestionCandidate) => {
      const key = candidate.email.trim().toLowerCase();
      if (!key.includes("@")) return;
      const existing = byEmail.get(key);
      if (!existing || (candidate.displayName && !existing.displayName)) {
        byEmail.set(key, candidate);
      }
    };

    for (const conversation of conversations) {
      if (companyId && conversation.company_id !== companyId) continue;
      for (const row of extractParticipantCandidatesFromConversationMetadata(conversation.metadata)) {
        push(row);
      }
      const linked = conversation.customer_id ? listCustomersById.get(conversation.customer_id) : null;
      if (linked?.email?.trim()) {
        push({
          email: linked.email.trim(),
          displayName: linked.name?.trim() || null,
          customerId: linked.id,
          source: "participant",
        });
      }
    }

    if (messages.length > 0) {
      const snap = buildEmailThreadParticipantSnapshot({
        messages,
        externalThreadId: selected?.external_thread_id,
      });
      if (snap.from?.email) {
        push({
          email: snap.from.email,
          displayName: snap.from.name ?? null,
          source: "participant",
        });
      }
      for (const row of [...(snap.to ?? []), ...(snap.cc ?? [])]) {
        push({
          email: row.email,
          displayName: row.name ?? null,
          source: "participant",
        });
      }
    }

    return [...byEmail.values()];
  }, [companyId, conversations, listCustomersById, messages, selected?.external_thread_id]);

  const { sendReply, isSending, error: sendError, clearError } = useTeamInboxReply(companyId);

  const customerQuery = useQuery({
    queryKey: ["email-workspace-customer", companyId, selected?.customer_id ?? null],
    enabled: Boolean(companyId && selected?.customer_id),
    staleTime: 30_000,
    queryFn: async () => {
      if (!companyId || !selected?.customer_id) return null;
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("company_id", companyId)
        .eq("id", selected.customer_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        id: String(data.id),
        name: String(data.name ?? "").trim() || String(data.id),
        email: data.email ? String(data.email) : null,
        phone: data.phone ? String(data.phone) : null,
      };
    },
  });

  const ticketQuery = useQuery({
    queryKey: ["email-workspace-ticket", companyId, selectedId],
    enabled: Boolean(companyId && selectedId),
    staleTime: 15_000,
    queryFn: async () => {
      if (!companyId || !selectedId) return null;
      const map = await batchConversationActiveTicketContexts({
        client: supabase,
        companyId,
        conversationIds: [selectedId],
      });
      return map.get(selectedId) ?? null;
    },
  });

  const customerTicketsQuery = useQuery({
    queryKey: ["email-workspace-customer-tickets", companyId, selected?.customer_id ?? null],
    enabled: Boolean(companyId && selected?.customer_id && !ticketQuery.data),
    staleTime: 15_000,
    queryFn: async () => {
      if (!companyId || !selected?.customer_id) return [];
      return listCompanyCustomerOpenTickets({
        client: supabase,
        companyId,
        customerId: selected.customer_id,
      });
    },
  });

  const targetLanguage = i18n.language?.toLowerCase().startsWith("ar") ? "ar" : "en";

  const snapshot = useMemo(
    () =>
      buildEmailThreadParticipantSnapshot({
        messages,
        externalThreadId: selected?.external_thread_id,
        conversationSubject:
          typeof selected?.metadata?.subject === "string"
            ? selected.metadata.subject
            : messages.length
              ? formatMessageSubject(messages[messages.length - 1]!)
              : null,
      }),
    [messages, selected?.external_thread_id, selected?.metadata?.subject],
  );

  const lifecycle = useMemo(() => {
    const outgoing = messages.filter((m) => m.message_type === "outgoing");
    const latestOutgoing = outgoing[outgoing.length - 1];
    const activeDraft = hasActiveEmailWorkspaceDraft({
      metadata: selected?.metadata,
      outboundMessageCount: outgoing.length,
      latestOutboundStatus: latestOutgoing?.status ?? null,
    });
    return deriveEmailThreadLifecycle({
      hasIncoming: messages.some((m) => m.message_type === "incoming"),
      hasOutgoing: outgoing.length > 0,
      hasDraft: activeDraft,
      assignedUserId: selected?.assigned_user_id,
      latestOutgoingStatus: latestOutgoing?.status ?? null,
      routing: readEmailRoutingMeta(selected?.metadata),
      ticketNumber: ticketQuery.data?.ticketNumber ?? null,
    });
  }, [messages, selected?.assigned_user_id, selected?.metadata, ticketQuery.data?.ticketNumber]);

  const selectedListDisplay = useMemo(() => {
    if (!selected || !companyId) return null;
    const fromList = selected.customer_id ? listCustomersById.get(selected.customer_id) ?? null : null;
    const fromSelected =
      selected.customer_id && customerQuery.data
        ? {
            id: customerQuery.data.id,
            companyId,
            name: customerQuery.data.name,
            email: customerQuery.data.email,
          }
        : null;
    return buildEmailWorkspaceListItemDisplay({
      conversation: selected,
      companyId,
      customer: fromList ?? fromSelected,
      labels: listLabels,
      templateVariables: listTemplateVariables,
    });
  }, [companyId, customerQuery.data, listCustomersById, listLabels, listTemplateVariables, selected]);

  const applyModePrefill = useCallback(
    (mode: EmailComposerMode, seedMessages: ConversationMessageRecord[], conversation: ConversationRecord | null) => {
      const snap = buildEmailThreadParticipantSnapshot({
        messages: seedMessages,
        externalThreadId: conversation?.external_thread_id,
        conversationSubject:
          typeof conversation?.metadata?.subject === "string" ? conversation.metadata.subject : null,
      });
      const defaultChannelId = conversation?.company_channel_id ?? null;

      if (mode === "compose") {
        setComposer({
          mode,
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body: "",
          selectedChannelId: defaultChannelId,
          templateUnresolved: [],
        });
        return;
      }

      if (mode === "forward") {
        const last =
          [...seedMessages].reverse().find((m) => m.message_type === "incoming" || m.message_type === "outgoing") ??
          null;
        const forward = last ? buildSafeForwardDraftFromMessage(last) : { subject: snap.subject ?? "", body: "" };
        const outbound = buildEmailComposerOutbound({
          mode: "forward",
          snapshot: snap,
          subject: forward.subject,
        });
        setComposer({
          mode,
          to: [],
          cc: [],
          bcc: [],
          subject: outbound.emailSubject,
          body: plainTextToSafeHtml(forward.body),
          selectedChannelId: defaultChannelId,
          templateUnresolved: [],
        });
        return;
      }

      const participants =
        mode === "reply_all"
          ? buildReplyAllParticipants(snap)
          : buildReplyParticipants(snap);
      const outbound = buildEmailComposerOutbound({ mode, snapshot: snap });
      setComposer({
        mode,
        to: [...participants.to],
        cc: [...participants.cc],
        bcc: [],
        subject: outbound.emailSubject,
        body: "",
        selectedChannelId: defaultChannelId,
        templateUnresolved: [],
      });
      if (mode === "reply_all" && participants.cc.length > 0) {
        setShowCcBcc(true);
      }
    },
    [],
  );

  // Hydrate composer from draft or mode defaults when selection / messages settle
  useEffect(() => {
    if (!selectedId || !selected) return;
    if (messagesQuery.isLoading) return;
    if (hydratedConversationRef.current === selectedId) return;

    hydratedConversationRef.current = selectedId;
    skipNextDraftSaveRef.current = true;

    const draft = readEmailComposerDraft(selected.metadata);
    const draftAttachments = draft?.attachments ?? [];
    if (
      draft &&
      (draft.mode === "compose" ||
        draft.body.trim() ||
        (draft.bodyHtml?.trim() ?? "") ||
        recipientFieldHasContent(draft.to) ||
        draft.subject.trim() ||
        recipientFieldHasContent(draft.cc) ||
        recipientFieldHasContent(draft.bcc) ||
        draftAttachments.length > 0)
    ) {
      const bodyHtml =
        typeof draft.bodyHtml === "string"
          ? sanitizeComposerHtml(draft.bodyHtml)
          : plainTextToSafeHtml(draft.body);
      const resolved = resolveCompanyTemplateVariablesInComposerContent({
        subject: draft.subject,
        body: bodyHtml,
        trustedCompany,
      });
      const nextAttachments = draftAttachments.map((item) => ({
        ...item,
        status: "uploaded" as const,
      }));
      setComposer({
        mode: draft.mode,
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: resolved.subject,
        body: resolved.body,
        selectedChannelId: draft.selectedChannelId ?? selected.company_channel_id ?? null,
        templateUnresolved:
          draft.templateUnresolved?.filter((token) => token !== "company.name") ??
          findComposerUnresolved(resolved.subject, resolved.body),
      });
      setShowCcBcc(Boolean(recipientFieldHasContent(draft.cc) || recipientFieldHasContent(draft.bcc)));
      setComposerAttachments(nextAttachments);
      draftAutosaveBaselineRef.current = emailComposerDraftAutosaveFingerprint({
        mode: draft.mode,
        to: draft.to,
        cc: draft.cc,
        bcc: draft.bcc,
        subject: resolved.subject,
        bodyPlain: htmlToPlainText(resolved.body),
        attachmentIds: nextAttachments.map((item) => item.id),
      });
    } else {
      const snap = buildEmailThreadParticipantSnapshot({
        messages,
        externalThreadId: selected.external_thread_id,
        conversationSubject:
          typeof selected.metadata?.subject === "string" ? selected.metadata.subject : null,
      });
      const participants = buildReplyParticipants(snap);
      const outbound = buildEmailComposerOutbound({ mode: "reply", snapshot: snap });
      const prefill: ComposerFields = {
        mode: "reply",
        to: [...participants.to],
        cc: [...participants.cc],
        bcc: [],
        subject: outbound.emailSubject,
        body: "",
        selectedChannelId: selected.company_channel_id ?? null,
        templateUnresolved: [],
      };
      applyModePrefill("reply", messages, selected);
      setComposerAttachments([]);
      draftAutosaveBaselineRef.current = emailComposerDraftAutosaveFingerprint({
        mode: prefill.mode,
        to: prefill.to,
        cc: prefill.cc,
        bcc: prefill.bcc,
        subject: prefill.subject,
        bodyPlain: "",
        attachmentIds: [],
      });
    }
    setAttachmentError(null);
    setSendStatus("idle");
    setAiError(null);
    setSuggestions([]);
    setThreadSummary(null);
    setShowSummary(false);
    clearError();
  }, [
    applyModePrefill,
    clearError,
    findComposerUnresolved,
    messages,
    messagesQuery.isLoading,
    selected,
    selectedId,
    trustedCompany,
  ]);

  // Reset hydration marker when selection changes
  useEffect(() => {
    if (hydratedConversationRef.current && hydratedConversationRef.current !== selectedId) {
      hydratedConversationRef.current = null;
      skipNextDraftSaveRef.current = true;
      draftAutosaveBaselineRef.current = null;
      setComposerAttachments([]);
      setAttachmentError(null);
    }
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || messagesQuery.isLoading) return;
    const frame = window.requestAnimationFrame(() => {
      const scroller = messagesScrollRef.current;
      const card = composerCardRef.current;
      if (!scroller || !card) return;
      const next =
        scroller.scrollTop +
        card.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        8;
      scroller.scrollTop = Math.max(0, next);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedId, messagesQuery.isLoading, messages.length]);

  useEffect(() => {
    if (draftSaveState !== "saved" || !draftSavedAt) {
      setDraftSavedAgeSec(0);
      return;
    }
    const tick = () => setDraftSavedAgeSec(Math.max(0, Math.floor((Date.now() - draftSavedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [draftSaveState, draftSavedAt]);

  const persistDraft = useCallback(
    async (
      conversation: ConversationRecord,
      fields: ComposerFields,
      scheduledGeneration: number = draftSaveGenerationRef.current,
    ) => {
      if (!companyId) return;
      const bodyPlain = htmlToPlainText(fields.body);
      const attachmentCount = toDraftAttachments(composerAttachmentsRef.current).length;
      if (
        !shouldPersistEmailComposerDraft({
          conversationId: conversation.id,
          suppressDraftPersistForConversationId: suppressDraftPersistForConversationIdRef.current,
          sendGeneration: draftSaveGenerationRef.current,
          scheduledGeneration,
          isSending,
          sendStatus,
          composerMode: fields.mode,
          bodyPlain,
          attachmentCount,
        })
      ) {
        return;
      }
      setDraftSaveState("saving");
      try {
        const current = await services.conversations.getConversation(context, conversation.id);
        if (
          !shouldPersistEmailComposerDraft({
            conversationId: conversation.id,
            suppressDraftPersistForConversationId: suppressDraftPersistForConversationIdRef.current,
            sendGeneration: draftSaveGenerationRef.current,
            scheduledGeneration,
            isSending,
            sendStatus,
            composerMode: fields.mode,
            bodyPlain,
            attachmentCount,
          })
        ) {
          return;
        }
        const previousDraft = readEmailComposerDraft(current.metadata);
        const attachments = toDraftAttachments(composerAttachmentsRef.current);
        const draftFields = {
          mode: fields.mode,
          to: fields.to,
          cc: fields.cc,
          bcc: fields.bcc,
          subject: fields.subject,
          body: bodyPlain,
          bodyHtml: sanitizeComposerHtml(fields.body),
          attachments,
        };
        // Open / hydrate round-trips must not rewrite draft.updatedAt or touch the row.
        if (
          isUnchangedEmailComposerDraftPersist({
            previousDraft,
            nextDraft: draftFields,
          })
        ) {
          draftAutosaveBaselineRef.current = emailComposerDraftAutosaveFingerprint({
            mode: fields.mode,
            to: fields.to,
            cc: fields.cc,
            bcc: fields.bcc,
            subject: fields.subject,
            bodyPlain,
            attachmentIds: attachments.map((item) => item.id),
          });
          setDraftSaveState("saved");
          setDraftSavedAt(Date.now());
          return;
        }
        const draft: EmailComposerDraftState = {
          ...draftFields,
          selectedChannelId: fields.selectedChannelId,
          templateUnresolved: fields.templateUnresolved,
          updatedAt: resolveEmailComposerDraftUpdatedAtForPersist({
            previousDraft,
            nextDraft: draftFields,
            nowIso: new Date().toISOString(),
          }),
        };
        const metadata = buildEmailComposerDraftPatch(current.metadata, draft);
        if (fields.mode === "compose") {
          metadata.subject = fields.subject.trim();
          metadata[EMAIL_COMPOSE_ORIGIN_KEY] = EMAIL_COMPOSE_ORIGIN;
          metadata.source = "email_workspace_compose";
        }
        await services.conversations.updateMetadata(context, {
          conversationId: conversation.id,
          metadata,
        });
        if (
          !shouldPersistEmailComposerDraft({
            conversationId: conversation.id,
            suppressDraftPersistForConversationId: suppressDraftPersistForConversationIdRef.current,
            sendGeneration: draftSaveGenerationRef.current,
            scheduledGeneration,
            isSending,
            sendStatus,
            composerMode: fields.mode,
            bodyPlain,
            attachmentCount,
          })
        ) {
          // A send completed while this write was in flight — clear any resurrected draft.
          try {
            const again = await services.conversations.getConversation(context, conversation.id);
            const cleared = buildEmailComposerDraftPatch(again.metadata, null);
            await services.conversations.updateMetadata(context, {
              conversationId: conversation.id,
              metadata: cleared,
            });
          } catch {
            // best-effort
          }
          return;
        }
        draftAutosaveBaselineRef.current = emailComposerDraftAutosaveFingerprint({
          mode: fields.mode,
          to: fields.to,
          cc: fields.cc,
          bcc: fields.bcc,
          subject: fields.subject,
          bodyPlain,
          attachmentIds: toDraftAttachments(composerAttachmentsRef.current).map((item) => item.id),
        });
        setDraftSaveState("saved");
        setDraftSavedAt(Date.now());
        await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
      } catch {
        setDraftSaveState("error");
      }
    },
    [companyId, context, isSending, queryClient, sendStatus, services.conversations],
  );

  const clearDraftMetadata = useCallback(
    async (conversation: ConversationRecord) => {
      const current = await services.conversations.getConversation(context, conversation.id);
      const metadata = buildEmailComposerDraftPatch(current.metadata, null);
      await services.conversations.updateMetadata(context, {
        conversationId: conversation.id,
        metadata,
      });
      await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
    },
    [companyId, context, queryClient, services.conversations],
  );

  const composeStartErrorMessage = (reason: string): string => {
    if (reason === "unauthenticated") return t("emailModule.workspace.composeErrorUnauthenticated");
    if (reason === "no_company") return t("emailModule.workspace.composeErrorNoCompany");
    if (reason === "not_entitled") return t("emailModule.workspace.composeErrorEntitlement");
    if (reason === "rbac") return t("emailModule.workspace.composeErrorRbac");
    if (reason === "no_channel") return t("emailModule.workspace.composeErrorNoChannel");
    if (reason === "no_assistant") return t("emailModule.workspace.composeErrorNoAssistant");
    return t("emailModule.workspace.composeErrorGeneric");
  };

  const startNewEmail = useCallback(async () => {
    if (composeInFlightRef.current) return;
    const resolvedChannel = resolveNewEmailCompanyChannelId({
      companyId,
      channels: emailWorkspaceChannels,
      channelsReady: workspaceChannelQuery.isSuccess,
      channelsFailed: workspaceChannelQuery.isError && !workspaceChannelQuery.isFetching,
      conversations,
      conversationsReady: listQuery.isSuccess || listQuery.isError,
      settingsReady: emailSettingsReady,
      fromEmail: composeFromEmail,
    });
    if (resolvedChannel.status === "pending") {
      composeQueuedRef.current = true;
      setComposeError(null);
      setComposeBusy(true);
      return;
    }
    if (resolvedChannel.status === "lookup_failed") {
      composeQueuedRef.current = false;
      if (composeRequest) composeConsumedRef.current = composeRequest;
      setComposeBusy(false);
      setComposeError(t("emailModule.workspace.composeErrorGeneric"));
      return;
    }
    composeQueuedRef.current = false;

    // Use unfiltered listQuery.data — metric filters (e.g. empty inbox) must not
    // hide existing conversation ai_assistant_id when settings RLS blocks read.
    const fallbackAssistantId = resolveNewEmailAssistantId({
      companyId,
      settingsAssistantId: assistantSettings?.id ?? null,
      conversations: listQuery.data ?? [],
    });
    let fallbackChannelId = resolvedChannel.channelId ?? emailCompanyChannel?.id ?? null;
    const hasEmailView = isSuperAdmin || hasPermission("email.view");
    const canProvisionEmailChannel = isSuperAdmin || hasPermission("channels.manage");
    const hasReplyPermission = hasPermission("ai.conversations.reply");
    const identityGate = evaluateNewEmailStart({
      userId: user?.id ?? null,
      companyId,
      emailChannelEntitled,
      hasReplyPermission,
      isSuperAdmin,
      emailCompanyChannelId: fallbackChannelId ?? "pending-email-channel",
      assistantId: fallbackAssistantId,
    });
    if (!identityGate.ok) {
      if (composeRequest) composeConsumedRef.current = composeRequest;
      setComposeBusy(false);
      setComposeError(composeStartErrorMessage(identityGate.reason));
      return;
    }
    if (!fallbackChannelId && canProvisionEmailChannel) {
      try {
        const ensured = await ensureCompanyEmailChannelForCompose({
          companyId: companyId!,
          existingChannelId: fallbackChannelId,
          fromEmail: composeFromEmail,
          fromName: composeFromName,
          settingsReady: emailSettingsReady,
          getEmailChannelType: async () => {
            try {
              const type = await channelRegistryServices.registry.getChannelType(
                channelRegistryContext,
                "email",
              );
              return type?.id ? { id: type.id } : null;
            } catch {
              return null;
            }
          },
          createConnection: (payload) =>
            channelRegistryServices.companyChannels.createConnection(channelRegistryContext, payload),
        });
        fallbackChannelId = ensured.channelId;
        if (ensured.channelId) {
          await queryClient.invalidateQueries({ queryKey: ["company-channels", companyId] });
          await queryClient.invalidateQueries({ queryKey: ["email", "workspace-channel", companyId] });
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : "";
        if (composeRequest) composeConsumedRef.current = composeRequest;
        setComposeBusy(false);
        if (/permission|not allowed|denied/i.test(detail)) {
          setComposeError(t("emailModule.workspace.composeErrorRbac"));
        } else {
          setComposeError(t("emailModule.workspace.composeErrorGeneric"));
        }
        return;
      }
    }
    const gate = evaluateNewEmailStart({
      userId: user?.id ?? null,
      companyId,
      emailChannelEntitled,
      hasReplyPermission,
      isSuperAdmin,
      emailCompanyChannelId: fallbackChannelId,
      assistantId: fallbackAssistantId,
    });
    if (!gate.ok) {
      if (
        gate.reason === "no_channel" &&
        (rbacRefreshing || !hasEmailView || !workspaceChannelQuery.isSuccess)
      ) {
        composeQueuedRef.current = true;
        composeConsumedRef.current = null;
        setComposeError(null);
        setComposeBusy(true);
        return;
      }
      if (composeRequest) composeConsumedRef.current = composeRequest;
      setComposeBusy(false);
      setComposeError(composeStartErrorMessage(gate.reason));
      return;
    }

    composeInFlightRef.current = true;
    if (composeRequest) composeConsumedRef.current = composeRequest;
    setComposeBusy(true);
    setComposeError(null);
    setSendValidationError(null);
    try {
      const reusable = findReusableEmptyNewEmailComposeShell(conversations);
      if (reusable) {
        hydratedConversationRef.current = null;
        skipNextDraftSaveRef.current = true;
        setPendingCreatedConversation(null);
        setComposer({
          mode: "compose",
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body: "",
          selectedChannelId: reusable.company_channel_id ?? fallbackChannelId!,
          templateUnresolved: [],
        });
        setShowCcBcc(false);
        setComposerAttachments([]);
        setAttachmentError(null);
        setSendStatus("idle");
        setAiError(null);
        setSuggestions([]);
        setThreadSummary(null);
        setShowSummary(false);
        setSelectedId(reusable.id);
        setLocation(
          buildEmailWorkspaceMetricSearch({
            metric: forcedMetric === "sent" ? "incoming" : metricFilter,
            conversationId: reusable.id,
            assignee: assigneeFilter,
          }),
        );
        await ensureEmailComposeChannelSession({
          companyId: companyId!,
          companyChannelId: reusable.company_channel_id ?? fallbackChannelId!,
          conversationId: reusable.id,
          fromEmail: composeFromEmail,
        });
        return;
      }

      const input = buildNewEmailConversationCreateInput({
        companyId: companyId!,
        aiAssistantId: fallbackAssistantId!,
        companyChannelId: fallbackChannelId!,
        signature: companySignatureHtml,
      });
      const created = await services.conversations.createConversation(context, input);
      hydratedConversationRef.current = created.id;
      skipNextDraftSaveRef.current = true;
      setPendingCreatedConversation(created);
      setComposer({
        mode: "compose",
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        body: "",
        selectedChannelId: fallbackChannelId!,
        templateUnresolved: [],
      });
      setShowCcBcc(false);
      setComposerAttachments([]);
      setAttachmentError(null);
      setSendStatus("idle");
      setAiError(null);
      setSuggestions([]);
      setThreadSummary(null);
      setShowSummary(false);
      setSelectedId(created.id);
      setLocation(
        buildEmailWorkspaceMetricSearch({
          metric: forcedMetric === "sent" ? "incoming" : metricFilter,
          conversationId: created.id,
          assignee: assigneeFilter,
        }),
      );
      await ensureEmailComposeChannelSession({
        companyId: companyId!,
        companyChannelId: fallbackChannelId!,
        conversationId: created.id,
        fromEmail: composeFromEmail,
      });
      await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["email-workspace-conversation", created.id] });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      if (/permission|not allowed|denied/i.test(detail)) {
        setComposeError(t("emailModule.workspace.composeErrorRbac"));
      } else if (/entitled|feature_not_entitled/i.test(detail)) {
        setComposeError(t("emailModule.workspace.composeErrorEntitlement"));
      } else {
        setComposeError(t("emailModule.workspace.composeErrorGeneric"));
      }
    } finally {
      composeInFlightRef.current = false;
      setComposeBusy(false);
    }
  }, [
    assistantSettings,
    channelRegistryContext,
    channelRegistryServices.companyChannels,
    channelRegistryServices.registry,
    emailWorkspaceChannels,
    workspaceChannelQuery.isError,
    workspaceChannelQuery.isFetching,
    workspaceChannelQuery.isSuccess,
    companyId,
    companySignatureHtml,
    composeRequest,
    conversations,
    context,
    emailChannelEntitled,
    emailCompanyChannel,
    composeFromEmail,
    composeFromName,
    emailSettingsReady,
    forcedMetric,
    hasPermission,
    isSuperAdmin,
    rbacRefreshing,
    listQuery.isError,
    listQuery.isSuccess,
    metricFilter,
    queryClient,
    services.conversations,
    setLocation,
    t,
    user?.id,
  ]);

  useEffect(() => {
    if (rbacRefreshing || listQuery.isLoading || workspaceChannelQuery.isPending) return;
    if (composeRequest && composeConsumedRef.current !== composeRequest) {
      void startNewEmail();
      return;
    }
    if (composeQueuedRef.current) {
      void startNewEmail();
    }
  }, [workspaceChannelQuery.isPending, composeRequest, listQuery.isLoading, rbacRefreshing, startNewEmail]);

  // Debounced auto-save draft
  useEffect(() => {
    if (!selectedId) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    if (isSending || sendStatus === "sending" || sendStatus === "success") return;
    if (suppressDraftPersistForConversationIdRef.current === selectedId) {
      // After successful send, keep suppress until the user starts a new contentful draft.
      const bodyPlain = htmlToPlainText(composer.body);
      const hasContent = emailDraftHasDiscardableContent({
        to: composer.to,
        cc: composer.cc,
        bcc: composer.bcc,
        subject: composer.subject,
        bodyPlain,
        attachmentCount: toDraftAttachments(composerAttachments).length,
      });
      if (!hasContent) return;
      suppressDraftPersistForConversationIdRef.current = null;
    }

    const bodyPlain = htmlToPlainText(composer.body);
    const fingerprint = emailComposerDraftAutosaveFingerprint({
      mode: composer.mode,
      to: composer.to,
      cc: composer.cc,
      bcc: composer.bcc,
      subject: composer.subject,
      bodyPlain,
      attachmentIds: toDraftAttachments(composerAttachments).map((item) => item.id),
    });
    // Opening / mark-read list refetch must not persist identical composer state.
    if (
      draftAutosaveBaselineRef.current != null &&
      fingerprint === draftAutosaveBaselineRef.current
    ) {
      return;
    }

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    const scheduledGeneration = draftSaveGenerationRef.current;
    draftTimerRef.current = setTimeout(() => {
      const conversation = selectedForDraftRef.current;
      if (!conversation || conversation.id !== selectedId) return;
      void persistDraft(conversation, composer, scheduledGeneration);
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
    // Intentionally omit `selected`: list refetch after mark-read changes object
    // identity and must not re-trigger draft autosave / Pending reclassification.
  }, [composer, composerAttachments, isSending, persistDraft, selectedId, sendStatus]);

  const handleModeChange = (mode: EmailComposerMode) => {
    if (!selected) return;
    skipNextDraftSaveRef.current = true;
    applyModePrefill(mode, messages, selected);
    // Baseline is refreshed on next paint from the prefilled composer via effect skip;
    // set a provisional baseline so an intervening list refetch cannot persist prefill.
    const snap = buildEmailThreadParticipantSnapshot({
      messages,
      externalThreadId: selected.external_thread_id,
      conversationSubject:
        typeof selected.metadata?.subject === "string" ? selected.metadata.subject : null,
    });
    if (mode === "compose") {
      draftAutosaveBaselineRef.current = emailComposerDraftAutosaveFingerprint({
        mode: "compose",
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        bodyPlain: "",
        attachmentIds: [],
      });
    } else if (mode === "forward") {
      const last =
        [...messages].reverse().find((m) => m.message_type === "incoming" || m.message_type === "outgoing") ??
        null;
      const forward = last ? buildSafeForwardDraftFromMessage(last) : { subject: snap.subject ?? "", body: "" };
      const outbound = buildEmailComposerOutbound({
        mode: "forward",
        snapshot: snap,
        subject: forward.subject,
      });
      draftAutosaveBaselineRef.current = emailComposerDraftAutosaveFingerprint({
        mode: "forward",
        to: [],
        cc: [],
        bcc: [],
        subject: outbound.emailSubject,
        bodyPlain: forward.body,
        attachmentIds: [],
      });
    } else {
      const participants =
        mode === "reply_all" ? buildReplyAllParticipants(snap) : buildReplyParticipants(snap);
      const outbound = buildEmailComposerOutbound({ mode, snapshot: snap });
      draftAutosaveBaselineRef.current = emailComposerDraftAutosaveFingerprint({
        mode,
        to: [...participants.to],
        cc: [...participants.cc],
        bcc: [],
        subject: outbound.emailSubject,
        bodyPlain: "",
        attachmentIds: [],
      });
    }
  };

  const attachmentReasonMessage = (reason: string): string => {
    if (reason === "too_large") return t("emailModule.workspace.attachmentTooLarge");
    if (reason === "too_many") return t("emailModule.workspace.tooManyAttachments");
    if (reason === "dangerous_type") return t("emailModule.workspace.dangerousAttachment");
    if (reason === "invalid_filename") return t("emailModule.workspace.invalidAttachmentName");
    if (reason === "unsupported_type") return t("emailModule.workspace.unsupportedAttachment");
    if (reason === "FEATURE_NOT_ENTITLED" || /feature_not_entitled|not entitled/i.test(reason)) {
      return t("emailModule.workspace.attachmentEntitlementDenied");
    }
    return t("emailModule.workspace.attachmentUploadError");
  };

  const handleAttachFiles = async (fileList: FileList | File[]) => {
    if (!selected || !companyId || isSending) return;
    if (!emailChannelEntitled) {
      setAttachmentError(t("emailModule.workspace.attachmentEntitlementDenied"));
      return;
    }

    const incoming = [...fileList];
    if (incoming.length === 0) return;

    setAttachmentError(null);
    const uploadedNow: ComposerAttachmentItem[] = [];

    for (const file of incoming) {
      const currentCount =
        composerAttachmentsRef.current.filter((item) => item.status !== "failed").length +
        uploadedNow.length;
      const validated = validateEmailComposerFile(file, currentCount);
      if (!validated.ok) {
        setAttachmentError(attachmentReasonMessage(validated.reason));
        continue;
      }

      const localId = crypto.randomUUID();
      const uploading: ComposerAttachmentItem = {
        id: localId,
        name: validated.filename,
        storagePath: "",
        mimeType: validated.mimeType,
        fileSize: file.size,
        kind: validated.kind,
        status: "uploading",
        progress: 8,
      };
      setComposerAttachments((prev) => {
        const next = [...prev, uploading];
        composerAttachmentsRef.current = next;
        return next;
      });

      try {
        const uploaded = await uploadEmailComposerAttachment({
          companyId,
          conversationId: selected.id,
          file,
          currentCount,
          onProgress: (progress) => {
            setComposerAttachments((prev) => {
              const next = prev.map((row) =>
                row.id === localId ? { ...row, progress: Math.max(8, Math.min(99, progress)) } : row,
              );
              composerAttachmentsRef.current = next;
              return next;
            });
          },
        });
        const item: ComposerAttachmentItem = {
          id: uploaded.id,
          name: uploaded.name,
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          fileSize: uploaded.fileSize,
          kind: uploaded.kind,
          status: "uploaded",
        };
        uploadedNow.push(item);
        setComposerAttachments((prev) => {
          const next = prev.map((row) => (row.id === localId ? item : row));
          composerAttachmentsRef.current = next;
          return next;
        });
      } catch (err) {
        const reason =
          err instanceof FeatureNotEntitledError
            ? "FEATURE_NOT_ENTITLED"
            : err instanceof Error
              ? err.message
              : "upload_failed";
        setComposerAttachments((prev) => {
          const next = prev.map((row) =>
            row.id === localId ? { ...row, status: "failed" as const, error: reason } : row,
          );
          composerAttachmentsRef.current = next;
          return next;
        });
        setAttachmentError(attachmentReasonMessage(reason));
      }
    }

    if (uploadedNow.length > 0) {
      skipNextDraftSaveRef.current = false;
      void persistDraft(selected, composer);
    }
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!selected || !companyId) return;
    const target = composerAttachmentsRef.current.find((item) => item.id === attachmentId);
    setComposerAttachments((prev) => {
      const next = prev.filter((item) => item.id !== attachmentId);
      composerAttachmentsRef.current = next;
      return next;
    });
    setAttachmentError(null);

    if (target?.status === "uploaded" && target.storagePath) {
      try {
        await removeEmailComposerAttachmentObject({
          companyId,
          conversationId: selected.id,
          storagePath: target.storagePath,
        });
      } catch {
        // Draft already dropped the ref; storage cleanup is best-effort and must not send.
      }
    }
    skipNextDraftSaveRef.current = false;
    void persistDraft(selected, composer);
  };

  const handleSend = async () => {
    if (!selected || !companyId || isSending) return;
    const resolvedContent = resolveCompanyTemplateVariablesInComposerContent({
      subject: composer.subject,
      body: composer.body,
      trustedCompany,
    });
    const bodyPlain = htmlToPlainText(resolvedContent.body).trim();
    const uploaded = toDraftAttachments(composerAttachmentsRef.current);
    const uploading = composerAttachmentsRef.current.some((item) => item.status === "uploading");
    const unresolvedTokens = findComposerUnresolved(
      resolvedContent.subject,
      resolvedContent.body,
    );
    setSendValidationError(null);

    if (composer.mode === "compose") {
      const gate = evaluateNewEmailSend({
        to: composer.to,
        cc: composer.cc,
        bcc: composer.bcc,
        subject: resolvedContent.subject,
        body: bodyPlain,
        attachmentCount: uploaded.length,
        uploading,
        unresolvedTemplateTokens: unresolvedTokens,
      });
      if (!gate.ok) {
        if (gate.reason === "missing_to") setSendValidationError(t("emailModule.workspace.toRequired"));
        else if (gate.reason === "invalid_to") {
          setSendValidationError(
            gate.invalidAddresses?.length
              ? t("emailModule.workspace.invalidRecipientList", {
                  addresses: gate.invalidAddresses.join(", "),
                })
              : t("emailModule.workspace.invalidRecipient"),
          );
        } else if (gate.reason === "recipient_limit") {
          setSendValidationError(
            t("emailModule.workspace.recipientLimit", {
              count: gate.limit ?? 100,
            }),
          );
        } else if (gate.reason === "missing_subject") setSendValidationError(t("emailModule.workspace.subjectRequired"));
        else if (gate.reason === "missing_body") setSendValidationError(t("emailModule.workspace.bodyRequired"));
        else if (gate.reason === "unresolved_template") {
          setSendValidationError(
            t("emailModule.workspace.unresolvedTemplate", {
              tokens: (gate.unresolvedTokens ?? unresolvedTokens).map((token) => `{{${token}}}`).join(", "),
            }),
          );
        }
        setComposer((prev) => ({
          ...prev,
          subject: resolvedContent.subject,
          body: resolvedContent.body,
          templateUnresolved: unresolvedTokens,
        }));
        return;
      }
    } else {
      if (uploading) return;
      if (!bodyPlain && uploaded.length === 0) return;
      const invalidRecipients = [
        ...invalidComposerAddresses(composer.to),
        ...invalidComposerAddresses(composer.cc),
        ...invalidComposerAddresses(composer.bcc),
      ];
      if (invalidRecipients.length > 0) {
        setSendValidationError(
          t("emailModule.workspace.invalidRecipientList", {
            addresses: invalidRecipients.join(", "),
          }),
        );
        return;
      }
      if (
        composer.to.length > EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD ||
        composer.cc.length > EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD ||
        composer.bcc.length > EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD
      ) {
        setSendValidationError(
          t("emailModule.workspace.recipientLimit", {
            count: EMAIL_COMPOSER_MAX_RECIPIENTS_PER_FIELD,
          }),
        );
        return;
      }
      if (unresolvedTokens.length > 0) {
        setSendValidationError(
          t("emailModule.workspace.unresolvedTemplate", {
            tokens: unresolvedTokens.map((token) => `{{${token}}}`).join(", "),
          }),
        );
        setComposer((prev) => ({
          ...prev,
          subject: resolvedContent.subject,
          body: resolvedContent.body,
          templateUnresolved: unresolvedTokens,
        }));
        return;
      }
    }

    const sender = resolveSelectedCompanyEmailChannelId({
      companyId,
      channels: emailWorkspaceChannels,
      selectedChannelId: composer.selectedChannelId ?? selected.company_channel_id,
      settingsFromEmail: composeFromEmail,
      settingsFromName: composeFromName,
    });
    const companyChannelId = sender?.channelId ?? selected.company_channel_id;
    if (!companyChannelId) {
      setSendValidationError(t("emailModule.workspace.fromNotConfigured"));
      return;
    }

    setSendStatus("sending");
    clearError();
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftSaveGenerationRef.current += 1;
    suppressDraftPersistForConversationIdRef.current = selected.id;
    skipNextDraftSaveRef.current = true;

    try {
      const outboundHtml = buildComposerOutboundHtml({
        bodyHtml: resolvedContent.body,
        signatureHtml: companySignatureSourceHtml,
        logoUrl: companyEmailLogoUrl,
        legalFooterEnabled: brandCenter?.email?.showLegalFooter === true,
        legalFooterText: brandCenter?.email?.legalText ?? "",
        trustedCompany,
      });
      const outboundText = buildComposerOutboundText({
        bodyHtml: resolvedContent.body,
        signatureHtml: companySignatureSourceHtml,
        logoUrl: companyEmailLogoUrl,
        legalFooterEnabled: brandCenter?.email?.showLegalFooter === true,
        legalFooterText: brandCenter?.email?.legalText ?? "",
        trustedCompany,
      });

      const emailOutbound: Record<string, unknown> = {
        ...buildEmailWorkspaceOutboundMetadata({
          mode: composer.mode === "compose" ? "compose" : composer.mode,
          messages,
          externalThreadId: selected.external_thread_id,
          conversationSubject: resolvedContent.subject,
          to: composer.to,
          cc: composer.cc,
          bcc: composer.bcc,
          subject: resolvedContent.subject,
        }),
        htmlSanitized: outboundHtml,
      };

      if (
        typeof emailOutbound.recipientEmail !== "string" ||
        !emailOutbound.recipientEmail.trim()
      ) {
        setSendStatus("error");
        setSendValidationError(t("emailModule.workspace.toRequired"));
        return;
      }

      if (composer.mode === "compose") {
        await ensureEmailComposeChannelSession({
          companyId,
          companyChannelId,
          conversationId: selected.id,
          fromEmail: sender?.option.fromEmail ?? composeFromEmail,
        });
      }

      if (composer.mode === "compose" && !selected.customer_id) {
        try {
          const customerId = await findExactCompanyCustomerByEmail({
            companyId,
            recipientEmail: String(emailOutbound.recipientEmail),
          });
          if (customerId) {
            await linkCustomerViaBackend(services, context, {
              conversationId: selected.id,
              customerId,
              companyId,
              metadata: selected.metadata ?? {},
            });
            await queryClient.invalidateQueries({
              queryKey: ["email-workspace-conversation", selected.id],
            });
            await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
          }
        } catch {
          // Send remains allowed without a customer when identity is unknown or ambiguous.
        }
      }

      const ok = await sendReply(
        {
          conversationId: selected.id,
          companyChannelId,
          channelKey: "email",
          externalThreadId: selected.external_thread_id,
        },
        {
          text: outboundText || bodyPlain,
          mode: "reply",
          attachments: uploaded.map((item) => ({
            id: item.id,
            name: item.name,
            url: null,
            storagePath: item.storagePath,
            mimeType: item.mimeType,
            fileSize: item.fileSize,
            kind: item.kind,
          })),
          emailOutbound,
        },
      );

      if (ok) {
        setSendStatus("success");
        draftSaveGenerationRef.current += 1;
        suppressDraftPersistForConversationIdRef.current = selected.id;
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        skipNextDraftSaveRef.current = true;
        try {
          await clearDraftMetadata(selected);
        } catch {
          // send succeeded; draft clear is best-effort
        }
        setComposerAttachments([]);
        setAttachmentError(null);
        setShowCcBcc(false);
        setComposer({
          mode: "reply",
          to: [],
          cc: [],
          bcc: [],
          subject: "",
          body: "",
          selectedChannelId: composer.selectedChannelId,
          templateUnresolved: [],
        });
        await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
        await queryClient.invalidateQueries({
          queryKey: ["email-workspace-conversation", selected.id],
        });
        await queryClient.invalidateQueries({
          queryKey: ["conversation-messages", selected.id],
        });
      } else {
        // Allow draft persistence again after a failed send so content can be edited/retried.
        if (suppressDraftPersistForConversationIdRef.current === selected.id) {
          suppressDraftPersistForConversationIdRef.current = null;
        }
        setSendStatus("error");
      }
    } catch {
      if (suppressDraftPersistForConversationIdRef.current === selected.id) {
        suppressDraftPersistForConversationIdRef.current = null;
      }
      setSendStatus("error");
    }
  };

  const handleSaveDraft = () => {
    if (!selected) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    void persistDraft(selected, composer);
  };

  const runAiAction = async (action: EmailAiAssistAction) => {
    if (!companyId || !selectedId) return;
    const previousBody = composer.body;
    setAiBusy(action);
    setAiError(null);
    try {
      const text = await generateEmailAiDraft({
        companyId,
        conversationId: selectedId,
        action,
        threadText: buildThreadText(messages),
        draftText: htmlToPlainText(composer.body),
        targetLanguage,
        ticketSummary: ticketQuery.data
          ? `${ticketQuery.data.ticketNumber} · ${ticketQuery.data.status} · ${ticketQuery.data.priority}`
          : undefined,
        customerName: customerQuery.data?.name,
      });
      if (text) {
        const body = resolveCompanyTemplateVariablesInText(applyAiHtmlBody(text), trustedCompany);
        setComposer((prev) => ({
          ...prev,
          body,
          templateUnresolved: findComposerUnresolved(prev.subject, body),
        }));
      }
    } catch (err) {
      setComposer((prev) => ({ ...prev, body: previousBody }));
      setAiError(err instanceof Error ? err.message : t("emailModule.workspace.aiError"));
    } finally {
      setAiBusy(null);
    }
  };

  const openAiWrite = (mode: EmailAiWriteMode = "generate") => {
    setAiWriteDefaultMode(mode);
    setAiError(null);
    setAiWriteOpen(true);
  };

  const handleAiWriteGenerate = async (input: {
    instruction: string;
    mode: EmailAiWriteMode;
    outputLanguage: EmailAiWriteLanguage;
    tone: EmailAiWriteTone;
  }): Promise<EmailAiDraftResponse | null> => {
    if (!companyId) return null;
    const token = ++aiWriteGenerationTokenRef.current;
    aiWriteBodySnapshotRef.current = composerRef.current.body;
    setAiBusy("ai_write");
    setAiError(null);
    try {
      const draft = await requestEmailAiDraft({
        companyId,
        instruction: input.instruction,
        mode: input.mode,
        outputLanguage: input.outputLanguage,
        tone: input.tone,
        subject: composerRef.current.subject,
        body: htmlToPlainText(composerRef.current.body),
        conversationId: selectedId ?? undefined,
        updateSubject: input.mode === "generate" && !composerRef.current.subject.trim(),
        // Effective signature is shown/appended separately — never send HTML to the LLM.
        hasExistingSignature: effectiveSignature.source !== "none",
      });
      if (
        !shouldApplyEmailAiDraft({
          requestToken: token,
          currentToken: aiWriteGenerationTokenRef.current,
          composerBodyAtRequest: aiWriteBodySnapshotRef.current,
          currentComposerBody: composerRef.current.body,
        })
      ) {
        // User edited or cancelled/superseded — do not hand stale preview as authoritative insert.
        setAiError(t("emailModule.workspace.aiWrite.error"));
        return null;
      }
      return draft;
    } catch (err) {
      const message =
        err instanceof EmailAiWriteAuthError
          ? t("emailModule.workspace.aiWrite.sessionExpired")
          : err instanceof Error
            ? err.message
            : t("emailModule.workspace.aiWrite.error");
      setAiError(message);
      throw err;
    } finally {
      setAiBusy(null);
    }
  };

  const handleAiWriteInsert = (
    draft: EmailAiDraftResponse,
    mode: EmailAiWriteMode,
    insertMode: "replace" | "below",
  ) => {
    // Bump token so any in-flight generate cannot later overwrite this user-confirmed insert.
    aiWriteGenerationTokenRef.current += 1;
    const current = composerRef.current;
    const bodyHtml =
      insertMode === "below" && htmlToPlainText(current.body).trim()
        ? resolveCompanyTemplateVariablesInText(
            `${current.body}<p><br/></p>${applyAiHtmlBody(draft.body)}`,
            trustedCompany,
          )
        : resolveCompanyTemplateVariablesInText(applyAiHtmlBody(draft.body), trustedCompany);
    const nextSubject =
      mode === "rewrite" && current.subject.trim() && !draft.subject.trim()
        ? current.subject
        : draft.subject.trim()
          ? resolveCompanyTemplateVariablesInText(draft.subject.trim(), trustedCompany)
          : current.subject;
    setComposer((prev) => ({
      ...prev,
      subject: nextSubject,
      body: bodyHtml,
      templateUnresolved: findComposerUnresolved(nextSubject, bodyHtml),
    }));
    setAiWriteOpen(false);
    setAiError(null);
  };

  const loadSuggestions = async () => {
    if (!companyId || !selectedId) return;
    setAiBusy("suggestions");
    setAiError(null);
    try {
      const items = await fetchEmailSuggestedReplies({
        companyId,
        conversationId: selectedId,
        targetLanguage,
      });
      setSuggestions(items);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t("emailModule.workspace.aiError"));
    } finally {
      setAiBusy(null);
    }
  };

  const loadSummary = async () => {
    if (!companyId) return;
    setAiBusy("summary");
    setAiError(null);
    try {
      const summary = await generateEmailThreadSummary({
        companyId,
        threadText: buildThreadText(messages),
        targetLanguage,
      });
      setThreadSummary(summary);
      setShowSummary(true);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t("emailModule.workspace.aiError"));
    } finally {
      setAiBusy(null);
    }
  };

  const insertTemplate = (templateId: string) => {
    const template = enabledTemplates.find((row) => row.id === templateId);
    if (!template) return;
    const rendered = renderEmailTemplate(
      { subject: template.subject, body: template.body },
      buildEmailWorkspaceTemplateRenderContext({
        trustedCompany,
        customer: customerQuery.data
          ? { name: customerQuery.data.name, email: customerQuery.data.email }
          : null,
        ticket: ticketQuery.data
          ? {
              ticketNumber: ticketQuery.data.ticketNumber,
              subject: ticketQuery.data.subject,
              status: ticketQuery.data.status,
              priority: ticketQuery.data.priority,
            }
          : null,
      }),
    );
    const bodyHtml = insertTemplateIntoRichBody({
      currentHtml: composer.body,
      templateBody: rendered.body,
      signatureHtml: "",
    });
    const unresolved = findUnresolvedTemplateTokensAfterCompanyResolution(
      [rendered.subject, rendered.body],
      trustedCompany,
    );
    setComposer((prev) => ({
      ...prev,
      subject: rendered.subject || prev.subject,
      body: bodyHtml,
      templateUnresolved: unresolved,
    }));
    setTemplatePickerOpen(false);
  };

  const handleDiscardDraft = async () => {
    if (!selected || !companyId || discardBusy || isSending) return;
    const bodyPlain = htmlToPlainText(composer.body);
    const hasContent = emailDraftHasDiscardableContent({
      to: composer.to,
      cc: composer.cc,
      bcc: composer.bcc,
      subject: composer.subject,
      bodyPlain,
      attachmentCount: toDraftAttachments(composerAttachmentsRef.current).length,
    });
    if (hasContent) {
      const confirmed = window.confirm(t("emailModule.workspace.discardConfirm"));
      if (!confirmed) return;
    }

    setDiscardBusy(true);
    try {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      const plan = planDiscardEmailDraft({
        metadata: selected.metadata,
        attachments: toDraftAttachments(composerAttachmentsRef.current),
        hasCustomerFacingMessages: messages.some(
          (m) => m.message_type === "incoming" || m.message_type === "outgoing",
        ),
      });

      for (const storagePath of plan.orphanAttachmentPaths) {
        try {
          await removeEmailComposerAttachmentObject({
            companyId,
            conversationId: selected.id,
            storagePath,
          });
        } catch {
          // best-effort orphan cleanup
        }
      }

      const current = await services.conversations.getConversation(context, selected.id);
      const metadata = plan.markDiscarded
        ? buildDiscardedEmailComposeMetadata(current.metadata)
        : buildEmailComposerDraftPatch(current.metadata, null);
      await services.conversations.updateMetadata(context, {
        conversationId: selected.id,
        metadata,
      });

      if (plan.closeConversation) {
        try {
          await services.conversations.closeConversation(context, {
            conversationId: selected.id,
          });
        } catch {
          // metadata discard is enough to hide unused compose shells
        }
      }

      skipNextDraftSaveRef.current = true;
      setComposer(EMPTY_COMPOSER);
      setComposerAttachments([]);
      setAttachmentError(null);
      setSendStatus("idle");
      setSendValidationError(null);
      setSelectedId(null);
      setPendingCreatedConversation(null);
      setLocation(
        buildEmailWorkspaceMetricSearch({
          metric: metricFilter,
          assignee: assigneeFilter,
        }),
      );
    } finally {
      setDiscardBusy(false);
    }
  };

  const senderOptions = useMemo(() => {
    if (!companyId) return [];
    return listCompanyEmailSenderOptions({
      companyId,
      channels: emailWorkspaceChannels,
      settingsFromEmail: composeFromEmail,
      settingsFromName: composeFromName,
    });
  }, [companyId, composeFromEmail, composeFromName, emailWorkspaceChannels]);

  const resolvedSender = useMemo(() => {
    if (!companyId) return null;
    return resolveSelectedCompanyEmailChannelId({
      companyId,
      channels: emailWorkspaceChannels,
      selectedChannelId: composer.selectedChannelId ?? selected?.company_channel_id,
      settingsFromEmail: composeFromEmail,
      settingsFromName: composeFromName,
    });
  }, [
    emailWorkspaceChannels,
    companyId,
    composer.selectedChannelId,
    composeFromEmail,
    composeFromName,
    selected?.company_channel_id,
  ]);

  const fromIdentity =
    resolvedSender?.option.label ||
    formatCompanyFromIdentity({
      fromName: composeFromName,
      fromEmail: composeFromEmail,
    });
  const composerModes: EmailComposerMode[] = shouldShowComposeMode({
    composerMode: composer.mode,
    conversationMetadata: selected?.metadata,
  })
    ? ["compose", "reply", "reply_all", "forward"]
    : ["reply", "reply_all", "forward"];

  const bodyPlainForUi = htmlToPlainText(composer.body);

  const contextPanel = (
    <div className="space-y-4 text-sm">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("emailModule.workspace.customerTitle")}
        </h4>
        {selected?.customer_id ? (
          customerQuery.isLoading ? (
            <p className="text-muted-foreground">{t("emailModule.workspace.loading")}</p>
          ) : customerQuery.data ? (
            <div className="space-y-1 rounded-lg border border-border bg-background p-3">
              <p className="font-medium">{customerQuery.data.name}</p>
              {customerQuery.data.email ? (
                <p>
                  <LtrIsolate>{customerQuery.data.email}</LtrIsolate>
                </p>
              ) : null}
              {customerQuery.data.phone ? (
                <p>
                  <LtrIsolate>{customerQuery.data.phone}</LtrIsolate>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href={`~/dashboard/customers/${customerQuery.data.id}`}
                  className="inline-block text-xs font-medium text-primary underline"
                >
                  {t("emailModule.workspace.openCustomer360")}
                </Link>
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground underline"
                  data-testid="email-unlink-customer"
                  onClick={() => {
                    if (!selected || !companyId) return;
                    void (async () => {
                      const { error } = await supabase
                        .from("conversations")
                        .update({
                          customer_id: null,
                          updated_at: new Date().toISOString(),
                        })
                        .eq("id", selected.id)
                        .eq("company_id", companyId)
                        .is("deleted_at", null);
                      if (error) return;
                      await queryClient.invalidateQueries({
                        queryKey: ["email-workspace-conversation", selected.id],
                      });
                      await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
                    })();
                  }}
                >
                  {t("emailModule.workspace.unlinkCustomer")}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("emailModule.workspace.noCustomer")}</p>
          )
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground">{t("emailModule.workspace.noCustomer")}</p>
            {selected ? (
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => setLinkCustomerOpen(true)}>
                  {t("emailModule.workspace.linkCustomer")}
                </Button>
                <Button type="button" size="sm" variant="ghost" asChild>
                  <Link href="~/dashboard/customers">{t("emailModule.workspace.createCustomer")}</Link>
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("emailModule.workspace.ticketTitle")}
        </h4>
        {ticketQuery.isLoading ? (
          <p className="text-muted-foreground">{t("emailModule.workspace.loading")}</p>
        ) : ticketQuery.data ? (
          <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
            <p className="flex items-center gap-1.5 font-semibold">
              <Ticket className="h-3.5 w-3.5 text-primary" aria-hidden />
              <LtrIsolate>
                {t("emailModule.workspace.linkedTicket", {
                  number: ticketQuery.data.ticketNumber,
                })}
              </LtrIsolate>
            </p>
            <p className="text-xs">
              {t("emailModule.workspace.ticketStatus")}:{" "}
              {localizeEmailTicketStatus(String(ticketQuery.data.status ?? ""), t)}
            </p>
            <p className="text-xs">
              {t("emailModule.workspace.ticketPriority")}:{" "}
              {localizeEmailTicketPriority(String(ticketQuery.data.priority ?? ""), t)}
            </p>
            {ticketQuery.data.slaDueAt && OPEN_TICKET_STATUSES.has(String(ticketQuery.data.status)) ? (
              <p className="text-xs">
                {t("emailModule.workspace.ticketSla")}:{" "}
                <LtrIsolate>{new Date(ticketQuery.data.slaDueAt).toLocaleString()}</LtrIsolate>
              </p>
            ) : null}
            <Link href="~/dashboard/tickets" className="inline-block text-xs font-medium text-primary underline">
              {t("emailModule.workspace.openTicket360")}
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground">{t("emailModule.workspace.noTicket")}</p>
            {selected?.customer_id && (customerTicketsQuery.data?.length ?? 0) > 0 ? (
              <div className="space-y-1">
                <label className="block text-xs text-muted-foreground">
                  {t("emailModule.workspace.selectTicket")}
                </label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                  data-testid="email-composer-ticket-select"
                  defaultValue=""
                  onChange={(e) => {
                    const ticketId = e.target.value;
                    if (!ticketId || !selected || !companyId || !selected.customer_id) return;
                    const option = customerTicketsQuery.data?.find((row) => row.id === ticketId);
                    if (
                      !option ||
                      !assertTicketLinkScope({
                        companyId,
                        customerId: selected.customer_id,
                        ticket: { companyId, customerId: selected.customer_id },
                      })
                    ) {
                      return;
                    }
                    void (async () => {
                      const result = await linkOpenTicketToConversation({
                        client: supabase,
                        companyId,
                        customerId: selected.customer_id!,
                        conversationId: selected.id,
                        ticketId,
                      });
                      if (!result.ok) return;
                      await queryClient.invalidateQueries({
                        queryKey: ["email-workspace-ticket", companyId, selected.id],
                      });
                      await queryClient.invalidateQueries({
                        queryKey: ["email-workspace-customer-tickets", companyId, selected.customer_id],
                      });
                    })();
                  }}
                >
                  <option value="">{t("emailModule.workspace.selectTicketPlaceholder")}</option>
                  {customerTicketsQuery.data?.map((ticket) => (
                    <option key={ticket.id} value={ticket.id}>
                      {ticket.ticketNumber}
                      {ticket.subject ? ` · ${ticket.subject}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardCard
      className="flex h-full min-h-0 flex-col overflow-hidden p-0"
      data-email-resolver="authoritative-v4"
    >
      <div
        className="flex shrink-0 items-baseline gap-2 border-b border-border px-3 py-1.5"
        data-testid="email-workspace-heading"
      >
        <h2 className="shrink-0 text-sm font-semibold tracking-tight">
          {t("emailModule.workspace.title")}
        </h2>
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {t("emailModule.workspace.subtitle")}
        </p>
      </div>
      {/*
        Scroll ownership (desktop):
        1) inbox list — overflow-y-auto only
        2) conversation messages — overflow-y-auto only
        3) context column — only when a conversation is selected
        Composer form lives inside the messages scroller so From/To/body/signature
        share one conversation scroll. Modes/send stay pinned below.
      */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden",
          selectedId
            ? "xl:grid-cols-[minmax(24rem,30rem)_minmax(0,1fr)_minmax(16rem,18rem)]"
            : "xl:grid-cols-[minmax(26rem,34rem)_minmax(0,1fr)]",
        )}
      >
        {/* Conversation list */}
        <aside className="flex min-h-0 flex-col overflow-hidden border-b border-border xl:border-b-0 xl:border-e">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("emailModule.workspace.searchPlaceholder")}
              aria-label={t("emailModule.workspace.searchPlaceholder")}
              className="h-8 min-w-[10rem] flex-1"
            />
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {t("emailModule.workspace.filterAssignedTo")}
              </span>
              <Select
                value={assigneeFilter}
                onValueChange={(value) => setAssigneeFilter(value as EmailWorkspaceAssigneeFilter)}
              >
                <SelectTrigger
                  className="h-8 w-[11.5rem]"
                  data-testid="email-workspace-assignee-filter"
                  aria-label={t("emailModule.workspace.filterAssignedTo")}
                >
                  <SelectValue placeholder={t("emailModule.workspace.filterAssigneeAll")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMAIL_WORKSPACE_ASSIGNEE_ALL}>
                    {t("emailModule.workspace.filterAssigneeAll")}
                  </SelectItem>
                  <SelectItem value={EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED}>
                    {t("emailModule.workspace.filterAssigneeUnassigned")}
                  </SelectItem>
                  {assigneeFilterEmployees.map((row) => {
                    const userId = row.userId?.trim();
                    if (!userId) return null;
                    return (
                      <SelectItem key={userId} value={userId}>
                        <span className="flex min-w-0 flex-col items-start gap-0.5">
                          <span className="truncate">{row.fullName}</span>
                          {row.email ? (
                            <span className="truncate text-[10px] text-muted-foreground" dir="ltr">
                              {row.email}
                            </span>
                          ) : null}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="rounded border-input"
              />
              {t("emailModule.workspace.filterUnread")}
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 w-8 shrink-0 px-0"
              data-testid="email-notification-sound-toggle"
              aria-pressed={soundEnabled}
              aria-label={
                soundEnabled
                  ? t("emailModule.workspace.notificationSoundAriaOn")
                  : t("emailModule.workspace.notificationSoundAriaOff")
              }
              title={t("emailModule.workspace.notificationSoundHelper")}
              onClick={handleToggleNotificationSound}
            >
              {soundEnabled ? (
                <Bell className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <BellOff className="h-3.5 w-3.5" aria-hidden />
              )}
            </Button>
            <EmailNewEmailButton
              onClick={() => void startNewEmail()}
              busy={composeBusy}
              disabled={!companyId}
              size="sm"
            />
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto"
            data-testid="email-workspace-conversation-list"
            data-metric-filter={metricFilter}
            data-assignee-filter={assigneeFilter}
          >
            {listQuery.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">{t("emailModule.workspace.loading")}</p>
            ) : conversations.length === 0 ? (
              <div className="space-y-3 p-4 text-sm">
                {assigneeFilter === EMAIL_WORKSPACE_ASSIGNEE_UNASSIGNED ? (
                  <p className="font-medium">{t("emailModule.workspace.emptyUnassignedList")}</p>
                ) : assigneeFilter !== EMAIL_WORKSPACE_ASSIGNEE_ALL ? (
                  <p className="font-medium">{t("emailModule.workspace.emptyAssigneeList")}</p>
                ) : (
                  <>
                    <p className="font-medium">{t("emailModule.workspace.emptyListTitle")}</p>
                    <p className="text-muted-foreground">{t("emailModule.workspace.emptyListBody")}</p>
                    <EmailNewEmailButton
                      onClick={() => void startNewEmail()}
                      busy={composeBusy}
                      disabled={!companyId}
                    />
                  </>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {conversations.map((conversation) => {
                  const customer =
                    conversation.customer_id && companyId
                      ? listCustomersById.get(conversation.customer_id) ?? null
                      : null;
                  const item = buildEmailWorkspaceListItemDisplay({
                    conversation,
                    companyId: companyId ?? conversation.company_id,
                    customer,
                    labels: listLabels,
                    templateVariables: listTemplateVariables,
                    isSending:
                      isSending &&
                      selectedId === conversation.id &&
                      sendStatus === "sending",
                  });
                  const active = conversation.id === selectedId;
                  const isUnread = conversation.unread_count_employee > 0;
                  const statusLabel =
                    item.status === "draft"
                      ? t("emailModule.workspace.hasDraft")
                      : item.status === "sending"
                        ? t("emailModule.workspace.sending")
                        : item.status === "sent"
                          ? t("emailModule.workspace.lifecycle.sent")
                          : item.status === "failed"
                            ? t("emailModule.workspace.lifecycle.failed")
                            : null;
                  const timeLabel = formatEmailWorkspaceActivityAt(item.activityAt);
                  const directionLabel =
                    item.lastDirection === "incoming"
                      ? t("emailModule.workspace.incoming")
                      : item.lastDirection === "outgoing"
                        ? t("emailModule.workspace.outgoing")
                        : null;
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        data-email-conversation-id={conversation.id}
                        data-email-unread={isUnread ? "true" : "false"}
                        data-email-direction={item.lastDirection ?? "unknown"}
                        className={cn(
                          "w-full border-s-2 px-3 py-1.5 text-start transition-colors hover:bg-muted/50",
                          active && "bg-muted",
                          isUnread && !active && "border-s-primary bg-primary/5",
                          !isUnread && "border-s-transparent",
                        )}
                        onClick={() => setSelectedId(conversation.id)}
                        title={item.conversationNumber ?? undefined}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <EmailReadableText
                            ltr={item.primaryIsEmail}
                            className={cn(
                              "min-w-0 truncate text-sm",
                              isUnread ? "font-semibold text-foreground" : "font-medium",
                            )}
                          >
                            {item.primaryIsEmail ? (
                              <LtrIsolate>{item.primary}</LtrIsolate>
                            ) : (
                              item.primary
                            )}
                          </EmailReadableText>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {timeLabel ? (
                              <span className="text-[10px] text-muted-foreground" dir="ltr">
                                <LtrIsolate>{timeLabel}</LtrIsolate>
                              </span>
                            ) : null}
                            {isUnread ? (
                              <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                                {conversation.unread_count_employee}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p
                          className={cn(
                            "mt-0.5 truncate text-sm",
                            isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/90",
                          )}
                        >
                          <EmailReadableText>
                            {item.subject || t("emailModule.workspace.noSubject")}
                          </EmailReadableText>
                        </p>
                        <p className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
                          <EmailReadableText>
                            {item.showNoPreview
                              ? t("emailModule.workspace.noPreview")
                              : item.preview || item.subject || t("emailModule.workspace.noPreview")}
                          </EmailReadableText>
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            {directionLabel ? (
                              <span
                                className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                  item.lastDirection === "incoming"
                                    ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                                    : "bg-primary/10 text-primary",
                                )}
                              >
                                {directionLabel}
                              </span>
                            ) : null}
                            {statusLabel ? (
                              <p className="text-[10px] font-medium text-primary">{statusLabel}</p>
                            ) : null}
                          </div>
                          {item.conversationNumber ? (
                            <p className="truncate text-[10px] text-muted-foreground" dir="ltr">
                              <LtrIsolate>{item.conversationNumber}</LtrIsolate>
                            </p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Thread + composer */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-border xl:border-b-0 xl:border-e">
          {!selectedId || !selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
              {composeBusy ? (
                <p data-testid="email-compose-opening">{t("emailModule.workspace.composeStarting")}</p>
              ) : (
                <p>{t("emailModule.workspace.selectConversation")}</p>
              )}
              {composeError ? (
                <p className="text-destructive" data-testid="email-compose-error" data-email-resolver="authoritative-v4">
                  {composeError}
                </p>
              ) : null}
              {composeBusy ? null : (
                <EmailNewEmailButton
                  onClick={() => void startNewEmail()}
                  busy={composeBusy}
                  disabled={!companyId}
                />
              )}
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-border px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold" dir="auto">
                    {selectedListDisplay?.primaryIsEmail ? (
                      <LtrIsolate>{selectedListDisplay.primary}</LtrIsolate>
                    ) : (
                      selectedListDisplay?.primary ?? selected.conversation_number
                    )}
                  </h3>
                  <span className="text-xs text-muted-foreground">{selected.state}</span>
                  {selected.conversation_number ? (
                    <span className="text-[10px] text-muted-foreground" dir="ltr">
                      <LtrIsolate>{selected.conversation_number}</LtrIsolate>
                    </span>
                  ) : null}
                  {selectedId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="ms-auto xl:hidden"
                      onClick={() => setContextOpen(true)}
                    >
                      <PanelRight className="me-1.5 h-3.5 w-3.5" aria-hidden />
                      {t("emailModule.workspace.contextPanel")}
                    </Button>
                  ) : null}
                </div>
                {(selectedListDisplay?.subject || snapshot.subject) ? (
                  <p className="mt-1 text-sm">
                    <EmailReadableText>
                      {selectedListDisplay?.subject ||
                        formatEmailListTemplateDisplay(snapshot.subject ?? "", {
                          ...listTemplateVariables,
                          ...(customerQuery.data?.name
                            ? { "customer.name": customerQuery.data.name }
                            : {}),
                        }) ||
                        snapshot.subject}
                    </EmailReadableText>
                  </p>
                ) : null}
                {companyId ? (
                  <div className="mt-1.5">
                    <EmailConversationAssigneeControl
                      conversation={selected}
                      companyId={companyId}
                      canAssign={canAssignSelectedEmailConversation}
                    />
                  </div>
                ) : null}
                {lifecycle.length > 0 ? (
                  <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {lifecycle.map((event, index) => (
                      <li key={event.id} className="flex items-center gap-1.5">
                        <span className="rounded border border-border bg-background px-1.5 py-0.5">
                          {t(`emailModule.workspace.lifecycle.${event.id}`)}
                          {event.detail && !event.detail.startsWith("reused:")
                            ? ` · ${event.detail}`
                            : event.detail?.startsWith("reused:")
                              ? ` · ${t("emailModule.workspace.lifecycle.reused")}`
                              : ""}
                        </span>
                        {index < lifecycle.length - 1 ? <span aria-hidden>↓</span> : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>

              {/* One conversation scroll: messages + reply form. Actions stay pinned. */}
              <div
                ref={messagesScrollRef}
                className="min-h-[10rem] flex-1 basis-0 space-y-3 overflow-y-auto px-4 py-4"
                data-testid="email-workspace-messages-scroll"
              >
                {messagesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">{t("emailModule.workspace.loading")}</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("emailModule.workspace.emptyThread")}</p>
                ) : (
                  messages.map((message) => {
                    const incoming = message.message_type === "incoming";
                    const outgoing = message.message_type === "outgoing";
                    if (!incoming && !outgoing && message.message_type !== "internal_note") {
                      return null;
                    }
                    return (
                      <div
                        key={message.id}
                        data-email-message-direction={
                          incoming ? "incoming" : outgoing ? "outgoing" : "note"
                        }
                        className={cn(
                          "flex w-full",
                          incoming && "justify-start",
                          outgoing && "justify-end",
                          message.message_type === "internal_note" && "justify-center",
                        )}
                      >
                      <article
                        className={cn(
                          "max-w-[min(42rem,92%)] rounded-2xl border px-4 py-3 text-sm shadow-sm",
                          incoming && "border-border bg-card",
                          outgoing && "border-primary/25 bg-primary/8",
                          message.message_type === "internal_note" &&
                            "w-full max-w-none border-dashed border-muted-foreground/40 bg-background italic text-muted-foreground",
                        )}
                      >
                        {incoming && companyId && canTranslateIncomingMessages ? (
                          <EmailMessageTranslateControl
                            companyId={companyId}
                            messageId={message.id}
                            sourcePreviewText={
                              message.content ||
                              htmlToPlainText(readConversationEmailHtml(message) ?? "")
                            }
                            enabled={canTranslateIncomingMessages}
                          >
                            {(translateState) => (
                              <>
                                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                  <span>{t("emailModule.workspace.incoming")}</span>
                                  <LtrIsolate className="truncate">
                                    {formatMessageSender(message)}
                                  </LtrIsolate>
                                  {formatMessageSubject(message) ? (
                                    <span className="truncate" dir="auto">
                                      · {formatMessageSubject(message)}
                                    </span>
                                  ) : null}
                                  <div className="ms-auto flex shrink-0 items-center gap-1">
                                    <EmailMessageTranslateTrigger state={translateState} />
                                    <LtrIsolate>
                                      {new Date(message.created_at).toLocaleString()}
                                    </LtrIsolate>
                                  </div>
                                </div>
                                {message.external_message_id ? (
                                  <details className="mb-1 text-[10px] text-muted-foreground">
                                    <summary className="cursor-pointer">Message-ID</summary>
                                    <LtrIsolate>{message.external_message_id}</LtrIsolate>
                                  </details>
                                ) : null}
                                {(() => {
                                  const emailHtml = readConversationEmailHtml(message);
                                  if (emailHtml) {
                                    return (
                                      <div
                                        className={EMAIL_HTML_DOCUMENT_CLASSNAME}
                                        dir={emailDisplayPrefersLtr(htmlToPlainText(emailHtml)) ? "ltr" : "auto"}
                                        style={{ unicodeBidi: "isolate" }}
                                        data-testid="email-thread-message-html"
                                        dangerouslySetInnerHTML={{
                                          __html: renderConversationEmailHtml(emailHtml),
                                        }}
                                      />
                                    );
                                  }
                                  return (
                                    <div
                                      className="whitespace-pre-wrap break-words"
                                      dir={emailDisplayPrefersLtr(message.content) ? "ltr" : "auto"}
                                      style={{ unicodeBidi: "isolate" }}
                                      data-testid="email-thread-message-text"
                                    >
                                      {message.content}
                                    </div>
                                  );
                                })()}
                                <EmailMessageTranslateResult state={translateState} />
                              </>
                            )}
                          </EmailMessageTranslateControl>
                        ) : (
                          <>
                            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <span>
                                {incoming
                                  ? t("emailModule.workspace.incoming")
                                  : outgoing
                                    ? t("emailModule.workspace.outgoing")
                                    : t("emailModule.workspace.internalNote")}
                              </span>
                              <LtrIsolate className="truncate">
                                {formatMessageSender(message)}
                              </LtrIsolate>
                              {formatMessageSubject(message) ? (
                                <span className="truncate" dir="auto">
                                  · {formatMessageSubject(message)}
                                </span>
                              ) : null}
                              <LtrIsolate className="ms-auto shrink-0">
                                {new Date(message.created_at).toLocaleString()}
                              </LtrIsolate>
                            </div>
                            {message.external_message_id ? (
                              <details className="mb-1 text-[10px] text-muted-foreground">
                                <summary className="cursor-pointer">Message-ID</summary>
                                <LtrIsolate>{message.external_message_id}</LtrIsolate>
                              </details>
                            ) : null}
                            {(() => {
                              const emailHtml = readConversationEmailHtml(message);
                              if (emailHtml) {
                                return (
                                  <div
                                    className={EMAIL_HTML_DOCUMENT_CLASSNAME}
                                    dir={emailDisplayPrefersLtr(htmlToPlainText(emailHtml)) ? "ltr" : "auto"}
                                    style={{ unicodeBidi: "isolate" }}
                                    data-testid="email-thread-message-html"
                                    dangerouslySetInnerHTML={{
                                      __html: renderConversationEmailHtml(emailHtml),
                                    }}
                                  />
                                );
                              }
                              return (
                                <div
                                  className="whitespace-pre-wrap break-words"
                                  dir={emailDisplayPrefersLtr(message.content) ? "ltr" : "auto"}
                                  style={{ unicodeBidi: "isolate" }}
                                  data-testid="email-thread-message-text"
                                >
                                  {message.content}
                                </div>
                              );
                            })()}
                          </>
                        )}
                        {readConversationMessageAttachments(message).length > 0 ? (
                          <EmailMessageAttachments
                            attachments={readConversationMessageAttachments(message)}
                            conversationId={selected?.id ?? null}
                            labels={{
                              download: t("emailModule.workspace.attachmentDownload"),
                              openPreview: t("emailModule.workspace.attachmentOpenPreview"),
                              closePreview: t("emailModule.workspace.attachmentClosePreview"),
                            }}
                          />
                        ) : null}
                      </article>
                      </div>
                    );
                  })
                )}

              <div
                ref={composerCardRef}
                className="relative mt-1 overflow-visible rounded-xl border border-border bg-card shadow-sm"
                data-testid="email-workspace-composer"
                onDragEnter={(event) => {
                  if (![...event.dataTransfer.types].includes("Files")) return;
                  event.preventDefault();
                  setAttachDragOver(true);
                }}
                onDragOver={(event) => {
                  if (![...event.dataTransfer.types].includes("Files")) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setAttachDragOver(true);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setAttachDragOver(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setAttachDragOver(false);
                  if (event.dataTransfer.files?.length) void handleAttachFiles(event.dataTransfer.files);
                }}
              >
                {attachDragOver ? (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
                    {t("emailModule.workspace.dropAttachments")}
                  </div>
                ) : null}
                {composeError ? (
                  <p
                    className="px-4 pt-3 text-xs text-destructive"
                    data-testid="email-compose-error"
                    data-email-resolver="authoritative-v4"
                  >
                    {composeError}
                  </p>
                ) : null}
                <div data-testid="email-workspace-composer-scroll">
                <div className="divide-y divide-border/60">
                <EmailComposerFieldRow label={t("emailModule.workspace.fields.from")}>
                  {senderOptions.length > 1 ? (
                    <select
                      className="flex h-9 w-full rounded-md border-0 bg-transparent px-0 text-sm shadow-none outline-none focus-visible:ring-0"
                      dir="ltr"
                      value={resolvedSender?.channelId ?? ""}
                      disabled={isSending}
                      data-testid="email-composer-from-select"
                      onChange={(e) =>
                        setComposer((p) => ({ ...p, selectedChannelId: e.target.value || null }))
                      }
                      aria-label={t("emailModule.workspace.fields.from")}
                    >
                      {senderOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type="text"
                      dir="ltr"
                      value={fromIdentity}
                      readOnly
                      disabled
                      aria-readonly="true"
                      data-testid="email-composer-from"
                      placeholder={t("emailModule.workspace.fromNotConfigured")}
                      className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    />
                  )}
                </EmailComposerFieldRow>

                <EmailComposerFieldRow
                  label={t("emailModule.workspace.fields.to")}
                  trailing={
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setShowCcBcc((v) => !v)}
                      >
                        {showCcBcc
                          ? t("emailModule.workspace.hideCcBcc")
                          : t("emailModule.workspace.showCcBcc")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setLinkCustomerOpen(true)}
                      >
                        {t("emailModule.workspace.linkCustomer")}
                      </Button>
                    </div>
                  }
                >
                  <EmailRecipientChipsField
                    label={t("emailModule.workspace.fields.to")}
                    hideLabel
                    wrapWithoutScroll
                    value={composer.to}
                    disabled={isSending}
                    testId="email-composer-to"
                    participantCandidates={recipientParticipantCandidates}
                    onChange={(to) => setComposer((p) => ({ ...p, to }))}
                    onCustomerSuggestionSelected={(suggestion) => {
                      if (!selected || !companyId || !suggestion.customerId) return;
                      if (selected.customer_id) return;
                      void linkCustomerViaBackend(services, context, {
                        conversationId: selected.id,
                        customerId: suggestion.customerId,
                        companyId,
                        metadata: selected.metadata ?? {},
                      }).then(async () => {
                        await queryClient.invalidateQueries({
                          queryKey: ["email-workspace-conversation", selected.id],
                        });
                        await queryClient.invalidateQueries({
                          queryKey: ["conversation-list", companyId],
                        });
                      }).catch(() => {
                        // Linking is best-effort; chip already committed.
                      });
                    }}
                  />
                </EmailComposerFieldRow>
                  {showCcBcc ? (
                    <>
                      <EmailComposerFieldRow label={t("emailModule.workspace.fields.cc")}>
                        <EmailRecipientChipsField
                          label={t("emailModule.workspace.fields.cc")}
                          hideLabel
                          wrapWithoutScroll
                          value={composer.cc}
                          disabled={isSending}
                          testId="email-composer-cc"
                          participantCandidates={recipientParticipantCandidates}
                          onChange={(cc) => setComposer((p) => ({ ...p, cc }))}
                        />
                      </EmailComposerFieldRow>
                      <EmailComposerFieldRow label={t("emailModule.workspace.fields.bcc")}>
                        <EmailRecipientChipsField
                          label={t("emailModule.workspace.fields.bcc")}
                          hideLabel
                          wrapWithoutScroll
                          value={composer.bcc}
                          disabled={isSending}
                          testId="email-composer-bcc"
                          participantCandidates={recipientParticipantCandidates}
                          onChange={(bcc) => setComposer((p) => ({ ...p, bcc }))}
                        />
                      </EmailComposerFieldRow>
                    </>
                  ) : null}

                <EmailComposerFieldRow label={t("emailModule.workspace.fields.subject")}>
                  <Input
                    value={composer.subject}
                    onChange={(e) => {
                      const subject = resolveCompanyTemplateVariablesInText(
                        e.target.value,
                        trustedCompany,
                      );
                      setComposer((p) => ({
                        ...p,
                        subject,
                        templateUnresolved: findComposerUnresolved(subject, p.body),
                      }));
                    }}
                    dir="auto"
                    data-testid="email-composer-subject"
                    aria-invalid={composer.mode === "compose" && !composer.subject.trim()}
                    className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  />
                  {composer.mode === "compose" && !composer.subject.trim() ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("emailModule.workspace.subjectRequired")}
                    </p>
                  ) : null}
                </EmailComposerFieldRow>
                </div>

                <div className="space-y-3 px-4 py-3">
                  <EmailComposerBodyEditor
                    value={composer.body}
                    disabled={isSending}
                    logoUrl={companyEmailLogoUrl}
                    signatureHtml={companySignatureHtml}
                    onChange={(html) => {
                      const body = resolveCompanyTemplateVariablesInText(html, trustedCompany);
                      setComposer((p) => ({
                        ...p,
                        body,
                        templateUnresolved: findComposerUnresolved(p.subject, body),
                      }));
                    }}
                  />
                  {composer.templateUnresolved.length > 0 ? (
                    <p
                      className="mt-1 text-xs text-destructive"
                      data-testid="email-composer-unresolved-tokens"
                    >
                      {t("emailModule.workspace.unresolvedTemplate", {
                        tokens: composer.templateUnresolved
                          .map((token) => `{{${token}}}`)
                          .join(", "),
                      })}
                    </p>
                  ) : null}

                  {composerAttachments.length > 0 ? (
                    <ul className="flex flex-wrap gap-1">
                      {composerAttachments.map((attachment) => (
                        <li
                          key={attachment.id}
                          data-testid="email-composer-attachment-chip"
                          data-attachment-status={attachment.status}
                          className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs"
                        >
                          <span className="inline-flex max-w-full items-center gap-1">
                            <span className="max-w-[12rem] truncate" dir="ltr">
                              📎 {attachment.name}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {formatEmailAttachmentSize(attachment.fileSize)}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {attachment.status === "uploading"
                                ? t("emailModule.workspace.attachmentUploading")
                                : attachment.status === "failed"
                                  ? t("emailModule.workspace.attachmentFailed")
                                  : t("emailModule.workspace.attachmentUploaded")}
                            </span>
                            <button
                              type="button"
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label={t("emailModule.workspace.removeAttachment")}
                              data-testid="email-composer-attachment-remove"
                              disabled={isSending}
                              onClick={() => void handleRemoveAttachment(attachment.id)}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                          {attachment.status === "uploading" ? (
                            <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
                              <span
                                className="block h-full bg-primary transition-[width]"
                                style={{ width: `${Math.min(100, attachment.progress ?? 12)}%` }}
                              />
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {attachmentError ? (
                    <p className="text-xs text-destructive">{attachmentError}</p>
                  ) : null}

                {suggestions.length > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("emailModule.workspace.ai.suggestionsHeading")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(aiBusy)}
                        onClick={() => void loadSuggestions()}
                      >
                        {t("emailModule.workspace.ai.refreshSuggestions")}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {suggestions.map((text, index) => (
                        <Button
                          key={`${index}-${text.slice(0, 24)}`}
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="max-w-full h-auto whitespace-normal py-1.5 text-start"
                          onClick={() => {
                            const body = resolveCompanyTemplateVariablesInText(
                              applyAiHtmlBody(text),
                              trustedCompany,
                            );
                            setComposer((p) => ({
                              ...p,
                              body,
                              templateUnresolved: findComposerUnresolved(p.subject, body),
                            }));
                          }}
                        >
                          {text}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {showSummary && threadSummary ? (
                  <div className="rounded-md border border-border bg-muted/30 p-2 text-xs whitespace-pre-wrap">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-medium">{t("emailModule.workspace.ai.summaryTitle")}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowSummary(false)}
                      >
                        {t("emailModule.workspace.close")}
                      </Button>
                    </div>
                    {threadSummary}
                  </div>
                ) : null}

                {aiError ? <p className="text-xs text-destructive">{aiError}</p> : null}
                </div>
                </div>
              </div>
              </div>

              <div
                className="shrink-0 border-t border-border bg-card px-3 py-1.5"
                onDragEnter={(event) => {
                  if (![...event.dataTransfer.types].includes("Files")) return;
                  event.preventDefault();
                  setAttachDragOver(true);
                }}
                onDragOver={(event) => {
                  if (![...event.dataTransfer.types].includes("Files")) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setAttachDragOver(true);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setAttachDragOver(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setAttachDragOver(false);
                  if (event.dataTransfer.files?.length) void handleAttachFiles(event.dataTransfer.files);
                }}
              >
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    {composerModes.map((mode) => (
                      <Button
                        key={mode}
                        type="button"
                        size="sm"
                        className="shrink-0"
                        variant={composer.mode === mode ? "default" : "outline"}
                        onClick={() => handleModeChange(mode)}
                      >
                        {t(`emailModule.workspace.modes.${mode === "reply_all" ? "replyAll" : mode}`)}
                      </Button>
                    ))}
                    <span className="mx-0.5 h-4 w-px shrink-0 bg-border" aria-hidden />
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={EMAIL_COMPOSER_ATTACHMENT_ACCEPT}
                      className="sr-only"
                      data-testid="email-composer-attach-input"
                      onChange={(event) => {
                        if (event.target.files?.length) void handleAttachFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      data-testid="email-composer-attach"
                      disabled={
                        isSending ||
                        !companyId ||
                        !selected ||
                        !emailChannelEntitled ||
                        composerAttachments.filter((item) => item.status !== "failed").length >=
                          EMAIL_COMPOSER_MAX_ATTACHMENTS
                      }
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="me-1.5 size-3.5" aria-hidden />
                      {t("emailModule.workspace.attach")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="shrink-0 bg-primary text-primary-foreground"
                      disabled={!companyId || !assistantEntitled || Boolean(aiBusy)}
                      data-testid="email-ai-write-open"
                      title={
                        assistantEntitled
                          ? t("emailModule.workspace.ai.neverSendHint")
                          : t("emailModule.aiCapabilities.locked")
                      }
                      onClick={() => openAiWrite(bodyPlainForUi.trim() ? "rewrite" : "generate")}
                    >
                      <Sparkles className="me-1.5 size-3.5" aria-hidden />
                      {t("emailModule.workspace.ai.writeWithAi")}
                    </Button>
                    <EmailAiCopilotMenu
                      busy={aiBusy}
                      disabled={!companyId || !assistantEntitled}
                      onAction={(action) => void runAiAction(action)}
                      onSuggestions={() => {
                        if (!suggestedEntitled) return;
                        void loadSuggestions();
                      }}
                      onSummarize={() => void loadSummary()}
                    />
                    <div className="relative shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!companyId || enabledTemplates.length === 0}
                        onClick={() => setTemplatePickerOpen((v) => !v)}
                      >
                        {t("emailModule.workspace.insertTemplate")}
                      </Button>
                      {templatePickerOpen ? (
                        <div className="absolute inset-s-0 bottom-full z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-background p-1 shadow-md">
                          {enabledTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              className="block w-full rounded px-2 py-1.5 text-start text-sm hover:bg-muted"
                              onClick={() => insertTemplate(template.id)}
                            >
                              {template.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {bodyPlainForUi.trim() ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        disabled={Boolean(aiBusy) || !companyId || !assistantEntitled}
                        onClick={() => openAiWrite("rewrite")}
                      >
                        {t("emailModule.workspace.ai.improveWithAi")}
                      </Button>
                    ) : null}
                    <span className="ms-auto" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={!selected || isSending || discardBusy}
                      data-testid="email-composer-discard"
                      onClick={() => void handleDiscardDraft()}
                    >
                      {discardBusy
                        ? t("emailModule.workspace.discarding")
                        : t("emailModule.workspace.discard")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={!selected || isSending}
                      onClick={handleSaveDraft}
                    >
                      {t("emailModule.workspace.saveDraft")}
                    </Button>
                    {draftSaveState === "saving" ? (
                      <span className="shrink-0 text-xs text-muted-foreground" data-testid="email-draft-saving">
                        {t("emailModule.workspace.draftSaving")}
                      </span>
                    ) : null}
                    {draftSaveState === "saved" ? (
                      <span className="shrink-0 text-xs text-muted-foreground" data-testid="email-draft-saved">
                        {t("emailModule.workspace.draftSavedAgo", { seconds: draftSavedAgeSec })}
                      </span>
                    ) : null}
                    {sendValidationError ? (
                      <span className="shrink-0 text-xs text-destructive">{sendValidationError}</span>
                    ) : null}
                    {sendStatus === "success" ? (
                      <span className="shrink-0 text-xs text-primary">{t("emailModule.workspace.sendSuccess")}</span>
                    ) : null}
                    {sendStatus === "error" || sendError ? (
                      <span className="shrink-0 text-xs text-destructive">
                        {sendError?.message ?? t("emailModule.workspace.sendError")}
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      className="min-w-[6rem] shrink-0 font-semibold"
                      data-testid="email-composer-send"
                      disabled={
                        isSending ||
                        discardBusy ||
                        composerAttachments.some((item) => item.status === "uploading") ||
                        composer.templateUnresolved.length > 0 ||
                        (composer.mode === "compose" &&
                          (!composer.to.length || !composer.subject.trim())) ||
                        (composer.mode !== "compose" &&
                          !bodyPlainForUi.trim() &&
                          toDraftAttachments(composerAttachments).length === 0)
                      }
                      onClick={() => void handleSend()}
                    >
                      {isSending || sendStatus === "sending"
                        ? t("emailModule.workspace.sending")
                        : t("emailModule.workspace.send")}
                    </Button>
                  </div>
                  <EmailAiWritePanel
                    open={aiWriteOpen}
                    onOpenChange={(open) => {
                      if (!open) {
                        aiWriteGenerationTokenRef.current += 1;
                      }
                      setAiWriteOpen(open);
                    }}
                    busy={aiBusy === "ai_write"}
                    hasExistingBody={Boolean(bodyPlainForUi.trim())}
                    defaultMode={aiWriteDefaultMode}
                    error={aiError}
                    onGenerate={handleAiWriteGenerate}
                    onInsert={handleAiWriteInsert}
                  />
                </div>
            </>
          )}
        </section>

        {/* Side context — desktop: content-sized, no independent vertical scrollbar */}
        <aside
          className={cn(
            "space-y-4 self-start overflow-y-auto p-4",
            selectedId ? "hidden xl:block" : "hidden",
          )}
          data-testid="email-workspace-context-panel"
        >
          {contextPanel}
        </aside>
      </div>

      <Sheet open={contextOpen} onOpenChange={setContextOpen}>
        <SheetContent side="right" className="w-full max-w-sm overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("emailModule.workspace.contextPanel")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{contextPanel}</div>
        </SheetContent>
      </Sheet>

      <LinkCustomerDialog
        open={linkCustomerOpen}
        onOpenChange={setLinkCustomerOpen}
        onLink={(customerId, customerName) => {
          if (!selected || !companyId) return;
          void (async () => {
            await linkCustomerViaBackend(services, context, {
              conversationId: selected.id,
              customerId,
              companyId,
              metadata: {
                ...selected.metadata,
                linkedCustomerName: customerName,
              },
            });
            await queryClient.invalidateQueries({
              queryKey: ["email-workspace-conversation", selected.id],
            });
            await queryClient.invalidateQueries({
              queryKey: ["email-workspace-customer", companyId, customerId],
            });
            await queryClient.invalidateQueries({ queryKey: ["conversation-list", companyId] });
          })();
        }}
      />
    </DashboardCard>
  );
}
