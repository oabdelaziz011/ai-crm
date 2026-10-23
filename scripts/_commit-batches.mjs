/**
 * Staged commit batches for durable (non-_tmp) work.
 * Run from repo root with: node scripts/_commit-batches.mjs
 * Does NOT use git add -A; only explicit paths.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MAX = 2000;

function sh(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...opts,
  });
}

function existing(paths) {
  return paths.filter((p) => {
    try {
      const st = sh(`git status --short -- "${p}"`).trim();
      return Boolean(st) || existsSync(p);
    } catch {
      return existsSync(p);
    }
  });
}

function stagedDiffLines() {
  try {
    const out = sh("git diff --cached --numstat");
    let n = 0;
    for (const line of out.split("\n")) {
      const m = line.match(/^(\d+)\s+(\d+)/);
      if (m) n += Number(m[1]) + Number(m[2]);
      else if (/^-\s+-/.test(line)) n += 50; // binary-ish
    }
    return n;
  } catch {
    return 0;
  }
}

function commitBatch(message, paths) {
  const files = existing(paths);
  if (files.length === 0) {
    console.log(`SKIP (no files): ${message.split("\n")[0]}`);
    return false;
  }
  // unstage all first for isolation
  try {
    sh("git reset HEAD -- .");
  } catch {
    /* nothing staged */
  }
  for (const f of files) {
    try {
      sh(`git add -A -- "${f}"`);
    } catch (e) {
      console.warn(`warn add ${f}: ${e.message}`);
    }
  }
  const lines = stagedDiffLines();
  if (lines === 0) {
    console.log(`SKIP (empty stage): ${message.split("\n")[0]}`);
    try {
      sh("git reset HEAD -- .");
    } catch {}
    return false;
  }
  if (lines > MAX) {
    console.warn(
      `WARN ${lines} lines > ${MAX} for: ${message.split("\n")[0]} — committing anyway (tightly coupled)`,
    );
  }
  // Write message to temp file for reliable multiline on Windows
  const msgPath = join(ROOT, ".git", "COMMIT_EDITMSG_BATCH");
  writeFileSync(msgPath, message.endsWith("\n") ? message : message + "\n");
  sh(`git commit -F "${msgPath}"`);
  console.log(`OK (${lines} lines): ${message.split("\n")[0]}`);
  return true;
}

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".git") continue;
      walk(p, pred, acc);
    } else if (pred(p.replace(/\\/g, "/"))) {
      acc.push(p.replace(/\\/g, "/"));
    }
  }
  return acc;
}

function isTmp(p) {
  return (
    /_tmp/i.test(p) ||
    /verification-screenshots/i.test(p) ||
    /\.log$/i.test(p) ||
    /\.out\.json$/i.test(p) ||
    /\.jsonl$/i.test(p) ||
    p === "=" ||
    p.endsWith("/=")
  );
}

// ── Batches ───────────────────────────────────────────────────────────────

