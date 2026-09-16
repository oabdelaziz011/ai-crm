/**
 * AI Write panel — natural-language email drafting.
 * Inserts into composer only; never sends.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmailAiWriteAuthError,
  type EmailAiDraftResponse,
  type EmailAiWriteLanguage,
  type EmailAiWriteMode,
  type EmailAiWriteTone,
} from "@/lib/email-workspace/email-ai-write";

type PreviewState = EmailAiDraftResponse & {
  mode: EmailAiWriteMode;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  hasExistingBody: boolean;
  defaultMode?: EmailAiWriteMode;
  error?: string | null;
  onGenerate: (input: {
    instruction: string;
    mode: EmailAiWriteMode;
    outputLanguage: EmailAiWriteLanguage;
    tone: EmailAiWriteTone;
  }) => Promise<EmailAiDraftResponse | null>;
  onInsert: (draft: EmailAiDraftResponse, mode: EmailAiWriteMode, insertMode: "replace" | "below") => void;
};

export function EmailAiWritePanel({
  open,
  onOpenChange,
  busy,
  hasExistingBody,
  defaultMode = "generate",
  error,
  onGenerate,
  onInsert,
}: Props) {
  const { t } = useTranslation("common");
  const [instruction, setInstruction] = useState("");
  const [mode, setMode] = useState<EmailAiWriteMode>(defaultMode);
  const [tone, setTone] = useState<EmailAiWriteTone>("professional");
  const [outputLanguage, setOutputLanguage] = useState<EmailAiWriteLanguage>("auto");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setLocalError(null);
      return;
    }
    setMode(hasExistingBody && defaultMode === "rewrite" ? "rewrite" : defaultMode);
  }, [open, hasExistingBody, defaultMode]);

  const handleGenerate = async () => {
    setLocalError(null);
    if (!instruction.trim()) {
      setLocalError(t("emailModule.workspace.aiWrite.instructionRequired"));
      return;
    }
    try {
      const result = await onGenerate({
        instruction: instruction.trim(),
        mode,
        outputLanguage,
        tone,
      });
      if (result) {
        setPreview({ ...result, mode });
      }
    } catch (err) {
      if (err instanceof EmailAiWriteAuthError) {
        setLocalError(t("emailModule.workspace.aiWrite.sessionExpired"));
        return;
      }
      setLocalError(err instanceof Error ? err.message : t("emailModule.workspace.aiWrite.error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="email-ai-write-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {t("emailModule.workspace.aiWrite.title")}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">{t("emailModule.workspace.aiWrite.neverSendHint")}</p>

        {!preview ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email-ai-instruction">{t("emailModule.workspace.aiWrite.promptLabel")}</Label>
              <Textarea
                id="email-ai-instruction"
                data-testid="email-ai-write-instruction"
                rows={4}
                value={instruction}
                disabled={busy}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={t("emailModule.workspace.aiWrite.promptPlaceholder")}
              />
              <p className="text-[11px] text-muted-foreground">{t("emailModule.workspace.aiWrite.examples")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t("emailModule.workspace.aiWrite.mode")}</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as EmailAiWriteMode)}
                  disabled={busy}
                >
                  <SelectTrigger data-testid="email-ai-write-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generate">{t("emailModule.workspace.aiWrite.modeGenerate")}</SelectItem>
                    <SelectItem value="rewrite" disabled={!hasExistingBody}>
                      {t("emailModule.workspace.aiWrite.modeRewrite")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("emailModule.workspace.aiWrite.language")}</Label>
                <Select
                  value={outputLanguage}
                  onValueChange={(v) => setOutputLanguage(v as EmailAiWriteLanguage)}
                  disabled={busy}
                >
                  <SelectTrigger data-testid="email-ai-write-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t("emailModule.workspace.aiWrite.languageAuto")}</SelectItem>
                    <SelectItem value="en">{t("emailModule.workspace.aiWrite.languageEn")}</SelectItem>
                    <SelectItem value="ar">{t("emailModule.workspace.aiWrite.languageAr")}</SelectItem>
                    <SelectItem value="fr">{t("emailModule.workspace.aiWrite.languageFr")}</SelectItem>
                    <SelectItem value="de">{t("emailModule.workspace.aiWrite.languageDe")}</SelectItem>
                    <SelectItem value="es">{t("emailModule.workspace.aiWrite.languageEs")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("emailModule.workspace.aiWrite.tone")}</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as EmailAiWriteTone)} disabled={busy}>
                  <SelectTrigger data-testid="email-ai-write-tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">{t("emailModule.workspace.aiWrite.toneProfessional")}</SelectItem>
                    <SelectItem value="formal">{t("emailModule.workspace.aiWrite.toneFormal")}</SelectItem>
                    <SelectItem value="friendly">{t("emailModule.workspace.aiWrite.toneFriendly")}</SelectItem>
                    <SelectItem value="concise">{t("emailModule.workspace.aiWrite.toneConcise")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(localError || error) && (
              <p className="text-sm text-destructive" data-testid="email-ai-write-error">
                {localError || error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
                {t("emailModule.workspace.aiWrite.cancel")}
              </Button>
              <Button
                type="button"
                disabled={busy}
                data-testid="email-ai-write-generate"
                onClick={() => void handleGenerate()}
              >
                {busy ? (
                  <>
                    <Loader2 className="me-1.5 size-3.5 animate-spin" />
                    {t("emailModule.workspace.aiWrite.working")}
                  </>
                ) : (
                  t("emailModule.workspace.aiWrite.generate")
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t("emailModule.workspace.fields.subject")}</Label>
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm" dir="auto">
                {preview.subject || t("emailModule.workspace.noSubject")}
              </p>
            </div>
            <div className="space-y-1">
              <Label>{t("emailModule.workspace.fields.body")}</Label>
              <pre
                className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-sans"
                dir="auto"
                data-testid="email-ai-write-preview-body"
              >
                {preview.body}
              </pre>
            </div>

            {(localError || error) && (
              <p className="text-sm text-destructive">{localError || error}</p>
            )}

            <DialogFooter className="flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                }}
              >
                {t("emailModule.workspace.aiWrite.regenerate")}
              </Button>
              {preview.mode === "rewrite" ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    data-testid="email-ai-write-insert-below"
                    onClick={() => onInsert(preview, preview.mode, "below")}
                  >
                    {t("emailModule.workspace.aiWrite.insertBelow")}
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    data-testid="email-ai-write-replace"
                    onClick={() => onInsert(preview, preview.mode, "replace")}
                  >
                    {t("emailModule.workspace.aiWrite.replace")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={busy}
                  data-testid="email-ai-write-insert"
                  onClick={() => onInsert(preview, preview.mode, "replace")}
                >
                  {t("emailModule.workspace.aiWrite.insert")}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
