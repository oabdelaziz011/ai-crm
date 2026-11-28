#!/usr/bin/env python3
import json
import os
import pathlib
import sys

import psycopg2
import psycopg2.extras

mig_dir = pathlib.Path(os.environ["MIG_DIR"])
versions = [
    ("421", "421_sales_follow_up.sql"),
    ("470", "470_company_order_delivery_settings.sql"),
    ("471", "471_sales_orders.sql"),
    ("472", "472_sales_orders_journey_enrichment.sql"),
    ("473", "473_sales_orders_role_permissions_backfill.sql"),
    ("474", "474_update_my_profile_allow_german.sql"),
    ("475", "475_delivery_workers_and_order_enrichment.sql"),
    ("476", "476_delivery_zone_aliases_and_assignment_mode.sql"),
    ("477", "477_delivery_assignment_audit_and_notify.sql"),
    ("478", "478_orders_assign_delivery_role_backfill.sql"),
    ("479", "479_sales_order_customer_cancellation.sql"),
    ("480", "480_cancellation_notification_idempotency.sql"),
]
mode = os.environ.get("MODE", "inspect").strip().lower()
seed = os.environ.get("SEED_WORKER", "false").strip().lower() in ("1", "true", "yes")
seed_follow_up = os.environ.get("SEED_FOLLOW_UP", "false").strip().lower() in ("1", "true", "yes")
worker_name = os.environ.get("WORKER_NAME", "Omar Abdelaziz").strip()
worker_phone = os.environ.get("WORKER_PHONE", "+201011404109").strip()

conn = psycopg2.connect(os.environ["DATABASE_URL"])
conn.autocommit = False
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
cur.execute(
    "select version from supabase_migrations.schema_migrations where version in %s order by version",
    (tuple(v for v, _ in versions),),
)
applied = {r["version"] for r in cur.fetchall()}
cur.execute("select max(version) as max_version from supabase_migrations.schema_migrations")
max_v = cur.fetchone()["max_version"]
print(json.dumps({"phase": "inventory", "max_version": max_v, "sales_versions_applied": sorted(applied)}))

results = []
if mode == "apply":
    for version, filename in versions:
        if version in applied:
            results.append({"version": version, "status": "already_applied"})
            continue
        path = mig_dir / filename
        if not path.is_file():
            print(json.dumps({"version": version, "error": "missing_file", "file": filename}))
            sys.exit(6)
        sql = path.read_text(encoding="utf-8")
        try:
            cur.execute(sql)
            cur.execute(
                "insert into supabase_migrations.schema_migrations (version) values (%s)",
                (version,),
            )
            conn.commit()
            applied.add(version)
            results.append({"version": version, "status": "applied"})
        except Exception as e:
            conn.rollback()
            print(
                json.dumps(
                    {
                        "version": version,
                        "status": "failed",
                        "error": type(e).__name__,
                        "detail": str(e)[:400],
                    }
                )
            )
            sys.exit(7)
    print(json.dumps({"phase": "apply", "results": results}))
else:
    print(json.dumps({"phase": "inspect_only", "pending": [v for v, _ in versions if v not in applied]}))

cur.execute(
    """
    select to_regclass('public.sales_orders') as sales_orders,
           to_regclass('public.company_delivery_workers') as workers,
           to_regclass('public.company_order_settings') as settings,
           to_regclass('public.sales_order_cancellation_requests') as cancel_requests,
           to_regclass('public.sales_follow_up_settings') as follow_up_settings,
           to_regclass('public.sales_follow_up_jobs') as follow_up_jobs
    """
)
regs = dict(cur.fetchone())
print(json.dumps({"phase": "verify_regclass", **{k: (str(v) if v else None) for k, v in regs.items()}}))

