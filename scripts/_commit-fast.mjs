import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}
function linesCached() {
  const out = sh("git diff --cached --numstat");
  let n = 0;
  for (const line of out.split("\n")) {
    const m = line.match(/^(\d+)\s+(\d+)/);
    if (m) n += Number(m[1]) + Number(m[2]);
  }
  return n;
}
function commit(msg) {
  const n = linesCached();
  if (!n) {
    console.log("SKIP", msg.split("\n")[0]);
    return;
  }
  console.log(`COMMITTING ${n} lines: ${msg.split("\n")[0]}`);
  if (n > 2000) console.warn(`  WARN over 2000`);
  const p = join(ROOT, ".git", "COMMIT_EDITMSG_BATCH");
  writeFileSync(p, Buffer.from(msg.endsWith("\n") ? msg : msg + "\n"));
  sh(`git commit -F "${p}"`);
}

const steps = [
  [
    `feat(channel-platform): email provider adapters and HTML utils\n\nExtend IMAP/SMTP/Gmail/Microsoft adapters and sanitization helpers.`,
    [
      "lib/channel-platform/src/adapters",
      "lib/channel-platform/src/types.ts",
      "lib/channel-platform/src/index.ts",
      "lib/channel-platform/src/dto",
      "lib/channel-platform/src/test-utils.ts",
    ],
  ],
  [
    `feat(channel-platform): inbound/outbound pipelines and polling worker\n\nUpdate delivery pipelines, session engine, and email polling worker.`,
    [
      "lib/channel-platform/src/engines",
      "lib/channel-platform/src/pipelines",
      "lib/channel-platform/src/ports",
      "lib/channel-platform/src/repositories",
      "lib/channel-platform/src/services",
      "lib/channel-platform/src/webhooks",
      "lib/channel-platform/src/workers",
      "lib/channel-platform/src/create-channel-platform-services.ts",
    ],
  ],
  [
    `feat(handoff): strengthen queue routing and presence\n\nUpdate human-handoff services, repositories, and routing tests.`,
    ["lib/human-handoff-platform"],
  ],
  [
    `feat(ai-conversation): align conversation services and types\n\nKeep conversation repositories and participant services consistent.`,
    ["lib/ai-conversation"],
  ],
  [
    `feat(platforms): sync lead, ticket, and tool-router packages\n\nUpdate CRM agent tool ports and related platform packages.`,
    [
      "lib/lead-platform",
      "lib/ticket-platform",
      "lib/ai-tool-router",
      "lib/ai-intent-engine",
      "lib/ai-prompt-orchestrator",
      "lib/application-layer",
      "lib/automation-platform",
      "lib/runtime-integration",
      "lib/tenant-ai-bootstrap",
    ],
  ],
  [
    `feat(api): email/SMS routes and connection permission gates\n\nAdd mailbox, translate, AI draft, SMS webhook, and settings APIs.`,
    ["artifacts/api-server"],
  ],
  [
    `feat(omnichannel): workspace and agent-desk UX improvements\n\nRefine workspace v2 panels, assignment, and translation helpers.`,
    [
      "artifacts/login-app/src/components/omnichannel",
      "artifacts/login-app/src/lib/omnichannel",
      "artifacts/login-app/src/hooks/omnichannel",
      "artifacts/login-app/src/hooks/conversations",
      "artifacts/login-app/src/lib/conversation-lifecycle",
      "artifacts/login-app/src/lib/human-handoff-platform",
      "artifacts/login-app/src/lib/ai-conversation",
    ],
  ],
  [
    `feat(i18n): remaining permission and settings localization\n\nFinish EN/AR catalog and common string updates for email RBAC.`,
    [
      "artifacts/login-app/src/locales",
      "artifacts/login-app/src/lib/rbac",
    ],
  ],
  [
    `feat(profile): department, theme, and employee password reset\n\nWire department/theme preferences and employee password reset flow.`,
    [
      "artifacts/login-app/src/components/profile",
      "artifacts/login-app/src/components/theme",
      "artifacts/login-app/src/components/users",
      "artifacts/login-app/src/components/roles",
      "artifacts/login-app/src/components/rbac",
      "artifacts/login-app/src/components/company-workspace/employees",
      "artifacts/login-app/src/hooks/use-my-profile.ts",
      "artifacts/login-app/src/hooks/use-rbac.ts",
      "artifacts/login-app/src/hooks/use-users-management.ts",
      "artifacts/login-app/src/hooks/use-company-locale.ts",
      "artifacts/login-app/src/lib/theme",
      "artifacts/login-app/src/lib/company-locale",
      "artifacts/login-app/src/lib/i18n",
      "artifacts/login-app/src/lib/settings",
      "artifacts/login-app/src/pages/users.tsx",
      "artifacts/login-app/src/pages/roles.tsx",
      "supabase/functions/provision-user",
      "supabase/functions/reset-employee-password",
      "scripts/reset-employee-password-e2e.mts",
      "scripts/reset-employee-password-validation.test.mts",
    ],
  ],
  [
    `feat(campaigns): email and SMS campaign UI execution\n\nExtend campaign wizard/detail flows for email and SMS channels.`,
    [
      "artifacts/login-app/src/lib/campaigns",
      "artifacts/login-app/src/pages/dashboard/campaigns",
      "artifacts/login-app/src/components/campaigns",
    ],
  ],
  [
    `feat(billing): dual-currency helpers and subscription UI\n\nSurface dual-currency payable amounts across billing pages.`,
    [
      "artifacts/login-app/src/lib/billing",
      "artifacts/login-app/src/pages/dashboard/billing",
      "artifacts/login-app/src/pages/dashboard/workspace/billing",
      "artifacts/login-app/src/hooks/companies",
      "artifacts/login-app/src/components/company-workspace/tabs/company-subscription-tab.tsx",
      "artifacts/login-app/src/components/profile/profile-currency-field.tsx",
    ],
  ],
  [
    `feat(tickets): Ticket360 and customer workspace email/SMS tabs\n\nRefresh ticket panels and customer workspace communication tabs.`,
    [
      "artifacts/login-app/src/components/tickets",
      "artifacts/login-app/src/hooks/tickets",
      "artifacts/login-app/src/pages/dashboard/tickets-page.tsx",
      "artifacts/login-app/src/components/customer-workspace",
      "artifacts/login-app/src/components/customer-profile",
      "artifacts/login-app/src/lib/customer-workspace",
      "artifacts/login-app/src/lib/customer-profile",
      "artifacts/login-app/src/lib/customer-timeline",
      "artifacts/login-app/src/hooks/customer-workspace",
      "artifacts/login-app/src/hooks/use-customer.ts",
      "artifacts/login-app/src/hooks/use-customers.ts",
      "artifacts/login-app/src/pages/dashboard/customers",
      "artifacts/login-app/src/components/universal-operations",
    ],
  ],
  [
    `chore: remaining login-app shell and shared wiring\n\nCatch remaining durable login-app and root package updates.`,
    [
      "artifacts/login-app",
      "pnpm-lock.yaml",
      "supabase/config.toml",
      "scripts/legacy-failed-outbound-reconcile.test.mjs",
      "scripts/lib/legacy-failed-outbound-reconcile.mjs",
      "scripts/reconcile-legacy-failed-outbound-messages.mjs",
      "scripts/booking-blocker-cancel-bk.mjs",
      "scripts/booking-blocker-fix.mjs",
      "scripts/booking-blocker-live-e2e.mjs",
      "scripts/booking-forensic-welcome-pre.mjs",
      "scripts/booking-forensic-welcome-ref.mjs",
      "scripts/booking-forensic-welcome-window.mjs",
      "scripts/booking-phase-wa-verify.mjs",
      "scripts/booking-signoff-channel-probe.mjs",
      "scripts/booking-signoff-customer-probe.mjs",
      "scripts/booking-signoff-forensic-query.mjs",
      "scripts/booking-signoff-forensic.mjs",
      "scripts/booking-signoff-prod-webhook-probe.mjs",
      "scripts/booking-signoff-scheduling-probe.mjs",
      "scripts/booking-signoff-wa-cancel.mjs",
      "scripts/booking-signoff-wa-create-cancel.mjs",
      "scripts/booking-signoff-wa-focused.mjs",
      "scripts/booking-signoff-wa-live.mjs",
      "scripts/booking-signoff-wa-phone-finish.mjs",
      "scripts/booking-signoff-wa-slot-exact.mjs",
      "scripts/booking-signoff-wa-turn1-2.mjs",
      "scripts/booking-signoff-wa-url-fallback.mjs",
      "scripts/booking-verify-cancel-forensic.mjs",
      "scripts/booking-verify-continue.mjs",
      "scripts/booking-verify-live.mjs",
      "scripts/booking-verify-preflight.mjs",
      "scripts/booking-verify-ref-slot.mjs",
      "scripts/booking-verify-ref-slot2.mjs",
      "scripts/booking-verify-welcome-ref-live.mjs",
    ],
  ],
];

for (const [msg, paths] of steps) {
  try {
    sh("git reset HEAD -- .");
  } catch {}
  for (const p of paths) {
    try {
      sh(`git add -A -- "${p}"`);
    } catch {}
  }
  // drop tmp if accidentally staged
  try {
    const staged = sh("git diff --cached --name-only");
    for (const f of staged.split("\n")) {
      if (/_tmp|verification-screenshots|\.log$/i.test(f)) {
        try {
          sh(`git reset HEAD -- "${f}"`);
        } catch {}
      }
    }
  } catch {}
  commit(msg);
}

console.log("DONE");
console.log(sh("git log --oneline caac257..HEAD"));
