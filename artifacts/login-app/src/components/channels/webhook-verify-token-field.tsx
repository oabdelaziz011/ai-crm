import { useState } from "react";
import { Copy, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { isCopyableWebhookVerifyToken } from "@/lib/channels/webhook-verify-token-field";

type Props = {
  id: string;
  label: string;
  value: string;
  hasStoredToken: boolean;
  onChange: (value: string) => void;
  onGenerate: () => void;
  hint?: string;
};

/**
 * Masked-by-default webhook verify token control with Copy + Show/Hide.
 * Copy only writes clipboard when the field holds plaintext (never a mask placeholder).
 * Does not log the token.
 */
export function WebhookVerifyTokenField({
  id,
  label,
  value,
  hasStoredToken,
  onChange,
  onGenerate,
  hint,
}: Props) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const [revealed, setRevealed] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  const canCopy = isCopyableWebhookVerifyToken(value);

  const onCopy = async () => {
    if (!canCopy) {
      toast({
        title: t("notifications.webhookVerifyToken.copyUnavailable", {
          defaultValue: "Nothing to copy",
        }),
        description: t("notifications.webhookVerifyToken.copyUnavailableHint", {
          defaultValue:
            "Generate a new verify token first, copy it for Meta, then Save. Stored tokens stay masked and are not re-exposed.",
        }),
        variant: "destructive",
      });
      return;
    }
    const plaintext = value.trim();
    setCopyBusy(true);
    try {
      await navigator.clipboard.writeText(plaintext);
      toast({
        title: t("notifications.webhookVerifyToken.copied", {
          defaultValue: "Verify token copied",
        }),
        description: t("notifications.webhookVerifyToken.copiedHint", {
          defaultValue: "Paste this exact value into Meta Developers, then Save in ValueOR before verifying the webhook.",
        }),
      });
    } catch {
      toast({
        title: t("notifications.webhookVerifyToken.copyFailed", {
          defaultValue: "Could not copy to clipboard",
        }),
        variant: "destructive",
      });
    } finally {
      setCopyBusy(false);
    }
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onGenerate}>
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            {t("notifications.webhookVerifyToken.generate", { defaultValue: "Generate" })}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canCopy || copyBusy}
            onClick={() => void onCopy()}
            aria-label={t("notifications.webhookVerifyToken.copyAria", {
              defaultValue: "Copy verify token to clipboard",
            })}
          >
            {copyBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Copy className="mr-1.5 h-3.5 w-3.5" />
            )}
            {t("notifications.webhookVerifyToken.copy", { defaultValue: "Copy" })}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canCopy}
            onClick={() => setRevealed((prev) => !prev)}
            aria-pressed={revealed}
            aria-label={
              revealed
                ? t("notifications.webhookVerifyToken.hideAria", { defaultValue: "Hide verify token" })
                : t("notifications.webhookVerifyToken.showAria", { defaultValue: "Show verify token" })
            }
          >
            {revealed ? (
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Eye className="mr-1.5 h-3.5 w-3.5" />
            )}
            {revealed
              ? t("notifications.webhookVerifyToken.hide", { defaultValue: "Hide" })
              : t("notifications.webhookVerifyToken.show", { defaultValue: "Show" })}
          </Button>
        </div>
      </div>
      <Input
        id={id}
        type={revealed && canCopy ? "text" : "password"}
        value={value}
        autoComplete="new-password"
        spellCheck={false}
        placeholder={
          hasStoredToken
            ? t("notifications.webhookVerifyToken.storedPlaceholder", {
                defaultValue: "Token saved — generate to replace & copy for Meta",
              })
            : ""
        }
        onChange={(event) => {
          setRevealed(false);
          onChange(event.target.value);
        }}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <p className="text-xs text-muted-foreground">
        {t("notifications.webhookVerifyToken.copyWorkflow", {
          defaultValue:
            "Generate → Copy (clipboard) → paste into Meta Verify Token → Save here. Leave blank when saving to keep the existing token.",
        })}
      </p>
    </div>
  );
}
