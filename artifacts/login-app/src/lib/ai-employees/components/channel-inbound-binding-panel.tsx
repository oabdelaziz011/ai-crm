import { useEffect, useMemo, useState } from "react";
import { Link2, AlertTriangle, CheckCircle2, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardCard } from "@/components/dashboard/ui";
import { useCompanyChannelsAdmin } from "@/hooks/channels/use-company-channels-admin";
import { useActiveAutomationFlows } from "@/hooks/channels/use-channel-workflow-binding";
import { useAuth } from "@/context/auth-context";
import type { AiEmployeeConfigurationUpdate } from "@/lib/ai-employees/types";
import type { AiEmployeeRecord } from "@/lib/ai-employees/types";
import { formatEmployeeTagLabel } from "@/lib/ai-employees/utilities/format-employee-tag-label";
import { cn } from "@/lib/utils";

const NO_FLOW_VALUE = "__none__";

type ChannelInboundBindingPanelProps = {
  employee: AiEmployeeRecord;
  canEdit?: boolean;
  isSaving?: boolean;
  onSave?: (patch: AiEmployeeConfigurationUpdate) => void;
};

function scoreForChannel(tags: string[], channelKey: string, companyChannelId: string): number {
  let score = 0;
  if (tags.includes(`channel:${companyChannelId}`)) score += 100;
  if (tags.includes(`channel:${channelKey}`)) score += 50;
  if (tags.includes("capability:omnichannel")) score += 10;
  return score;
}

