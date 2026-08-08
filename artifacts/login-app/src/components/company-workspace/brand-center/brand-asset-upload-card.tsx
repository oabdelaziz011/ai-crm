import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BrandUploadError,
  removeCompanyBrandPublicUrl,
  uploadCompanyBrandAsset,
  validateCompanyBrandImage,
  type BrandUploadErrorCode,
} from "@/lib/company-workspace/services/company-brand-upload";

type BrandAssetUploadCardProps = {
  companyId: string;
  slot: string;
  label: string;
  hint?: string;
  url: string | null;
  readOnly?: boolean;
  onUploaded: (publicUrl: string, storagePath: string) => void;
  onDeleted: () => void;
};

export function BrandAssetUploadCard({
  companyId,
  slot,
  label,
  hint,
  url,
  readOnly,
  onUploaded,
  onDeleted,
}: BrandAssetUploadCardProps) {
  const { t } = useTranslation("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploading = progress !== null;

  function mapError(code: BrandUploadErrorCode): string {
    return t(`companyWorkspace.brandCenter.uploadErrors.${code}`, {
      defaultValue: t("companyWorkspace.brandCenter.uploadFailed"),
    });
  }

  async function handleFile(file: File | null | undefined) {
    if (!file || readOnly) return;
    setError(null);
    const validation = validateCompanyBrandImage(file);
    if (!validation.ok) {
      setError(mapError(validation.code));
      return;
    }
    setProgress(1);
    const previousUrl = url;
    try {
      const result = await uploadCompanyBrandAsset({
        companyId,
        slot,
        file,
        onProgress: setProgress,
      });
      onUploaded(result.publicUrl, result.storagePath);
      if (previousUrl && previousUrl !== result.publicUrl) {
        void removeCompanyBrandPublicUrl(previousUrl);
      }
    } catch (err) {
      if (err instanceof BrandUploadError) {
        setError(mapError(err.code));
      } else {
        setError(t("companyWorkspace.brandCenter.uploadFailed"));
      }
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (readOnly) return;
    setError(null);
    const previousUrl = url;
    onDeleted();
    if (previousUrl) void removeCompanyBrandPublicUrl(previousUrl);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {url && !readOnly ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={() => void handleDelete()}
            aria-label={t("companyWorkspace.brandCenter.deleteImage")}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      <div
        className={cn(
          "relative flex min-h-[120px] flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-border/70 bg-muted/30 p-3 transition-colors",
          dragOver && !readOnly && "border-primary/70 bg-primary/5",
          readOnly && "opacity-90",
        )}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {url ? (
          <img src={url} alt={label} className="max-h-20 max-w-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImagePlus className="size-6 opacity-70" />
            <p className="text-xs">{t("companyWorkspace.brandCenter.noImage")}</p>
          </div>
        )}

        {uploading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="text-xs font-medium">{progress}%</p>
          </div>
        ) : null}
      </div>

      {!readOnly ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="me-1.5 size-3.5" />
            {url
              ? t("companyWorkspace.brandCenter.replaceImage")
              : t("companyWorkspace.brandCenter.uploadImage")}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/svg+xml,image/webp,image/jpeg,.png,.svg,.webp,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t("companyWorkspace.brandCenter.formatsHint")}
      </p>
    </div>
  );
}
