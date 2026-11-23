import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAiEmployees } from "@/lib/ai-employees/hooks/use-ai-employees";
import {
  fetchChannelAiAssignment,
  setChannelAiAssignment,
} from "@/lib/channels/channel-ai-assignment-client";

type Props = {
  companyId: string;
  companyChannelId: string | null;
  channelLabel: string;
};

const NONE_VALUE = "__none__";

export function ChannelAiEmployeeAssignment({
  companyId,
  companyChannelId,
  channelLabel,
}: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { data: employees = [], isLoading: employeesLoading } = useAiEmployees(companyId, {
    status: "published",
  });
  const [assignedId, setAssignedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!companyChannelId) {
      setAssignedId(null);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchChannelAiAssignment(companyId, companyChannelId);
      setAssignedId(result.assignedAiEmployeeId);
    } catch {
      setAssignedId(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, companyChannelId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSave = async (nextId: string | null) => {
    if (!companyChannelId) return;
    setBusy(true);
    try {
      const result = await setChannelAiAssignment({
        companyId,
        companyChannelId,
        assignedAiEmployeeId: nextId,
      });
      setAssignedId(result.assignedAiEmployeeId);
      toast({
        title: t("notifications.channelAiAssignment.saved", {
          defaultValue: "AI Employee assignment saved",
        }),
      });
    } catch (error) {
      toast({
        title: t("notifications.channelAiAssignment.saveFailed", {
          defaultValue: "Could not save AI assignment",
        }),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!companyChannelId) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("notifications.channelAiAssignment.channelRequired", {
          defaultValue: "Create the channel first to assign an AI Employee.",
        })}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <Label>
        {t("notifications.channelAiAssignment.title", {
          channel: channelLabel,
          defaultValue: `AI Employee for ${channelLabel}`,
        })}
      </Label>
      <p className="text-xs text-muted-foreground">
        {t("notifications.channelAiAssignment.hint", {
          defaultValue:
            "Inbound AI replies only when an employee is assigned. Leave empty to soft-skip AI.",
        })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={assignedId ?? NONE_VALUE}
          disabled={busy || loading || employeesLoading}
          onValueChange={(value) => {
            void onSave(value === NONE_VALUE ? null : value);
          }}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue
              placeholder={t("notifications.channelAiAssignment.placeholder", {
                defaultValue: "No AI Employee",
              })}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>
              {t("notifications.channelAiAssignment.none", { defaultValue: "No AI Employee" })}
            </SelectItem>
            {employees.map((employee) => (
              <SelectItem key={employee.id} value={employee.id}>
                {employee.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {assignedId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onSave(null)}
          >
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {t("notifications.channelAiAssignment.clear", { defaultValue: "Clear" })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
