import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Download, Eye, GitCompare, Redo2, RotateCcw, Undo2, Upload } from "lucide-react";
import { getSupportedOperationsTemplateKeys, type OperationsWorkspaceConfig } from "@workspace/universal-operations-engine";
import type { OperationsConfigTab } from "@workspace/universal-operations-engine";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { useOperationsConfigurationEditor } from "@/hooks/universal-operations/use-operations-configuration-editor";

type Editor = ReturnType<typeof useOperationsConfigurationEditor>;

type Props = {
  editor: Editor;
  activeTab: OperationsConfigTab;
};

export function OperationsConfigEnterpriseToolbar({ editor, activeTab }: Props) {
  const { t } = useTranslation("common");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
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
    const text = await file.text();
    editor.importConfig(text, "merge");
  };

  const sectionResetKey = tabToSection(activeTab);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-3 py-2">
      <Button type="button" size="sm" variant="outline" disabled={!editor.canUndo} onClick={editor.undo}>
        <Undo2 className="me-1 size-3.5" />
        {t("universalOperations.configuration.enterprise.undo")}
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={!editor.canRedo} onClick={editor.redo}>
        <Redo2 className="me-1 size-3.5" />
        {t("universalOperations.configuration.enterprise.redo")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={handleExport} disabled={!editor.draft}>
        <Download className="me-1 size-3.5" />
        {t("universalOperations.configuration.enterprise.export")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
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
      <Button type="button" size="sm" variant="outline" onClick={() => setCloneOpen(true)}>
        <Copy className="me-1 size-3.5" />
        {t("universalOperations.configuration.enterprise.clone")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
        <Eye className="me-1 size-3.5" />
        {t("universalOperations.configuration.enterprise.preview")}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          editor.compareWithPublished();
          setDiffOpen(true);
        }}
      >
        <GitCompare className="me-1 size-3.5" />
        {t("universalOperations.configuration.enterprise.diff")}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => void editor.discardDraft()} disabled={editor.isDiscarding}>
        <RotateCcw className="me-1 size-3.5" />
        {t("universalOperations.configuration.enterprise.discard")}
      </Button>
      {sectionResetKey && (
        <Button type="button" size="sm" variant="outline" onClick={() => editor.resetSection(sectionResetKey)}>
          {t("universalOperations.configuration.enterprise.resetSection")}
        </Button>
      )}
      <Button type="button" size="sm" variant="outline" onClick={editor.resetToPublished}>
        {t("universalOperations.configuration.enterprise.resetPublished")}
      </Button>

      <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("universalOperations.configuration.enterprise.clone")}</DialogTitle>
          </DialogHeader>
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
                  {key}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!cloneTarget) return;
                void editor.cloneToTemplate(cloneTarget).then(() => setCloneOpen(false));
              }}
              disabled={!cloneTarget || editor.isCloning}
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
          <pre className="max-h-96 overflow-auto rounded-lg bg-muted/30 p-3 text-[10px]">{editor.exportConfig()}</pre>
        </DialogContent>
      </Dialog>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("universalOperations.configuration.enterprise.diff")}</DialogTitle>
          </DialogHeader>
          <ul className="space-y-2 text-xs">
            {(editor.compareDiff ?? []).map((entry) => (
              <li key={entry.path} className="rounded border border-border/50 p-2">
                <p className="font-semibold">{entry.path}</p>
                <p className="text-muted-foreground">{t("universalOperations.configuration.enterprise.diffChanged")}</p>
              </li>
            ))}
            {(editor.compareDiff ?? []).length === 0 && (
              <li className="text-muted-foreground">{t("universalOperations.configuration.enterprise.diffEmpty")}</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
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
