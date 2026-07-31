import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import type { AgentConfirmationRequest } from "@workspace/agent-runtime";

type AgentConfirmationDialogProps = {
  request: AgentConfirmationRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export const AgentConfirmationDialog = memo(function AgentConfirmationDialog({
  request,
  onConfirm,
  onCancel,
}: AgentConfirmationDialogProps) {
  const { t } = useTranslation("common");

  return (
    <AlertDialog open={Boolean(request)} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" aria-hidden="true" />
            {t("floatingAi.agent.midFlightConfirmation.title")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>{t("floatingAi.agent.midFlightConfirmation.description")}</p>
              {request && (
                <>
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-foreground">
                    <p className="font-medium">{request.action}</p>
                    <p className="mt-1 text-xs">{request.summary}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {t("floatingAi.agent.midFlightConfirmation.risk")}: {request.riskLevel}
                    </Badge>
                    {request.irreversible && (
                      <Badge variant="destructive">
                        {t("floatingAi.agent.midFlightConfirmation.irreversible")}
                      </Badge>
                    )}
                  </div>
                  {request.affectedResources.length > 0 && (
                    <ul className="list-inside list-disc text-xs">
                      {request.affectedResources.map((resource) => (
                        <li key={`${resource.type}-${resource.id ?? resource.label}`}>{resource.label}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t("floatingAi.confirmation.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("floatingAi.agent.midFlightConfirmation.confirmAction")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});
