import { useRef, useState } from "react";
import { ChevronDown, Copy, Download, Eye, GitCompare, Redo2, RotateCcw, Undo2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getSupportedOperationsTemplateKeys, type OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { useOperationsConfigurationEditor } from "@/hooks/universal-operations/use-operations-configuration-editor";
import { cn } from "@/lib/utils";

type Editor = ReturnType<typeof useOperationsConfigurationEditor>;

type Props = {
  editor: Editor;
  activeTab: OperationsConfigTab;
  readOnly?: boolean;
  canPublish?: boolean;
  onOpenDiff: () => void;
};

export function OperationsConfigEnterpriseToolbar({
  editor,
  activeTab,
  readOnly = false,
  canPublish = true,
  onOpenDiff,
}: Props) {
  const { t } = useTranslation("common");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cloneTarget, setCloneTarget] = useState("");

  const templates = getSupportedOperationsTemplateKeys().filter((k) => k !== editor.templateKey);

  const handleExport = () => {
    const json = editor.exportConfig();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `operations-config-${editor.templateKey}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      editor.importConfig(text, "merge");
      toast.success(t("universalOperations.configuration.enterprise.importSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("universalOperations.configuration.enterprise.importError"));
    }
  };

  const handleDiscard = async () => {
    try {
      await editor.discardDraft();
      toast.success(t("universalOperations.configuration.enterprise.discardSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("universalOperations.configuration.enterprise.discardError"));
    }
  };

  const templateName = (key: string) => {
    const i18nKey = `universalOperations.workspaceNames.${key}`;
    const translated = t(i18nKey);
    return translated === i18nKey ? key : translated;
  };

  const sectionResetKey = tabToSection(activeTab);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/10 px-4 py-2.5 text-start transition-colors hover:bg-muted/20"
        >
          <div>
            <p className="text-xs font-medium">{t("universalOperations.configuration.enterprise.advancedToolsTitle")}</p>
            <p className="text-[10px] text-muted-foreground">{t("universalOperations.configuration.enterprise.advancedToolsHint")}</p>
          </div>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
          <Button type="button" size="sm" variant="outline" disabled={!editor.canUndo || readOnly} onClick={editor.undo}>
            <Undo2 className="me-1 size-3.5" />
            {t("universalOperations.configuration.enterprise.undo")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!editor.canRedo || readOnly} onClick={editor.redo}>
            <Redo2 className="me-1 size-3.5" />
            {t("universalOperations.configuration.enterprise.redo")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleExport} disabled={!editor.draft}>
            <Download className="me-1 size-3.5" />
            {t("universalOperations.configuration.enterprise.export")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={readOnly} onClick={() => fileInputRef.current?.click()}>
            <Upload className="me-1 size-3.5" />
            {t("universalOperations.configuration.enterprise.import")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" disabled={readOnly || !canPublish} onClick={() => setCloneOpen(true)}>
            <Copy className="me-1 size-3.5" />
            {t("universalOperations.configuration.enterprise.clone")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)} disabled={!editor.draft}>
            <Eye className="me-1 size-3.5" />
            {t("universalOperations.configuration.enterprise.preview")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onOpenDiff} disabled={!editor.draft}>
            <GitCompare className="me-1 size-3.5" />
            {t("universalOperations.configuration.enterprise.diff")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={readOnly || editor.isDiscarding} onClick={() => void handleDiscard()}>
            <RotateCcw className="me-1 size-3.5" />
            {t("universalOperations.configuration.enterprise.discard")}
          </Button>
          {sectionResetKey ? (
            <Button type="button" size="sm" variant="outline" disabled={readOnly} onClick={() => editor.resetSection(sectionResetKey)}>
              {t("universalOperations.configuration.enterprise.resetSection")}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" disabled={readOnly} onClick={editor.resetToPublished}>
            {t("universalOperations.configuration.enterprise.resetPublished")}
          </Button>
        </div>
      </CollapsibleContent>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("universalOperations.configuration.enterprise.clone")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("universalOperations.configuration.enterprise.cloneHint")}</p>
          <div className="space-y-2">
            <Label>{t("universalOperations.configuration.enterprise.cloneTarget")}</Label>
            <select
              value={cloneTarget}
              onChange={(e) => setCloneTarget(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t("universalOperations.configuration.enterprise.selectTemplate")}</option>
              {templates.map((key) => (
                <option key={key} value={key}>
                  {templateName(key)}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!cloneTarget) return;
                void editor
                  .cloneToTemplate(cloneTarget)
                  .then(() => {
                    toast.success(t("universalOperations.configuration.enterprise.cloneSuccess"));
                    setCloneOpen(false);
                  })
                  .catch((error) => {
                    toast.error(error instanceof Error ? error.message : t("universalOperations.configuration.enterprise.cloneError"));
                  });
              }}
              disabled={!cloneTarget || editor.isCloning || readOnly || !canPublish}
            >
              {t("universalOperations.configuration.enterprise.clone")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("universalOperations.configuration.enterprise.preview")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{t("universalOperations.configuration.enterprise.previewHint")}</p>
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted/30 p-3 text-[10px]">{editor.exportConfig()}</pre>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

function tabToSection(tab: OperationsConfigTab): keyof OperationsWorkspaceConfig | null {
  const map: Partial<Record<OperationsConfigTab, keyof OperationsWorkspaceConfig>> = {
    general: "terminology",
    columns: "columns",
    statuses: "statuses",
    payment_status: "paymentStatuses",
    services: "services",
    resources: "resources",
    automation: "automation",
    permissions: "permissions",
    views: "views",
    notifications: "notifications",
    integrations: "featureFlags",
    ai: "ai",
    advanced: "dashboard",
  };
  return map[tab] ?? null;
}