if seed and regs.get("workers") and regs.get("settings"):
    cur.execute(
        """
        select p.company_id::text as company_id
        from public.profiles p
        where lower(coalesce(p.email,'')) = lower(%s) and p.company_id is not null
        limit 1
        """,
        ("oabdelaziz011@gmail.com",),
    )
    row = cur.fetchone()
    if not row:
        cur.execute(
            "select id::text as company_id from public.companies order by created_at nulls last, id limit 1"
        )
        row = cur.fetchone()
    if not row:
        print(json.dumps({"phase": "seed_worker", "ok": False, "error": "no_company"}))
    else:
        company_id = row["company_id"]
        cur.execute(
            """
            insert into public.company_order_settings (company_id, ai_order_collection_enabled, require_human_approval)
            values (%s::uuid, true, true)
            on conflict (company_id) do update set ai_order_collection_enabled = true, updated_at = now()
            """,
            (company_id,),
        )
        cur.execute(
            """
            select id::text as id from public.company_delivery_zones
            where company_id = %s::uuid and enabled is distinct from false
            order by created_at nulls last limit 1
            """,
            (company_id,),
        )
        zone = cur.fetchone()
        if not zone:
            cur.execute(
                """
                insert into public.company_delivery_zones (
                  company_id, governorate, zone_name, enabled, delivery_fee, eta_min, eta_max, eta_unit
                ) values (%s::uuid, 'Cairo', 'Nasr City', true, 50, 1, 2, 'days')
                returning id::text as id
                """,
                (company_id,),
            )
            zone = cur.fetchone()
        cur.execute(
            """
            select id::text as id from public.company_delivery_workers
            where company_id = %s::uuid and (phone_e164 = %s or lower(full_name) = lower(%s))
            limit 1
            """,
            (company_id, worker_phone, worker_name),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute(
                """
                update public.company_delivery_workers
                set full_name=%s, phone_e164=%s, is_active=true, updated_at=now()
                where id=%s::uuid returning id::text as id
                """,
                (worker_name, worker_phone, existing["id"]),
            )
            worker = cur.fetchone()
            action = "updated"
        else:
            cur.execute(
                """
                insert into public.company_delivery_workers (company_id, full_name, phone_e164, is_active)
                values (%s::uuid, %s, %s, true) returning id::text as id
                """,
                (company_id, worker_name, worker_phone),
            )
            worker = cur.fetchone()
            action = "created"
        if zone and worker:
            cur.execute(
                "delete from public.company_delivery_worker_zones where worker_id=%s::uuid",
                (worker["id"],),
            )
            cur.execute(
                """
                insert into public.company_delivery_worker_zones (company_id, worker_id, zone_id)
                values (%s::uuid, %s::uuid, %s::uuid) on conflict do nothing
                """,
                (company_id, worker["id"], zone["id"]),
            )
        conn.commit()
        print(
            json.dumps(
                {
                    "phase": "seed_worker",
                    "ok": True,
                    "action": action,
                    "company_id": company_id,
                    "worker_id": worker["id"] if worker else None,
                    "zone_id": zone["id"] if zone else None,
                    "phone_e164": worker_phone,
                }
            )
        )
elif seed:
    print(json.dumps({"phase": "seed_worker", "ok": False, "error": "tables_missing"}))

if seed_follow_up:
    if not regs.get("follow_up_settings"):
        print(json.dumps({"phase": "seed_follow_up", "ok": False, "error": "table_missing"}))
    else:
        cur.execute(
            """
            select p.company_id::text as company_id
            from public.profiles p
            where lower(coalesce(p.email,'')) = lower(%s) and p.company_id is not null
            limit 1
            """,
            ("oabdelaziz011@gmail.com",),
        )
        row = cur.fetchone()
        if not row:
            print(json.dumps({"phase": "seed_follow_up", "ok": False, "error": "no_company"}))
        else:
            company_id = row["company_id"]
            try:
                cur.execute(
                    """
                    insert into public.sales_follow_up_settings (company_id, enabled)
                    values (%s::uuid, true)
                    on conflict (company_id) do update set enabled = true
                    """,
                    (company_id,),
                )
                conn.commit()
                print(json.dumps({"phase": "seed_follow_up", "ok": True, "company_id": company_id, "enabled": True}))
            except Exception as e:
                conn.rollback()
                print(
                    json.dumps(
                        {
                            "phase": "seed_follow_up",
                            "ok": False,
                            "error": type(e).__name__,
                            "detail": str(e)[:300],
                        }
                    )
                )

cur.close()
conn.close()
print("DONE")
