import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { useAuthUser } from "@/hooks/use-rbac";
import {
  useCreateEmailTemplate,
  useDeleteEmailTemplate,
  useDuplicateEmailTemplate,
  useEmailTemplates,
  useSetEmailTemplateEnabled,
  useUpdateEmailTemplate,
} from "@/hooks/email/use-email-templates";
import { useTestSendEmailTemplate } from "@/hooks/email/use-test-send-email-template";
import {
  EMAIL_TEMPLATE_PREVIEW_CONTEXT,
  EMAIL_TEMPLATE_VARIABLES,
  normalizeEmailTemplateCode,
  renderEmailTemplate,
  type CompanyEmailTemplate,
  type EmailTemplateInput,
} from "@/lib/email-templates";
import { isEmailApiConfigured } from "@/lib/notifications/providers/email/services/email-api-client";
import { DeleteDialog } from "@/components/dashboard/delete-dialog";
import { DashboardCard } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type EditorState = EmailTemplateInput & { id?: string };

const EMPTY_EDITOR: EditorState = {
  name: "",
  code: "",
  subject: "",
  body: "",
  enabled: true,
};

export function EmailTemplatesPage() {
  const { t } = useTranslation("common");
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { hasPermission, isSuperAdmin } = useAuthUser();
  const canEdit = isSuperAdmin || hasPermission("settings.edit");

  const { data = [], isLoading, isError, error, refetch } = useEmailTemplates(companyId);
  const createMutation = useCreateEmailTemplate(companyId);
  const updateMutation = useUpdateEmailTemplate(companyId);
  const setEnabledMutation = useSetEmailTemplateEnabled(companyId);
  const duplicateMutation = useDuplicateEmailTemplate(companyId);
  const deleteMutation = useDeleteEmailTemplate(companyId);
  const testSendMutation = useTestSendEmailTemplate(companyId);

  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [showPreview, setShowPreview] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyEmailTemplate | null>(null);
  const [codeTouched, setCodeTouched] = useState(false);
  const [testSendOpen, setTestSendOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const focusField = useRef<"subject" | "body">("body");
  const apiConfigured = isEmailApiConfigured();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q) ||
        row.subject.toLowerCase().includes(q),
    );
  }, [data, search]);

  const preview = useMemo(
    () =>
      renderEmailTemplate(
        { subject: editor.subject, body: editor.body },
        EMAIL_TEMPLATE_PREVIEW_CONTEXT,
      ),
    [editor.subject, editor.body],
  );

  const saving =
    createMutation.isPending || updateMutation.isPending || setEnabledMutation.isPending;

  function openCreate() {
    setEditor(EMPTY_EDITOR);
    setCodeTouched(false);
    setShowPreview(false);
    setEditorOpen(true);
  }

  function openEdit(row: CompanyEmailTemplate) {
    setEditor({
      id: row.id,
      name: row.name,
      code: row.code,
      subject: row.subject,
      body: row.body,
      enabled: row.enabled,
    });
    setCodeTouched(true);
    setShowPreview(false);
    setEditorOpen(true);
  }

  function insertVariable(token: string) {
    const field = focusField.current;
    setEditor((prev) => ({
      ...prev,
      [field]: `${prev[field] ?? ""}${token}`,
    }));
  }

  async function handleSave() {
    if (!canEdit) return;
    const input: EmailTemplateInput = {
      name: editor.name,
      code: editor.code,
      subject: editor.subject,
      body: editor.body,
      enabled: editor.enabled,
    };
    try {
      if (editor.id) {
        await updateMutation.mutateAsync({ id: editor.id, input });
      } else {
        await createMutation.mutateAsync(input);
      }
      toast.success(t("emailModule.templates.saved"));
      setEditorOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("emailModule.templates.saveError"));
    }
  }

  async function handleTestSend() {
    if (!canEdit || !editor.id) {
      toast.error(t("emailModule.templates.testSendSaveFirst"));
      return;
    }
    if (!editor.enabled) {
      toast.error(t("emailModule.templates.testSendDisabled"));
      return;
    }
    if (!apiConfigured) {
      toast.error(t("emailModule.templates.testSendNotConfigured"));
      return;
    }
    try {
      await testSendMutation.mutateAsync({
        templateId: editor.id,
        recipientEmail: testRecipient,
      });
      toast.success(t("emailModule.templates.testSendSuccess"));
      setTestSendOpen(false);
      setTestRecipient("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("emailModule.templates.testSendError"));
    }
  }

  if (isLoading) {
    return (
      <DashboardCard className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("emailModule.templates.title")}…
      </DashboardCard>
    );
  }

  if (isError) {
    return (
      <DashboardCard className="space-y-3 p-6">
        <h2 className="text-lg font-semibold">{t("emailModule.templates.loadError")}</h2>
        {error instanceof Error ? (
          <p className="text-sm text-muted-foreground">{error.message}</p>
        ) : null}
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          {t("emailModule.templates.retry")}
        </Button>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardCard className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("emailModule.templates.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("emailModule.templates.subtitle")}
            </p>
            {!canEdit ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("emailModule.templates.readOnly")}
              </p>
            ) : null}
          </div>
          {canEdit ? (
            <Button type="button" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("emailModule.templates.create")}
            </Button>
          ) : null}
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("emailModule.templates.searchPlaceholder")}
          className="max-w-md"
        />

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {data.length === 0
              ? t("emailModule.templates.empty")
              : t("emailModule.templates.noMatches")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_5.5rem_auto] items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="text-start">{t("emailModule.templates.columns.name")}</div>
                <div className="text-start">{t("emailModule.templates.columns.code")}</div>
                <div className="text-start">{t("emailModule.templates.columns.subject")}</div>
                <div className="text-start">{t("emailModule.templates.columns.status")}</div>
                <div className="text-start">{t("emailModule.templates.columns.actions")}</div>
              </div>
              <div>
                {filtered.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_5.5rem_auto] items-center gap-3 border-t border-border/50 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0 truncate font-medium text-start">{row.name}</div>
                    <div className="min-w-0 truncate font-mono text-xs text-start">{row.code}</div>
                    <div className="min-w-0 truncate text-muted-foreground text-start">
                      {row.subject || "—"}
                    </div>
                    <div className="flex items-center justify-start">
                      {canEdit ? (
                        <Switch
                          checked={row.enabled}
                          disabled={setEnabledMutation.isPending}
                          onCheckedChange={(enabled) => {
                            void setEnabledMutation
                              .mutateAsync({ id: row.id, enabled })
                              .catch((err) =>
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : t("emailModule.templates.saveError"),
                                ),
                              );
                          }}
                          aria-label={
                            row.enabled
                              ? t("emailModule.templates.enabled")
                              : t("emailModule.templates.disabled")
                          }
                        />
                      ) : (
                        <span
                          className={
                            row.enabled
                              ? "text-xs font-medium text-primary"
                              : "text-xs font-medium text-muted-foreground"
                          }
                        >
                          {row.enabled
                            ? t("emailModule.templates.enabled")
                            : t("emailModule.templates.disabled")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-start gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(row)}
                        aria-label={t("emailModule.templates.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canEdit ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={duplicateMutation.isPending}
                            onClick={() => {
                              void duplicateMutation
                                .mutateAsync(row.id)
                                .then(() => toast.success(t("emailModule.templates.duplicated")))
                                .catch((err) =>
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : t("emailModule.templates.saveError"),
                                  ),
                                );
                            }}
                            aria-label={t("emailModule.templates.duplicate")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(row)}
                            aria-label={t("emailModule.templates.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DashboardCard>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editor.id ? t("emailModule.templates.edit") : t("emailModule.templates.create")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email-tpl-name">{t("emailModule.templates.name")}</Label>
                <Input
                  id="email-tpl-name"
                  value={editor.name}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const name = e.target.value;
                    setEditor((prev) => ({
                      ...prev,
                      name,
                      code: codeTouched ? prev.code : normalizeEmailTemplateCode(name),
                    }));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email-tpl-code">{t("emailModule.templates.code")}</Label>
                <Input
                  id="email-tpl-code"
                  value={editor.code}
                  disabled={!canEdit}
                  className="font-mono text-sm"
                  onChange={(e) => {
                    setCodeTouched(true);
                    setEditor((prev) => ({
                      ...prev,
                      code: normalizeEmailTemplateCode(e.target.value),
                    }));
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <Label htmlFor="email-tpl-enabled">{t("emailModule.templates.enabled")}</Label>
              <Switch
                id="email-tpl-enabled"
                checked={editor.enabled}
                disabled={!canEdit}
                onCheckedChange={(enabled) => setEditor((prev) => ({ ...prev, enabled }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-tpl-subject">{t("emailModule.templates.subject")}</Label>
              <Input
                id="email-tpl-subject"
                value={editor.subject}
                disabled={!canEdit}
                onFocus={() => {
                  focusField.current = "subject";
                }}
                onChange={(e) => setEditor((prev) => ({ ...prev, subject: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email-tpl-body">{t("emailModule.templates.body")}</Label>
              <Textarea
                id="email-tpl-body"
                value={editor.body}
                disabled={!canEdit}
                rows={8}
                onFocus={() => {
                  focusField.current = "body";
                }}
                onChange={(e) => setEditor((prev) => ({ ...prev, body: e.target.value }))}
              />
            </div>

            <div className="space-y-2 rounded-md border border-border/60 p-3">
              <div>
                <p className="text-sm font-medium">{t("emailModule.templates.variables.heading")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("emailModule.templates.variables.hint")}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
                  <Button
                    key={variable.key}
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEdit}
                    className="font-mono text-xs"
                    onClick={() => insertVariable(variable.token)}
                    title={t(variable.labelKey)}
                  >
                    {variable.token}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowPreview((v) => !v)}
              >
                {t("emailModule.templates.preview")}
              </Button>
              {showPreview ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{t("emailModule.templates.previewTitle")}</p>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("emailModule.templates.subject")}
                    </p>
                    <p className="whitespace-pre-wrap">{preview.subject || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {t("emailModule.templates.body")}
                    </p>
                    <p className="whitespace-pre-wrap">{preview.body || "—"}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex gap-2">
              {canEdit && editor.id ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setTestRecipient("");
                    setTestSendOpen(true);
                  }}
                  disabled={!editor.enabled}
                >
                  {t("emailModule.templates.testSend")}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                {t("emailModule.templates.cancel")}
              </Button>
              {canEdit ? (
                <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("emailModule.templates.save")}
                </Button>
              ) : null}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testSendOpen} onOpenChange={setTestSendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("emailModule.templates.testSendTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">{t("emailModule.templates.testSendHint")}</p>
            {!apiConfigured ? (
              <p className="text-sm text-destructive">
                {t("emailModule.templates.testSendNotConfigured")}
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="email-tpl-test-to">{t("emailModule.templates.testSendRecipient")}</Label>
              <Input
                id="email-tpl-test-to"
                type="email"
                autoComplete="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setTestSendOpen(false)}>
              {t("emailModule.templates.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleTestSend()}
              disabled={testSendMutation.isPending || !testRecipient.trim() || !apiConfigured}
            >
              {testSendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("emailModule.templates.testSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        itemName={deleteTarget?.name}
        title={t("emailModule.templates.deleteConfirmTitle")}
        description={
          deleteTarget
            ? t("emailModule.templates.deleteConfirmDescription", { name: deleteTarget.name })
            : undefined
        }
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          void deleteMutation
            .mutateAsync(deleteTarget.id)
            .then(() => {
              toast.success(t("emailModule.templates.deleted"));
              setDeleteTarget(null);
            })
            .catch((err) =>
              toast.error(
                err instanceof Error ? err.message : t("emailModule.templates.saveError"),
              ),
            );
        }}
      />
    </div>
  );
}
