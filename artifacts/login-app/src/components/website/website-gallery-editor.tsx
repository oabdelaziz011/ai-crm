import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { uploadCompanyBrandAsset, removeCompanyBrandPublicUrl } from "@/lib/company-workspace/services/company-brand-upload";
import {
  WEBSITE_GALLERY_LIMIT,
  type WebsiteGallery,
  type WebsiteGalleryDirection,
} from "@/lib/website/website-model";

export function WebsiteGalleryEditor({
  companyId,
  gallery,
  disabled,
  onChange,
}: {
  companyId: string;
  gallery: WebsiteGallery;
  disabled: boolean;
  onChange: (gallery: WebsiteGallery) => void;
}) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const full = gallery.slides.length >= WEBSITE_GALLERY_LIMIT;

  const setDirection = (direction: WebsiteGalleryDirection) => {
    onChange({ ...gallery, direction });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || disabled) return;
    setUploading(true);
    const next = [...gallery.slides];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= WEBSITE_GALLERY_LIMIT) break;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
          toast({ title: t("websiteBuilder.builder.galleryType"), variant: "destructive" });
          continue;
        }
        const uploaded = await uploadCompanyBrandAsset({
          companyId,
          slot: "website-gallery",
          file,
        });
        next.push({ id: crypto.randomUUID(), url: uploaded.publicUrl, alt: "" });
      }
      onChange({ ...gallery, slides: next });
    } catch {
      toast({ title: t("websiteBuilder.builder.galleryUploadFailed"), variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeSlide = (id: string) => {
    const slide = gallery.slides.find((item) => item.id === id);
    onChange({ ...gallery, slides: gallery.slides.filter((item) => item.id !== id) });
    if (slide) void removeCompanyBrandPublicUrl(slide.url);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t("websiteBuilder.builder.galleryDirection")}</Label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={gallery.direction === "left" ? "default" : "outline"}
            disabled={disabled}
            onClick={() => setDirection("left")}
          >
            {t("websiteBuilder.builder.galleryLeft")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={gallery.direction === "right" ? "default" : "outline"}
            disabled={disabled}
            onClick={() => setDirection("right")}
          >
            {t("websiteBuilder.builder.galleryRight")}
          </Button>
        </div>
      </div>
      {gallery.slides.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("websiteBuilder.builder.galleryEmpty")}</p>
      ) : (
        <ul className="space-y-3">
          {gallery.slides.map((slide, index) => (
            <li key={slide.id} className="flex items-center gap-3">
              <img src={slide.url} alt="" className="size-14 rounded-md object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`gallery-alt-${slide.id}`} className="text-xs text-muted-foreground">
                  {t("websiteBuilder.builder.galleryCaption", { index: index + 1 })}
                </Label>
                <Input
                  id={`gallery-alt-${slide.id}`}
                  value={slide.alt}
                  disabled={disabled}
                  maxLength={120}
                  onChange={(event) =>
                    onChange({
                      ...gallery,
                      slides: gallery.slides.map((item) =>
                        item.id === slide.id ? { ...item, alt: event.target.value } : item,
                      ),
                    })
                  }
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled || index === 0}
                onClick={() => {
                  const slides = [...gallery.slides];
                  [slides[index - 1], slides[index]] = [slides[index], slides[index - 1]];
                  onChange({ ...gallery, slides });
                }}
                aria-label={t("websiteBuilder.builder.galleryPrev")}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled || index === gallery.slides.length - 1}
                onClick={() => {
                  const slides = [...gallery.slides];
                  [slides[index + 1], slides[index]] = [slides[index], slides[index + 1]];
                  onChange({ ...gallery, slides });
                }}
                aria-label={t("websiteBuilder.builder.galleryNext")}
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={disabled}
                onClick={() => removeSlide(slide.id)}
                aria-label={t("websiteBuilder.builder.galleryRemove")}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          disabled={disabled || uploading || full}
          onChange={(event) => void addFiles(event.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading || full}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden />
          {full ? t("websiteBuilder.builder.galleryLimit") : t("websiteBuilder.builder.galleryAdd")}
        </Button>
      </div>
    </div>
  );
}
