import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Loader2, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/auth-context";
import { useUpdateMyProfile } from "@/hooks/use-my-profile";
import type { MyProfile } from "@/lib/types";
import { DashboardCard } from "@/components/dashboard/ui";
import { PROFILE_TIMEZONE_OPTIONS } from "@/lib/profile-timezones";
import { isAppLanguage, resolveAppLanguage } from "@/lib/i18n/resolve-app-language";
import { isValidAvatarUrl } from "@/lib/avatar-url";
import { AvatarUploadError, uploadProfileAvatar } from "@/lib/profile/avatar-upload";
import { ProfileCurrencyField } from "@/components/profile/profile-currency-field";
import { UserAvatar } from "@/components/profile/user-avatar";

type ProfileFormValues = {
  full_name: string;
  avatar_url: string;
  preferred_language: string;
  timezone: string;
  job_title: string;
  department: string;
  phone: string;
};

type ProfilePersonalFormProps = {
  profile: MyProfile;
};

export function ProfilePersonalForm({ profile }: ProfilePersonalFormProps) {
  const { t } = useTranslation("common");
  const { toast } = useToast();
  const { user, refreshAuthContext } = useAuth();
  const updateProfile = useUpdateMyProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
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
        job_title: z.string().max(120).optional(),
        department: z.string().max(120).optional(),
        phone: z.string().max(40).optional(),
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
      job_title: "",
      department: "",
      phone: "",
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
      job_title: profile?.job_title ?? "",
      department: profile?.department ?? "",
      phone: profile?.phone ?? "",
    });
  }, [
    profileId,
    profile?.updated_at,
    profile?.full_name,
    profile?.avatar_url,
    profile?.job_title,
    profile?.department,
    profile?.phone,
    profile?.preferred_language,
    profile?.timezone,
    reset,
  ]);

  const avatarPreview = form.watch("avatar_url") ?? "";

  if (!profileId) {
    return null;
  }

  const persistAvatar = async (avatarUrl: string | null) => {
    const values = form.getValues();
    await updateProfile.mutateAsync({
      full_name: values.full_name.trim() || profile.full_name || "User",
      avatar_url: avatarUrl,
      preferred_language: values.preferred_language,
      preferred_theme: profile.preferred_theme ?? "system",
      timezone: values.timezone,
      job_title: values.job_title.trim() || null,
      department: values.department.trim() || null,
      phone: values.phone.trim() || null,
    });
    form.setValue("avatar_url", avatarUrl ?? "", { shouldDirty: false });
    await refreshAuthContext?.();
  };

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync({
        full_name: values.full_name.trim(),
        avatar_url: values.avatar_url.trim() || null,
        preferred_language: values.preferred_language,
        preferred_theme: profile.preferred_theme ?? "system",
        timezone: values.timezone,
        job_title: values.job_title.trim() || null,
        department: values.department.trim() || null,
        phone: values.phone.trim() || null,
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

    // Prefer auth user id; profiles.id matches auth.users.id in this schema.
    const userId = user?.id ?? profile.id;
    if (!userId) {
      toast({
        title: t("profiles.saveFailedTitle"),
        description: t("profiles.saveFailedDescription"),
        variant: "destructive",
      });
      return;
    }

    setAvatarUploading(true);
    try {
      // Storage → profiles.avatar_url → writeMyProfileCache → employee-identity invalidate
      const storagePath = await uploadProfileAvatar(file, userId);
      await persistAvatar(storagePath);
      toast({
        title: t("profiles.avatar.uploadSuccessTitle"),
        description: t("profiles.avatar.uploadSuccessDescription"),
      });
    } catch (uploadError) {
      const message =
        uploadError instanceof AvatarUploadError
          ? uploadError.code === "too_large"
            ? t("profiles.avatar.tooLargeDescription")
            : uploadError.code === "unauthenticated"
              ? t("profiles.avatar.sessionExpiredDescription")
              : uploadError.code === "forbidden"
                ? t("profiles.avatar.forbiddenDescription")
                : uploadError.message
          : uploadError instanceof Error
            ? uploadError.message
            : t("profiles.avatar.uploadFailedDescription");

      toast({
        title: t("profiles.avatar.uploadFailedTitle"),
        description: message,
        variant: "destructive",
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarUploading(true);
    try {
      await persistAvatar(null);
      toast({
        title: t("profiles.avatar.removeSuccessTitle"),
        description: t("profiles.avatar.removeSuccessDescription"),
      });
    } catch (removeError) {
      toast({
        title: t("profiles.saveFailedTitle"),
        description:
          removeError instanceof Error ? removeError.message : t("profiles.saveFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <DashboardCard className="p-6">
      <h3 className="font-semibold mb-6 flex items-center gap-2">
        <User className="w-4 h-4 text-primary" />
        {t("profiles.sections.personal")}
      </h3>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <UserAvatar className="size-20 border border-primary/20" fallbackClassName="text-xl" />

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
                disabled={avatarUploading || updateProfile.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                {t("profiles.avatar.upload")}
              </Button>
              {avatarPreview && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/10"
                  disabled={avatarUploading || updateProfile.isPending}
                  onClick={() => void handleRemoveAvatar()}
                >
                  {t("profiles.avatar.remove")}
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => void handleAvatarFileChange(event)}
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

          <div className="space-y-2">
            <Label htmlFor="profile-job-title">{t("profiles.fields.jobTitle")}</Label>
            <Input
              id="profile-job-title"
              className="bg-background/50 border-white/10"
              placeholder={t("profiles.fields.jobTitlePlaceholder")}
              {...form.register("job_title")}
            />
            <p className="text-[11px] text-muted-foreground">{t("profiles.fields.jobTitleHint")}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-department">{t("profiles.fields.department")}</Label>
            <Input
              id="profile-department"
              className="bg-background/50 border-white/10"
              placeholder={t("profiles.fields.departmentPlaceholder")}
              {...form.register("department")}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="profile-phone">{t("profiles.fields.phone")}</Label>
            <Input
              id="profile-phone"
              className="bg-background/50 border-white/10"
              placeholder={t("profiles.fields.phonePlaceholder")}
              {...form.register("phone")}
            />
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

          <div className="md:col-span-2">
            <ProfileCurrencyField />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary"
            disabled={updateProfile.isPending || avatarUploading || !form.formState.isDirty}
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