const batches = [
  {
    msg: `feat(db): renumber WhatsApp secret and idle-timeout migrations

Move 325-328 to 353-356 so later email/RBAC migrations keep a clean sequence.`,
    files: [
      "supabase/migrations/325_whatsapp_unchanged_secret_mask_fix.sql",
      "supabase/migrations/326_whatsapp_decrypt_prefer_encrypted.sql",
      "supabase/migrations/327_session_idle_timeout_messages.sql",
      "supabase/migrations/328_session_idle_timeout_bilingual_messages.sql",
      "supabase/migrations/353_whatsapp_unchanged_secret_mask_fix.sql",
      "supabase/migrations/354_whatsapp_decrypt_prefer_encrypted.sql",
      "supabase/migrations/355_session_idle_timeout_messages.sql",
      "supabase/migrations/356_session_idle_timeout_bilingual_messages.sql",
    ],
  },
  {
    msg: `feat(db): harden conversation message and attachment RBAC

Add conversation messages RLS hardening and attachment storage policies.`,
    files: [
      "supabase/migrations/346_conversation_messages_rbac_hardening.sql",
      "supabase/migrations/347_conversation_attachments_storage_rbac.sql",
    ],
  },
  {
    msg: `feat(db): add consultation price and customer avatar storage

Introduce resource consultation pricing and customer avatar URL storage RLS.`,
    files: [
      "supabase/migrations/348_resource_consultation_price.sql",
      "supabase/migrations/349_customer_avatar_url_storage.sql",
      "supabase/migrations/350_fix_customer_avatars_storage_rls.sql",
    ],
  },
  {
    msg: `feat(db): dual-currency billing architecture

Add migration and apply script for company dual-currency support.`,
    files: [
      "supabase/migrations/351_dual_currency_architecture.sql",
      "scripts/apply-351-dual-currency-architecture.mjs",
    ],
  },
  {
    msg: `feat(db): email mailbox provider architecture

Persist mailbox provider metadata for Gmail/Microsoft/IMAP-SMTP setups.`,
    files: [
      "supabase/migrations/352_email_mailbox_provider_architecture.sql",
      "scripts/apply-352-email-mailbox-provider-architecture.mjs",
    ],
  },
  {
    msg: `feat(db): conversation view-assigned visibility RLS

Restrict conversation and participant reads for assigned-only agents.`,
    files: [
      "supabase/migrations/357_conversation_view_assigned_visibility.sql",
      "supabase/migrations/358_conversation_participants_view_assigned_select.sql",
    ],
  },
  {
    msg: `feat(db): marketing campaign email and SMS channel bindings

Wire campaign channel feature entitlements for email and SMS.`,
    files: [
      "supabase/migrations/359_marketing_campaigns_email_channel.sql",
      "supabase/migrations/360_marketing_campaigns_sms_channel.sql",
      "scripts/apply-359-marketing-campaigns-email-channel.mjs",
      "scripts/apply-360-marketing-campaigns-sms-channel.mjs",
    ],
  },
  {
    msg: `feat(db): email workspace tab RBAC and admin grants

Add email tab permissions, ValueOR admin grants, and apply helpers.`,
    files: [
      "supabase/migrations/361_admin_email_view_workspace_gate.sql",
      "supabase/migrations/363_email_workspace_tab_rbac.sql",
      "supabase/migrations/364_valueor_admin_email_tab_permissions.sql",
      "scripts/apply-363-email-workspace-tab-rbac.mjs",
      "scripts/apply-364-valueor-admin-email-tab-permissions.mjs",
    ],
  },
  {
    msg: `feat(db): split email connection and identity permissions

Add personal/company email identity storage and connection permission gates.`,
    files: [
      "supabase/migrations/365_email_identity_rbac.sql",
      "supabase/migrations/366_email_identity_rbac_no_broad_grants.sql",
      "scripts/apply-365-email-identity-rbac.mjs",
      "scripts/apply-366-email-identity-rbac-no-broad-grants.mjs",
    ],
  },
  {
    msg: `feat(db): theme default, department profile, and SMS settings

Default preferred theme to light, add department_id profile RPCs, and SMS settings.`,
    files: [
      "supabase/migrations/362_profiles_preferred_theme_default_light.sql",
      "supabase/migrations/367_profiles_department_id.sql",
      "supabase/migrations/368_update_my_profile_department_id.sql",
      "supabase/migrations/373_company_sms_settings.sql",
      "supabase/migrations/_pending/242_profiles_department_id.sql",
      "scripts/apply-362-profiles-preferred-theme-default-light.mjs",
      "scripts/apply-367-profiles-department-id.mjs",
      "scripts/apply-368-update-my-profile-department-id.mjs",
    ],
  },
  {
    msg: `feat(db): assignment audit and department conversation visibility

Add assignment audit events and department-scoped conversation RLS packing.`,
    files: [
      "supabase/migrations/369_assignment_audit_events.sql",
      "supabase/migrations/370_conversations_department_id.sql",
      "supabase/migrations/371_conversation_department_visibility_rls.sql",
      "supabase/migrations/372_phase6d_conversation_visibility_permission_packing.sql",
      "scripts/apply-and-verify-369-assignment-audit.mjs",
      "scripts/apply-and-verify-371-conversation-visibility.mjs",
      "scripts/apply-and-verify-372-visibility-permission-packing.mjs",
    ],
  },
];

for (const b of batches) {
  commitBatch(b.msg, b.files);
}

console.log("\nMigration batches done. Remaining durable work still unstaged.");
try {
  console.log(sh("git status -sb").split("\n").slice(0, 8).join("\n"));
} catch {}
