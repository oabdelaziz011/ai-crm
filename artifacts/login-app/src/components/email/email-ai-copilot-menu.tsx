import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { EmailAiAssistAction } from "@/lib/email-workspace/email-ai-assist";

const COPILOT_ACTIONS: Array<{
  action: EmailAiAssistAction | "suggestions" | "summarize" | "draft_from_context";
  labelKey: string;
}> = [
  { action: "generate_reply", labelKey: "emailModule.workspace.ai.generate_reply" },
  { action: "suggestions", labelKey: "emailModule.workspace.ai.suggestions" },
  { action: "improve", labelKey: "emailModule.workspace.ai.improve" },
  { action: "formal", labelKey: "emailModule.workspace.ai.formal" },
  { action: "friendly", labelKey: "emailModule.workspace.ai.friendly" },
  { action: "shorten", labelKey: "emailModule.workspace.ai.shorten" },
  { action: "expand", labelKey: "emailModule.workspace.ai.expand" },
  { action: "translate", labelKey: "emailModule.workspace.ai.translate" },
  { action: "summarize", labelKey: "emailModule.workspace.ai.summarize" },
  { action: "draft_from_context", labelKey: "emailModule.workspace.ai.draft_from_context" },
];

type Props = {
  busy: string | null;
  disabled?: boolean;
  onAction: (action: EmailAiAssistAction) => void;
  onSuggestions: () => void;
  onSummarize: () => void;
};

/**
 * Professional AI Copilot menu. Inserts into draft only — never sends.
 */
export function EmailAiCopilotMenu({
  busy,
  disabled,
  onAction,
  onSuggestions,
  onSummarize,
}: Props) {
  const { t } = useTranslation("common");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || Boolean(busy)}
          className="border-primary/30 text-primary hover:bg-primary/5"
        >
          <Sparkles className="me-1.5 h-3.5 w-3.5" aria-hidden />
          {busy ? t("emailModule.workspace.aiWorking") : t("emailModule.workspace.ai.copilot")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="mb-2 px-2 text-xs text-muted-foreground">
          {t("emailModule.workspace.ai.assistantExplain")}
        </p>
        <div className="grid gap-1">
          {COPILOT_ACTIONS.map((item) => (
            <Button
              key={item.action}
              type="button"
              size="sm"
              variant="ghost"
              className="justify-start"
              disabled={disabled || Boolean(busy)}
              onClick={() => {
                if (item.action === "suggestions") onSuggestions();
                else if (item.action === "summarize") onSummarize();
                else if (item.action === "draft_from_context") onAction("generate_reply");
                else onAction(item.action);
              }}
            >
              {t(item.labelKey)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
