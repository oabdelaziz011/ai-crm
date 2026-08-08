import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadProjectEnv } from "./scripts/lib/load-project-env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname);

loadProjectEnv(PROJECT_ROOT, { hydrateProcessEnv: true });

const require = createRequire(import.meta.url);
const pg = require("./node_modules/.pnpm/drizzle-orm@0.45.2_@types+pg@8.20.0_pg@8.22.0/node_modules/pg");

const COMPANY_ID = "d0000010-0001-4001-8001-000000000002";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL missing after loadProjectEnv");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

function printSection(title, rows) {
  console.log(`\n=== ${title} ===`);
  if (!rows?.length) {
    console.log("(none)");
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
}

try {
  await client.connect();
  console.log(`Connected. company_id=${COMPANY_ID} (DEMO Beta)`);

  const { rows: pipelines } = await client.query(
    `select id, name, is_default
     from public.lead_pipelines
     where company_id = $1 and deleted_at is null
     order by is_default desc, name`,
    [COMPANY_ID],
  );
  printSection("lead_pipelines", pipelines);

  const defaultPipeline =
    pipelines.find((p) => p.is_default) ?? pipelines[0] ?? null;

  if (!defaultPipeline) {
    console.log("\n=== lead_stages (default pipeline) ===");
    console.log("(no pipeline - skipping stages)");
  } else {
    const { rows: stages } = await client.query(
      `select id, name, slug, lifecycle_status
       from public.lead_stages
       where company_id = $1
         and pipeline_id = $2
         and deleted_at is null
       order by sort_order, name`,
      [COMPANY_ID, defaultPipeline.id],
    );
    console.log(
      `\n=== lead_stages (default pipeline: ${defaultPipeline.name} / ${defaultPipeline.id}) ===`,
    );
    if (!stages.length) console.log("(none)");
    else console.log(JSON.stringify(stages, null, 2));
  }

  const { rows: sources } = await client.query(
    `select id, name, slug
     from public.lead_sources
     where company_id = $1 and deleted_at is null
     order by name`,
    [COMPANY_ID],
  );
  printSection("lead_sources (before Website ensure)", sources);

  const hasWebsite = sources.some((s) => String(s.name).toLowerCase() === "website");
  if (hasWebsite) {
    console.log("\n=== Website source ===");
    console.log("Already present - no insert.");
  } else {
    const { rows: inserted } = await client.query(
      `insert into public.lead_sources (company_id, name, slug, channel_type, is_active)
       values ($1, 'Website', 'website', 'web', true)
       returning id, name, slug, channel_type, is_active`,
      [COMPANY_ID],
    );
    console.log("\n=== Website source inserted ===");
    console.log(JSON.stringify(inserted, null, 2));
  }

  if (!pipelines.length) {
    console.log("\n=== ensure default pipeline ===");
    const { rows: fnRows } = await client.query(
      `select 1 as ok
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'lead_platform_ensure_default_pipeline'
       limit 1`,
    );
    if (!fnRows.length) {
      console.log("MISSING: public.lead_platform_ensure_default_pipeline does not exist");
    } else {
      const { rows: ensured } = await client.query(
        `select public.lead_platform_ensure_default_pipeline($1::uuid) as pipeline_id`,
        [COMPANY_ID],
      );
      console.log("Called lead_platform_ensure_default_pipeline ->", ensured);

      const { rows: pipelinesAfter } = await client.query(
        `select id, name, is_default
         from public.lead_pipelines
         where company_id = $1 and deleted_at is null
         order by is_default desc, name`,
        [COMPANY_ID],
      );
      printSection("lead_pipelines (after ensure)", pipelinesAfter);

      const dp = pipelinesAfter.find((p) => p.is_default) ?? pipelinesAfter[0];
      if (dp) {
        const { rows: stagesAfter } = await client.query(
          `select id, name, slug, lifecycle_status
           from public.lead_stages
           where company_id = $1 and pipeline_id = $2 and deleted_at is null
           order by sort_order, name`,
          [COMPANY_ID, dp.id],
        );
        printSection(`lead_stages after ensure (${dp.name})`, stagesAfter);
      }
    }
  } else {
    console.log("\n=== ensure default pipeline ===");
    console.log("Skipped - pipeline(s) already exist.");
  }

  const { rows: sourcesFinal } = await client.query(
    `select id, name, slug, channel_type, is_active
     from public.lead_sources
     where company_id = $1 and deleted_at is null
     order by name`,
    [COMPANY_ID],
  );
  printSection("lead_sources (final)", sourcesFinal);

  console.log("\nDone.");
} catch (err) {
  console.error("ERROR:", err.message);
  console.error(err.stack);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}