import { useMemo } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { DashboardCard } from "@/components/dashboard/ui";
import { useAuth } from "@/context/auth-context";
import { useConversationList } from "@/hooks/conversations/use-conversation-list";
import {
  buildEmailWorkspaceListItemDisplay,
  isEmailWorkspacePendingConversation,
  resolveEmailWorkspaceListSortAt,
  type EmailWorkspaceListCustomer,
} from "@/lib/email-workspace/email-workspace-list-item";
import { readEmailComposerDraft } from "@/lib/email-workspace/email-thread-outbound";
import { supabase } from "@/lib/supabase";

/**
 * Workspace Pending (drafts) live on conversation.metadata.emailComposerDraft —
 * no dedicated drafts table. Same classifier as Inbox exclusion.
 */
export function EmailDraftsPage() {
  const { t } = useTranslation("common");
  const { profile, company } = useAuth();
  const companyId = profile?.company_id ?? null;
  const trustedCompanyName = useMemo(() => {
    if (!companyId || !company || company.id !== companyId) return null;
    const name = typeof company.name === "string" ? company.name.trim() : "";
    return name || null;
  }, [company, companyId]);
  const listTemplateVariables = useMemo(
    () => (trustedCompanyName ? { "company.name": trustedCompanyName } : {}),
    [trustedCompanyName],
  );
  const listQuery = useConversationList({ channelType: "email" }, 100);
  const listLabels = useMemo(
    () => ({
      newEmail: t("emailModule.workspace.newEmail"),
      noSubject: t("emailModule.workspace.noSubject"),
    }),
    [t],
  );

  const drafts = useMemo(() => {
    const rows = listQuery.data ?? [];
    return rows
      .filter(isEmailWorkspacePendingConversation)
      .map((conversation) => {
        const draft = readEmailComposerDraft(conversation.metadata);
        if (!draft) return null;
        return { conversation, draft };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        const aAt = resolveEmailWorkspaceListSortAt(a.conversation) ?? "";
        const bAt = resolveEmailWorkspaceListSortAt(b.conversation) ?? "";
        return bAt.localeCompare(aAt);
      });
  }, [listQuery.data]);

  const customerIds = useMemo(
    () =>
      [
        ...new Set(
          drafts
            .map(({ conversation }) => conversation.customer_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ].sort(),
    [drafts],
  );

  const customersQuery = useQuery({
    queryKey: ["email-drafts-list-customers", companyId, customerIds.join(",")],
    enabled: Boolean(companyId && customerIds.length > 0),
    staleTime: 30_000,
    queryFn: async (): Promise<EmailWorkspaceListCustomer[]> => {
      if (!companyId || customerIds.length === 0) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, company_id")
        .eq("company_id", companyId)
        .in("id", customerIds);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: String(row.id),
        companyId: String(row.company_id),
        name: typeof row.name === "string" ? row.name : null,
        email: typeof row.email === "string" ? row.email : null,
      }));
    },
  });

  const customersById = useMemo(() => {
    const map = new Map<string, EmailWorkspaceListCustomer>();
    for (const row of customersQuery.data ?? []) {
      if (row.companyId === companyId) map.set(row.id, row);
    }
    return map;
  }, [companyId, customersQuery.data]);

  return (
    <DashboardCard className="p-6">
      <h2 className="text-lg font-semibold">{t("emailModule.drafts.title")}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t("emailModule.drafts.empty")}</p>

      {listQuery.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("emailModule.workspace.loading")}</p>
      ) : drafts.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("emailModule.drafts.noneFound")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
          {drafts.map(({ conversation, draft }) => {
            const item = buildEmailWorkspaceListItemDisplay({
              conversation,
              companyId: companyId ?? conversation.company_id,
              customer: conversation.customer_id
                ? customersById.get(conversation.customer_id) ?? null
                : null,
              labels: listLabels,
              templateVariables: listTemplateVariables,
            });
            return (
              <li key={conversation.id} className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium"
                      dir={item.primaryIsEmail ? "ltr" : "auto"}
                    >
                      {item.primary}
                    </p>
                    <p className="mt-0.5 truncate text-sm" dir="auto">
                      {item.subject || t("emailModule.workspace.noSubject")}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" dir="auto">
                      {item.showNoPreview
                        ? t("emailModule.workspace.noPreview")
                        : item.preview || t("emailModule.workspace.noPreview")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      {draft.updatedAt ? (
                        <span dir="ltr">{new Date(draft.updatedAt).toLocaleString()}</span>
                      ) : null}
                      {item.conversationNumber ? (
                        <span dir="ltr">{item.conversationNumber}</span>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    href={`~/dashboard/email?conversation=${encodeURIComponent(conversation.id)}`}
                    className="shrink-0 text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t("emailModule.drafts.openInWorkspace")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
