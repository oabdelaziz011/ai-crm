import { textDirection, type AppLanguage } from "./catalog";

export const LANGUAGE_STORAGE_KEY = "valueor.mobile.language";
export const DIRECTION_RELOAD_KEY = "valueor.mobile.direction-reload";

export type LayoutDirection = "rtl" | "ltr";

/** Sign-out removes the tenant session only. Language and theme stay on the device. */
export function storageKeysRemovedOnSignOut(): readonly string[] {
  return ["valueor.mobile.instance"];
}

/**
 * React Native applies I18nManager.forceRTL on the next reload.
 * A same-direction language change does not reload.
 */
export function planNativeDirection(input: { isRTL: boolean; language: AppLanguage }): {
  allowRTL: true;
  forceRTL: boolean | null;
  reload: boolean;
} {
  const rtl = textDirection(input.language) === "rtl";
  if (input.isRTL === rtl) return { allowRTL: true, forceRTL: null, reload: false };
  return { allowRTL: true, forceRTL: rtl, reload: true };
}

export function readPendingDirection(value: string | null): LayoutDirection | null {
  return value === "rtl" || value === "ltr" ? value : null;
}

/**
 * A native direction change reloads once. The pending marker stops the next
 * launch from reloading again when the native flag has not caught up.
 * English and German never reload while the native layout is already LTR.
 */
export function languageChangePlan(input: {
  current: AppLanguage | null;
  next: AppLanguage;
  isRTL: boolean;
  pendingReload: LayoutDirection | null;
  persisted: boolean;
}): {
  reload: boolean;
  forceRTL: boolean | null;
  direction: LayoutDirection;
  persistPending: LayoutDirection | null;
  clearPending: boolean;
} {
  const direction = textDirection(input.next);
  if (!input.persisted || input.current === input.next) {
    return { reload: false, forceRTL: null, direction, persistPending: null, clearPending: false };
  }
  const plan = planNativeDirection({ isRTL: input.isRTL, language: input.next });
  if (!plan.reload || plan.forceRTL == null) {
    return { reload: false, forceRTL: null, direction, persistPending: null, clearPending: input.pendingReload != null };
  }
  if (input.pendingReload === direction) {
    return { reload: false, forceRTL: null, direction, persistPending: null, clearPending: false };
  }
  return { reload: true, forceRTL: plan.forceRTL, direction, persistPending: direction, clearPending: false };
}
