import pg from "../lib/db/node_modules/pg/lib/index.js";

const c = new pg.Client({
  connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
await c.connect();
await c.query(`select set_config('request.jwt.claim.role','service_role',false)`);
await c.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);

const ids = [
  ["oabdelaziz011@gmail.com", "a9b150d0-cf93-4937-a6f2-1b75213eada8", 93],
  ["nhossam@ntgclarity.com", "8bdbd62a-2cd8-44e7-bd6d-45d089046a4e", 296],
];

for (const [email, id, expected] of ids) {
  const { rows } = await c.query(
    `select count(*)::int as n from role_permissions rp
     join user_roles ur on ur.role_id = rp.role_id
     where ur.user_id = $1`,
    [id],
  );
  console.log({ email, localPerms: rows[0].n, sourceExpected: expected, match: rows[0].n === expected });
}

const companies = await c.query(`select id, name from companies order by name`);
console.log(
  "companies",
  companies.rows.map((r) => r.name),
);
const demo = await c.query(
  `select count(*)::int as n from auth.users where email like '%@vaultos.local'`,
);
console.log("demoAuthUsers", demo.rows[0].n);

// email settings present
const email = await c.query(
  `select count(*)::int as n from company_email_settings
   where company_id in ('2d27f7fb-c15e-4d60-84e9-1793f36f2172','d4fdae9a-bb72-4bae-903c-cb4b971d18a8')`,
);
console.log("company_email_settings", email.rows[0].n);
const flows = await c.query(
  `select count(*)::int as n from automation_flows
   where company_id in ('2d27f7fb-c15e-4d60-84e9-1793f36f2172','d4fdae9a-bb72-4bae-903c-cb4b971d18a8')`,
);
console.log("automation_flows", flows.rows[0].n);
await c.end();
