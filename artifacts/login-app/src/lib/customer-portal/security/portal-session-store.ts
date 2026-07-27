const SESSION_KEY = "valueor_portal_session";

export type StoredPortalSession = {
  token: string;
  customerId: string;
  companyId: string;
  expiresAt: string;
};

export function getPortalSession(): StoredPortalSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredPortalSession;
    if (new Date(session.expiresAt) <= new Date()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function setPortalSession(session: StoredPortalSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearPortalSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash << 5) - hash + token.charCodeAt(i);
    hash |= 0;
  }
  return `h${Math.abs(hash)}`;
}
