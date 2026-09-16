import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  ConversationNotFoundError,
  PermissionDeniedError,
  type ConversationRecord,
} from "@workspace/ai-conversation";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useConversationServices } from "@/lib/ai-conversation";
import { useAssignableEmployees } from "@/hooks/assignment-governance/use-assignable-employees";
import { useEmployeeIdentity } from "@/hooks/employee-identity/use-employee-identity";
import { useToast } from "@/hooks/use-toast";
import { buildAssignableEmailSelectOptions } from "@/lib/assignment-governance/assignable-select-options";
import {
  emailConversationAssigneeLabel,
  isEmailConversationAssignable,
  persistEmailConversationAssignee,
  patchConversationAssigneeCacheData,
  selectValueForEmailConversationAssignee,
  assignedUserIdFromEmailConversationSelectValue,
} from "@/lib/email-workspace/email-conversation-assignment";
import { cn } from "@/lib/utils";

type EmailConversationAssigneeControlProps = {
  conversation: Pick<ConversationRecord, "id" | "assigned_user_id" | "state" | "deleted_at">;
  companyId: string;
  canAssign: boolean;
  className?: string;
};

export function EmailConversationAssigneeControl({
  conversation,
  companyId,
  canAssign,
  className,
}: EmailConversationAssigneeControlProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { services, context } = useConversationServices();
  const [saving, setSaving] = useState(false);
  const [pendingAssignedUserId, setPendingAssignedUserId] = useState<string | null | undefined>(
    undefined,
  );

  const displayedAssignedUserId =
    pendingAssignedUserId === undefined ? conversation.assigned_user_id : pendingAssignedUserId;

  const assignableQuery = useAssignableEmployees({
    enabled: Boolean(companyId && canAssign),
    resource: "email_conversation",
  });

  const currentIdentityQuery = useEmployeeIdentity(displayedAssignedUserId);
  const employees = assignableQuery.data ?? [];
  const matched = employees.find((row) => row.userId === displayedAssignedUserId?.trim());
  const assigneeName =
    matched?.fullName ?? currentIdentityQuery.data?.fullName ?? null;
  const unassignedLabel = t("emailModule.workspace.assigneeUnassigned");
  const displayLabel = emailConversationAssigneeLabel(
    displayedAssignedUserId,
    assigneeName,
    unassignedLabel,
  );

  const options = useMemo(
    () =>
      buildAssignableEmailSelectOptions({
        employees,
        assignedUserId: displayedAssignedUserId,
        assignedLabel: assigneeName,
        unassignedLabel,
      }),
    [assigneeName, displayedAssignedUserId, employees, unassignedLabel],
  );

  const assignable = isEmailConversationAssignable(conversation);
  const selectorDisabled = saving || assignableQuery.isLoading || !assignable;
  const emptyLabel =
    employees.length === 0
      ? t("emailModule.workspace.assigneeNoEligible")
      : t("emailModule.workspace.assigneeEmpty");

  const applyCaches = (assignedUserId: string | null) => {
    queryClient.setQueriesData({ queryKey: ["conversation-list", companyId] }, (data) =>
      patchConversationAssigneeCacheData(data, conversation.id, assignedUserId),
    );
    queryClient.setQueryData(["email-workspace-conversation", conversation.id], (data) =>
      patchConversationAssigneeCacheData(data, conversation.id, assignedUserId),
    );
  };

  const handleSelect = async (value: string) => {
    if (!canAssign) return;
    const nextAssignedUserId = assignedUserIdFromEmailConversationSelectValue(value);
    const previous = conversation.assigned_user_id;
    if (nextAssignedUserId === (previous ?? null)) return;
    if (!assignable) {
      toast({
        title: t("emailModule.workspace.assigneeUnavailable"),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    setPendingAssignedUserId(nextAssignedUserId);
    applyCaches(nextAssignedUserId);
    try {
      const saved = await persistEmailConversationAssignee({
        services: services.conversations,
        context,
        conversation,
        assignedUserId: nextAssignedUserId,
      });
      applyCaches(saved.assigned_user_id);
      setPendingAssignedUserId(saved.assigned_user_id);
      toast({ title: t("emailModule.workspace.assigneeSaved") });
    } catch (error) {
      applyCaches(previous);
      setPendingAssignedUserId(previous);
      const unauthorized = error instanceof PermissionDeniedError;
      const missing = error instanceof ConversationNotFoundError ||
        (error instanceof Error && error.message === "CONVERSATION_UNAVAILABLE");
      toast({
        title: missing
          ? t("emailModule.workspace.assigneeUnavailable")
          : unauthorized
            ? t("emailModule.workspace.assigneeUnauthorized")
            : t("emailModule.workspace.assigneeSaveFailed"),
        description: error instanceof Error && !unauthorized && !missing ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setPendingAssignedUserId(undefined);
    }
  };

  return (
    <div
      className={cn("flex min-w-0 max-w-full items-center gap-2", className)}
      data-testid="email-workspace-assignee"
      data-email-assignee-interactive={canAssign ? "true" : "false"}
    >
      <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
        {t("emailModule.workspace.assigneeLabel")}
      </span>
      {canAssign ? (
        <div className="min-w-0" data-testid="email-workspace-assignee-selector">
          <SearchableSelect
            value={selectValueForEmailConversationAssignee(displayedAssignedUserId)}
            onValueChange={(value) => void handleSelect(value)}
            options={options}
            placeholder={
              assignableQuery.isLoading
                ? t("emailModule.workspace.loading")
                : displayLabel
            }
            searchPlaceholder={t("emailModule.workspace.assigneeSearch")}
            emptyLabel={emptyLabel}
            disabled={selectorDisabled}
            className="h-8 min-w-[11rem] max-w-[16rem] rounded-lg px-2.5 text-xs"
          />
        </div>
      ) : (
        <span
          className="truncate text-xs"
          data-testid="email-workspace-assignee-value"
        >
          {currentIdentityQuery.isLoading && displayedAssignedUserId
            ? t("emailModule.workspace.loading")
            : displayLabel}
        </span>
      )}
      {saving ? (
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
          aria-label={t("emailModule.workspace.assigneeSaving")}
        />
      ) : null}
    </div>
  );
}
