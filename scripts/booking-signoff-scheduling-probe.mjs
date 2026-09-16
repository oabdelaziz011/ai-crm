/**
 * Read-only scheduling configuration probe for booking sign-off.
 */
import pg from "../lib/db/node_modules/pg/lib/index.js";
import { loadProjectEnv } from "./lib/load-project-env.mjs";
import { resolveProjectRoot } from "./lib/supabase-env.mjs";

const env = loadProjectEnv(resolveProjectRoot(import.meta.url));
const companyId = "2d27f7fb-c15e-4d60-84e9-1793f36f2172";
const serviceId = "efbad361-d193-4ea7-a211-e23113b95f5a";

const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const service = await c.query(
  `select id, name, status, deleted_at, duration_minutes, company_id
   from public.scheduling_services where id = $1`,
  [serviceId],
);

const allServices = await c.query(
  `select id, name, status, deleted_at
   from public.scheduling_services
   where company_id = $1::uuid and deleted_at is null
   order by name`,
  [companyId],
);

const resources = await c.query(
  `select id, name, status, deleted_at, resource_type
   from public.scheduling_resources
   where company_id = $1::uuid and deleted_at is null
   order by name`,
  [companyId],
);

const links = await c.query(
  `select rs.service_id, ss.name as service_name, ss.status as service_status,
          rs.resource_id, sr.name as resource_name, sr.status as resource_status, rs.deleted_at
   from public.resource_services rs
   join public.scheduling_services ss on ss.id = rs.service_id
   join public.scheduling_resources sr on sr.id = rs.resource_id
   where rs.company_id = $1::uuid
   order by ss.name, sr.name`,
  [companyId],
);

const linksForService = links.rows.filter((r) => r.service_id === serviceId);

const rules = await c.query(
  `select id, company_id, min_booking_notice_minutes, max_booking_window_days, timezone, allow_overbooking
   from public.scheduling_booking_rules
   where company_id = $1::uuid
   limit 5`,
  [companyId],
);

const weeklyHours = await c.query(
  `select wh.id, wh.resource_id, sr.name as resource_name, wh.day_of_week, wh.is_closed, wh.opens_at, wh.closes_at
   from public.scheduling_resource_weekly_hours wh
   join public.scheduling_resources sr on sr.id = wh.resource_id
   where wh.company_id = $1::uuid
   order by sr.name, wh.day_of_week`,
  [companyId],
);

console.log(
  JSON.stringify(
    {
      companyId,
      probedServiceId: serviceId,
      service: service.rows[0] ?? null,
      activeServices: allServices.rows,
      activeResources: resources.rows,
      resourceServiceLinks: links.rows,
      linksForProbedService: linksForService,
      bookingRules: rules.rows,
      resourceWeeklyHours: weeklyHours.rows,
      diagnosis: {
        serviceExists: Boolean(service.rows[0]),
        serviceActive: service.rows[0]?.status === "active" && !service.rows[0]?.deleted_at,
        linkedActiveResources: linksForService.filter(
          (r) => r.service_status === "active" && r.resource_status === "active" && !r.deleted_at,
        ),
        totalActiveResources: resources.rows.filter((r) => r.status === "active").length,
      },
    },
    null,
    2,
  ),
);

await c.end();
