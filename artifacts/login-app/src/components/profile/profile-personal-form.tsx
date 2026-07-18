import { useEffect, useMemo, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Loader2, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useUpdateMyProfile } from "@/hooks/use-my-profile";
import type { MyProfile } from "@/lib/types";
import { DashboardCard } from "@/components/dashboard/ui";
import { PROFILE_TIMEZONE_OPTIONS } from "@/lib/profile-timezones";
import { isAppLanguage, resolveAppLanguage } from "@/lib/i18n/resolve-app-language";
import {
  AVATAR_MAX_INLINE_BYTES,
  estimateDataUrlBytes,
  isValidAvatarUrl,
} from "@/lib/avatar-url";
import { safeDisplayText } from "@/lib/profile/display-safe";

type ProfileFormValues = {
  full_name: string;
  avatar_url: string;
  preferred_language: string;
  timezone: string;
};

function getInitials(name: string | null | undefined, email: string | null | undefined) {
  const source = safeDisplayText(name) || safeDisplayText(email) || "U";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.charAt(0) ?? "";
    const second = parts[1]?.charAt(0) ?? "";
    const initials = `${first}${second}`.trim();
    if (initials) {
      return initials.toUpperCase();
    }
  }
  return (source.charAt(0) || "U").toUpperCase();
}

type ProfilePersonalFormProps = {
  profile: MyProfile;
};

export function ProfilePersonalForm({ profile }: ProfilePersonalFormProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { user, refreshAuthContext } = useAuth();
  const updateProfile = useUpdateMyProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileId = profile?.id ?? "";

  const schema = useMemo(
    () =>
      z.object({
        full_name: z.string().trim().min(1, t("profiles.validation.fullNameRequired")),
        avatar_url: z
          .string()
          .refine((value) => isValidAvatarUrl(value), t("profiles.avatar.invalidUrl")),
        preferred_language: z.enum(["en", "ar"]),
        timezone: z.string().min(1),
      }),
    [t],
  );

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: "",
      avatar_url: "",
      preferred_language: "en",
      timezone: "UTC",
    },
  });

  const { reset } = form;

  useEffect(() => {
    if (!profileId) {
      return;
    }

    reset({
      full_name: profile?.full_name ?? "",
      avatar_url: profile?.avatar_url ?? "",
      preferred_language: isAppLanguage(profile?.preferred_language)
        ? (profile?.preferred_language ?? "en")
        : resolveAppLanguage(profile?.preferred_language),
      timezone: profile?.timezone?.trim() || "UTC",
    });
  }, [
    profileId,
    profile?.updated_at,
    profile?.full_name,
    profile?.avatar_url,
    profile?.preferred_language,
    profile?.timezone,
    reset,
  ]);

  const avatarPreview = form.watch("avatar_url") ?? "";
  const displayEmail = safeDisplayText(profile?.email ?? user?.email ?? null);

  if (!profileId) {
    return null;
  }

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync({
        full_name: values.full_name.trim(),
        avatar_url: values.avatar_url.trim() || null,
        preferred_language: values.preferred_language,
        timezone: values.timezone,
      });

      await refreshAuthContext?.();

      toast({
        title: t("profiles.saveSuccessTitle"),
        description: t("profiles.saveSuccessDescription"),
      });
    } catch (submitError) {
      toast({
        title: t("profiles.saveFailedTitle"),
        description: submitError instanceof Error ? submitError.message : t("profiles.saveFailedDescription"),
        variant: "destructive",
      });
    }
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast({
        title: t("profiles.avatar.invalidTypeTitle"),
        description: t("profiles.avatar.invalidTypeDescription"),
        variant: "destructive",
      });
      return;
    }

    if (file.size > AVATAR_MAX_INLINE_BYTES) {
      toast({
        title: t("profiles.avatar.tooLargeTitle"),
        description: t("profiles.avatar.tooLargeDescription"),
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        if (estimateDataUrlBytes(reader.result) > AVATAR_MAX_INLINE_BYTES) {
          toast({
            title: t("profiles.avatar.tooLargeTitle"),
            description: t("profiles.avatar.tooLargeDescription"),
            variant: "destructive",
          });
          return;
        }

        if (!isValidAvatarUrl(reader.result)) {
          toast({
            title: t("profiles.avatar.invalidTypeTitle"),
            description: t("profiles.avatar.invalidUrl"),
            variant: "destructive",
          });
          return;
        }

        form.setValue("avatar_url", reader.result, { shouldDirty: true });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <DashboardCard className="p-6">
      <h3 className="font-semibold mb-6 flex items-center gap-2">
        <User className="w-4 h-4 text-primary" />
        {t("profiles.sections.personal")}
      </h3>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <Avatar className="w-20 h-20 border border-primary/20 bg-primary/10">
            <AvatarImage
              src={avatarPreview || undefined}
              alt={safeDisplayText(profile?.full_name) ?? displayEmail ?? ""}
            />
            <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
              {getInitials(profile?.full_name, displayEmail)}
            </AvatarFallback>
          </Avatar>

          <div className="space-y-3 flex-1">
            <div>
              <p className="text-sm font-medium">{t("profiles.avatar.label")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("profiles.avatar.description")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/10 gap-2"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-4 h-4" />
                {t("profiles.avatar.upload")}
              </Button>
              {avatarPreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  onClick={() => form.setValue("avatar_url", "", { shouldDirty: true })}
                >
                  {t("profiles.avatar.remove")}
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="profile-full-name">{t("profiles.fields.fullName")}</Label>
            <Input
              id="profile-full-name"
              className="bg-background/50 border-white/10"
              {...form.register("full_name")}
            />
            {form.formState.errors.full_name && (
              <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="profile-avatar-url">{t("profiles.avatar.urlLabel")}</Label>
            <Input
              id="profile-avatar-url"
              type="url"
              dir="ltr"
              placeholder={t("profiles.avatar.urlPlaceholder")}
              className="bg-background/50 border-white/10"
              {...form.register("avatar_url")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-language">{t("profiles.fields.language")}</Label>
            <select
              id="profile-language"
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
              {...form.register("preferred_language")}
            >
              <option value="en">{t("languages.english")}</option>
              <option value="ar">{t("languages.arabic")}</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-timezone">{t("profiles.fields.timezone")}</Label>
            <select
              id="profile-timezone"
              className="w-full rounded-xl bg-background/50 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-primary/40 transition-colors"
              {...form.register("timezone")}
            >
              {(PROFILE_TIMEZONE_OPTIONS ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary"
            disabled={updateProfile.isPending || !form.formState.isDirty}
          >
            {updateProfile.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              t("buttons.saveChanges")
            )}
          </Button>
        </div>
      </form>
    </DashboardCard>
  );
}
