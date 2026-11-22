function envFlagTrue(raw: unknown): boolean {
  const text = String(raw ?? "")
    .trim()
    .toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "on";
}

/** Vite master switch — must match server META_PAGES_OAUTH_ENABLED for UI affordances. */
export function isMetaPagesOauthUiEnabled(): boolean {
  return envFlagTrue(import.meta.env.VITE_META_PAGES_OAUTH_ENABLED);
}
