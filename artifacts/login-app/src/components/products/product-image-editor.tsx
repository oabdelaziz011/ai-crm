import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { uploadCompanyBrandAsset } from "@/lib/company-workspace/services/company-brand-upload";
import { PRODUCT_PHOTO_LIMIT } from "@/components/products/product-image-stage";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export function ProductImageEditor({
  urls,
  disabled,
  onChange,
}: {
  urls: readonly string[];
  disabled?: boolean;
  onChange: (urls: string[]) => void | Promise<void>;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { company } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photos = urls.slice(0, PRODUCT_PHOTO_LIMIT);
  const companyId = company?.id ?? "";
  const locked = disabled || uploading || !companyId;

  const upload = async (files: FileList | null) => {
    if (!files?.length || locked) return;
    const room = PRODUCT_PHOTO_LIMIT - photos.length;
    const nextFiles = [...files].filter((file) => ACCEPTED.includes(file.type)).slice(0, room);
    if (!nextFiles.length) {
      toast({ title: t("products.images.type"), variant: "destructive" });
      return;
    }
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of nextFiles) {
        const uploaded = await uploadCompanyBrandAsset({ companyId, slot: "product-gallery", file });
        if (uploaded.publicUrl && !photos.includes(uploaded.publicUrl) && !added.includes(uploaded.publicUrl)) {
          added.push(uploaded.publicUrl);
        }
      }
    } catch {
      toast({ title: t("products.images.saveFailed"), variant: "destructive" });
      added.length = 0;
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
    if (added.length) await onChange([...photos, ...added].slice(0, PRODUCT_PHOTO_LIMIT));
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("products.images.title")}
        </p>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {photos.length}/{PRODUCT_PHOTO_LIMIT}
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{t("products.images.hint")}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((url) => (
          <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-border/60 bg-muted">
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              className="absolute end-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm"
              disabled={locked}
              aria-label={t("products.images.remove")}
              onClick={() => void onChange(photos.filter((item) => item !== url))}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {photos.length < PRODUCT_PHOTO_LIMIT ? (
          <button
            type="button"
            className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground hover:bg-muted/40"
            disabled={locked}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-5" aria-hidden />
            <span className="sr-only">{t("products.images.add")}</span>
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        className="sr-only"
        onChange={(event) => void upload(event.target.files)}
      />
      {uploading ? <p className="text-[12px] text-muted-foreground">{t("products.images.uploading")}</p> : null}
    </section>
  );
}
