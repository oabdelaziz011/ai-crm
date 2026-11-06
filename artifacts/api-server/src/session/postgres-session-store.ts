import session from "express-session";

const DEFAULT_TABLE = "api_runtime.express_sessions";
const TABLE_NAME = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionQueryClient = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Array<{ sess?: unknown }> }>;
};

type StoreOptions = {
  table?: string;
  pruneIntervalMs?: number;
  onError?: (error: unknown) => void;
};

function assertTableName(table: string): string {
  if (!TABLE_NAME.test(table)) {
    throw new Error("Session table name is not a schema-qualified identifier.");
  }
  return table;
}

function expiryFromSession(sess: session.SessionData): Date {
  const expires = sess.cookie?.expires;
  if (expires instanceof Date && !Number.isNaN(expires.getTime())) return expires;
  if (typeof expires === "string") {
    const parsed = new Date(expires);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const maxAge = sess.cookie?.originalMaxAge;
  const lifetime = typeof maxAge === "number" && maxAge > 0 ? maxAge : DEFAULT_MAX_AGE_MS;
  return new Date(Date.now() + lifetime);
}

/**
 * Shared express-session store. Rows live in a private Postgres schema.
 * The payload is only the existing session fields (the legacy user id).
 * Company access stays on the Supabase JWT and is not written here.
 */
export class PostgresSessionStore extends session.Store {
  private readonly table: string;
  private readonly onError: (error: unknown) => void;
  private timer: ReturnType<typeof setInterval> | null;

  constructor(
    private readonly client: SessionQueryClient,
    options: StoreOptions = {},
  ) {
    super();
    this.table = assertTableName(options.table ?? DEFAULT_TABLE);
    this.onError = options.onError ?? (() => undefined);
    const interval = options.pruneIntervalMs ?? 15 * 60 * 1000;
    this.timer = setInterval(() => {
      void this.prune();
    }, interval);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  override get(
    sid: string,
    callback: (err: unknown, session?: session.SessionData | null) => void,
  ): void {
    this.client
      .query(`select sess from ${this.table} where sid = $1 and expire > now()`, [sid])
      .then((result) => {
        const raw = result.rows[0]?.sess;
        if (raw == null) {
          callback(null, null);
          return;
        }
        const parsed = typeof raw === "string" ? (JSON.parse(raw) as session.SessionData) : (raw as session.SessionData);
        callback(null, parsed);
      })
      .catch((error: unknown) => callback(error));
  }

  override set(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    const expire = expiryFromSession(sess);
    this.client
      .query(
        `insert into ${this.table} (sid, sess, expire)
         values ($1, $2::jsonb, $3)
         on conflict (sid) do update set sess = excluded.sess, expire = excluded.expire`,
        [sid, JSON.stringify(sess), expire.toISOString()],
      )
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override destroy(sid: string, callback?: (err?: unknown) => void): void {
    this.client
      .query(`delete from ${this.table} where sid = $1`, [sid])
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override touch(sid: string, sess: session.SessionData, callback?: (err?: unknown) => void): void {
    this.client
      .query(`update ${this.table} set expire = $2 where sid = $1`, [sid, expiryFromSession(sess).toISOString()])
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  private async prune(): Promise<void> {
    await this.pruneExpired();
  }

  async pruneExpired(): Promise<void> {
    try {
      await this.client.query(`delete from ${this.table} where expire <= now()`);
    } catch (error) {
      this.onError(error);
    }
  }
}