/** Shows whether this employee will auto-reply on WhatsApp / Messenger / Instagram. */
export function ChannelInboundBindingPanel({
  employee,
  canEdit = false,
  isSaving = false,
  onSave,
}: ChannelInboundBindingPanelProps) {
  const { t } = useTranslation("common");
  const [, setLocation] = useLocation();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: companyChannels = [], isLoading } = useCompanyChannelsAdmin();
  const flowsQuery = useActiveAutomationFlows(companyId);
  const [selectedFlowId, setSelectedFlowId] = useState(
    employee.runtimeConfiguration.transferableFlowId ?? "",
  );

  useEffect(() => {
    setSelectedFlowId(employee.runtimeConfiguration.transferableFlowId ?? "");
  }, [employee.id, employee.runtimeConfiguration.transferableFlowId]);

  const messagingChannels = useMemo(
    () =>
      companyChannels.filter((channel) => {
        const key = channel.communication_channel?.key;
        return (
          (key === "whatsapp" || key === "messenger" || key === "instagram") && channel.is_enabled
        );
      }),
    [companyChannels],
  );

  const bindings = useMemo(
    () =>
      messagingChannels.map((channel) => {
        const key = channel.communication_channel?.key ?? "channel";
        const score = scoreForChannel(employee.tags ?? [], key, channel.id);
        return { channel, key, score, matched: score > 0 };
      }),
    [employee.tags, messagingChannels],
  );

  const matchedCount = bindings.filter((item) => item.matched).length;
  const isPublished = employee.status === "published";
  const hasRuntimeBinding = Boolean(employee.provider && employee.model && employee.systemPromptSummary);
  const hasTransferTool = employee.allowedToolKeys.includes("transfer_to_workflow");
  const ready = isPublished && matchedCount > 0 && hasRuntimeBinding;
  const fallbackRisk = isPublished && matchedCount === 0;

  const channelNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const channel of messagingChannels) {
      map.set(channel.id, channel.display_name);
    }
    return map;
  }, [messagingChannels]);

  const labelTag = (tag: string) => {
    if (tag.startsWith("channel:")) {
      const id = tag.slice("channel:".length);
      const name = channelNameById.get(id);
      if (name) return name;
    }
    return formatEmployeeTagLabel(t, tag);
  };

  return (
    <DashboardCard className="overflow-hidden border-border/50 bg-transparent shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2 text-primary">
            <MessageCircle className="size-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{t("aiEmployees.channelBinding.title")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("aiEmployees.channelBinding.subtitle")}
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "rounded-full",
            ready
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
          )}
        >
          {ready
            ? t("aiEmployees.channelBinding.ready")
            : t("aiEmployees.channelBinding.notReady")}
        </Badge>
      </div>

      <div className="space-y-4 px-5 py-4">
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            {isPublished ? (
              <CheckCircle2 className="size-3.5 text-emerald-500" />
            ) : (
              <AlertTriangle className="size-3.5 text-amber-500" />
            )}
            {isPublished
              ? t("aiEmployees.channelBinding.checks.published")
              : t("aiEmployees.channelBinding.checks.notPublished")}
          </li>
          <li className="flex items-center gap-2">
            {matchedCount > 0 ? (
              <CheckCircle2 className="size-3.5 text-emerald-500" />
            ) : (
              <AlertTriangle className="size-3.5 text-amber-500" />
            )}
            {t("aiEmployees.channelBinding.checks.channels", { count: matchedCount })}
          </li>
          <li className="flex items-center gap-2">
            {hasRuntimeBinding ? (
              <CheckCircle2 className="size-3.5 text-emerald-500" />
            ) : (
              <AlertTriangle className="size-3.5 text-amber-500" />
            )}
            {hasRuntimeBinding
              ? t("aiEmployees.channelBinding.checks.runtimeOk")
              : t("aiEmployees.channelBinding.checks.runtimeMissing")}
          </li>
        </ul>

        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3">
          <Label htmlFor="transferable-flow" className="text-sm font-medium">
            {t("aiEmployees.channelBinding.transferableFlow.title")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("aiEmployees.channelBinding.transferableFlow.hint")}
          </p>
          {(flowsQuery.data?.length ?? 0) <= 1 ? (
            <p className="text-xs text-muted-foreground">
              {t("aiEmployees.channelBinding.transferableFlow.oneFlowNote", {
                count: flowsQuery.data?.length ?? 0,
              })}
            </p>
          ) : null}
          <Select
            value={selectedFlowId || NO_FLOW_VALUE}
            onValueChange={(value) => {
              const nextId = value === NO_FLOW_VALUE ? "" : value;
              setSelectedFlowId(nextId);
              if (!canEdit || !onSave) return;
              const nextKeys = new Set(employee.allowedToolKeys);
              if (nextId) {
                nextKeys.add("transfer_to_workflow");
                // Keep real booking actions available alongside workflow transfer.
                nextKeys.add("search_availability");
                nextKeys.add("create_booking");
                nextKeys.add("find_next_available");
              }
              onSave({
                runtimeConfiguration: {
                  transferableFlowId: nextId || null,
                },
                allowedToolKeys: [...nextKeys],
              });
            }}
            disabled={!canEdit || isSaving || flowsQuery.isLoading}
          >
            <SelectTrigger id="transferable-flow" data-testid="transferable-flow-select">
              <SelectValue
                placeholder={t("aiEmployees.channelBinding.transferableFlow.placeholder")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FLOW_VALUE}>
                {t("aiEmployees.channelBinding.transferableFlow.none")}
              </SelectItem>
              {(flowsQuery.data ?? []).map((flow) => (
                <SelectItem key={flow.id} value={flow.id}>
                  {flow.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!hasTransferTool && selectedFlowId ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {t("aiEmployees.channelBinding.transferableFlow.toolMissing")}
            </p>
          ) : null}
          {selectedFlowId && hasTransferTool ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              {t("aiEmployees.channelBinding.transferableFlow.savedHint")}
            </p>
          ) : null}
        </div>

        {fallbackRisk ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            {t("aiEmployees.channelBinding.fallbackWarning")}
          </p>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("aiEmployees.channelBinding.loading")}</p>
        ) : bindings.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("aiEmployees.channelBinding.noChannels")}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={() => setLocation("~/dashboard/channels")}
            >
              <Link2 className="me-1.5 size-3.5" />
              {t("aiEmployees.channelBinding.openChannels")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {bindings.map(({ channel, key, matched, score }) => (
              <div
                key={channel.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm",
                  matched ? "border-emerald-500/25 bg-emerald-500/5" : "border-border/60 bg-muted/20",
                )}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{channel.display_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t(`aiEmployees.form.channelRouting.channels.${key}`, { defaultValue: key })}
                    {matched ? ` · ${t("aiEmployees.channelBinding.score", { score })}` : null}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 rounded-lg text-[10px]">
                  {matched
                    ? t("aiEmployees.channelBinding.matched")
                    : t("aiEmployees.channelBinding.unmatched")}
                </Badge>
              </div>
            ))}
          </div>
        )}

        {(employee.tags ?? []).length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t("aiEmployees.channelBinding.capabilities")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(employee.tags ?? []).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="rounded-lg text-[10px]"
                  title={tag}
                >
                  {labelTag(tag)}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </DashboardCard>
  );
}
