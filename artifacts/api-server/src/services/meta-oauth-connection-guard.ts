/**
 * Shared guards so Meta OAuth never silently overwrites an existing channel connection.
 */

export type MetaCredentialSource = "manual" | "oauth";

export type ExistingMetaChannelConnection = {
  hasAccessToken: boolean;
  pageOrAccountId: string | null;
  enabled: boolean;
  credentialSource: MetaCredentialSource;
};

export function readCredentialSource(raw: unknown): MetaCredentialSource {
  return String(raw ?? "").trim().toLowerCase() === "oauth" ? "oauth" : "manual";
}

export function hasExistingMetaConnection(row: ExistingMetaChannelConnection | null | undefined): boolean {
  if (!row) return false;
  if (row.hasAccessToken) return true;
  return Boolean(String(row.pageOrAccountId ?? "").trim());
}

export function assertCanReplaceExistingMetaConnection(input: {
  existing: ExistingMetaChannelConnection | null | undefined;
  confirmReplaceExisting: boolean;
  channel: "messenger" | "instagram";
}): void {
  if (!hasExistingMetaConnection(input.existing)) return;
  if (input.confirmReplaceExisting) return;
  const source = input.existing?.credentialSource ?? "manual";
  const label = input.channel === "messenger" ? "Messenger" : "Instagram";
  throw Object.assign(
    new Error(
      `${label} already has a ${source} connection. Confirm reconnect explicitly before replacing credentials.`,
    ),
    {
      code:
        input.channel === "messenger"
          ? "MSL_BLOCKED_EXISTING_CONNECTION"
          : "IGL_BLOCKED_EXISTING_CONNECTION",
      statusCode: 409,
      status: "blocked_existing_connection" as const,
      credentialSource: source,
    },
  );
}

export function assertCanClearMetaCredentials(input: {
  existing: ExistingMetaChannelConnection | null | undefined;
  confirmClearCredentials: boolean;
  channel: "messenger" | "instagram";
}): { clearSecrets: boolean; softDisableOnly: boolean } {
  if (!hasExistingMetaConnection(input.existing)) {
    return { clearSecrets: true, softDisableOnly: false };
  }
  const source = input.existing?.credentialSource ?? "manual";
  if (source === "manual" && !input.confirmClearCredentials) {
    // Manual connections: disable only — never wipe pasted secrets without explicit confirm.
    return { clearSecrets: false, softDisableOnly: true };
  }
  if (source === "oauth" && !input.confirmClearCredentials) {
    const label = input.channel === "messenger" ? "Messenger" : "Instagram";
    throw Object.assign(
      new Error(
        `${label} OAuth disconnect requires explicit confirmation before clearing stored credentials.`,
      ),
      {
        code:
          input.channel === "messenger"
            ? "MSL_DISCONNECT_CONFIRMATION_REQUIRED"
            : "IGL_DISCONNECT_CONFIRMATION_REQUIRED",
        statusCode: 409,
        status: "disconnect_confirmation_required" as const,
        credentialSource: source,
      },
    );
  }
  return { clearSecrets: true, softDisableOnly: false };
}
