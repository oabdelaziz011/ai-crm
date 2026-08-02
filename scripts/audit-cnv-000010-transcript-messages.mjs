/**
 * Transcript messages audit for CNV-000010 - database vs query path.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "../artifacts/login-app/node_modules/@supabase/supabase-js/dist/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONV_ID = "a35d7fff-cac7-47f3-9604-df683e726b71";

const env = {};
for (const p of [resolve(root, ".env"), resolve(root, "artifacts/login-app/.env.local")]) {
  try {
    const lines = readFileSync(p, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { count: totalCount } = await sb
  .from("conversation_messages")
  .select("id", { count: "exact", head: true })
  .eq("conversation_id", CONV_ID);

const { data: newest10 } = await sb
  .from("conversation_messages")
  .select("id, created_at, message_type, content, sequence_number, status")
  .eq("conversation_id", CONV_ID)
  .order("created_at", { ascending: false })
  .limit(10);

const { data: appQuerySimulation } = await sb
  .from("conversation_messages")
  .select("id, created_at, message_type, content, sequence_number")
  .eq("conversation_id", CONV_ID)
  .order("sequence_number", { ascending: false })
  .order("created_at", { ascending: false })
  .limit(200);

const appQueryChronological = [...(appQuerySimulation ?? [])].reverse();
const dbNewest = newest10?.[0] ?? null;
const appNewest = appQueryChronological?.[appQueryChronological.length - 1] ?? null;
const appIncludesDbNewest = Boolean(
  dbNewest && appQueryChronological?.some((row) => row.id === dbNewest.id),
);

console.log(
  JSON.stringify(
    {
      conversationId: CONV_ID,
      totalMessageCount: totalCount,
      database: {
        newest10: (newest10 ?? []).map((row) => ({
          id: row.id,
          created_at: row.created_at,
          direction: row.message_type,
          content: row.content?.slice(0, 80),
          sequence_number: row.sequence_number,
        })),
        newestMessageId: dbNewest?.id ?? null,
        newestCreatedAt: dbNewest?.created_at ?? null,
      },
  simulatedAppListMessagesQuery: {
    sqlWhere: `conversation_id = '${CONV_ID}'`,
    orderBy: "sequence_number DESC, created_at DESC LIMIT 200 → reversed to ASC",
        limit: 200,
        returnedRowCount: appQueryChronological?.length ?? 0,
        newestMessageIdInResult: appNewest?.id ?? null,
        newestCreatedAtInResult: appNewest?.created_at ?? null,
        includesDatabaseNewest: appIncludesDbNewest,
        firstDivergence:
          !appIncludesDbNewest && dbNewest
            ? {
                stage: "Supabase SELECT (listMessages limit 200 ascending)",
                reason:
                  (totalCount ?? 0) > 200
                    ? `limit(200) with ascending order returns oldest 200 rows; database has ${totalCount} rows - newest messages excluded`
                    : "newest message id not present in ascending limit result",
                databaseNewestId: dbNewest.id,
                queryNewestId: appNewest?.id ?? null,
              }
            : null,
      },
    },
    null,
    2,
  ),
);
