/**
 * Commit remaining durable application changes in sized batches.
 * Excludes _tmp / verification artifacts.
 */
import { execSync } from "node:child_process";
import { existsSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MAX = 2000;

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function resetStage() {
  try {
    sh("git reset HEAD -- .");
  } catch {}
}

function stagedLines() {
  try {
    const out = sh("git diff --cached --numstat");
    let n = 0;
    for (const line of out.split("\n")) {
      const m = line.match(/^(\d+)\s+(\d+)/);
      if (m) n += Number(m[1]) + Number(m[2]);
    }
    return n;
  } catch {
    return 0;
  }
}

function addPaths(paths) {
  for (const p of paths) {
    try {
      sh(`git add -A -- "${p}"`);
    } catch (e) {
      // ignore missing
    }
  }
}

function commit(msg) {
  const lines = stagedLines();
  if (lines === 0) {
    console.log(`SKIP empty: ${msg.split("\n")[0]}`);
    resetStage();
    return false;
  }
  if (lines > MAX) {
    console.warn(`WARN ${lines}>${MAX}: ${msg.split("\n")[0]}`);
  }
  const msgPath = join(ROOT, ".git", "COMMIT_EDITMSG_BATCH");
  // Avoid UTF-8 BOM from some writers
  writeFileSync(msgPath, Buffer.from((msg.endsWith("\n") ? msg : msg + "\n"), "utf8"));
  sh(`git commit -F "${msgPath}"`);
  console.log(`OK (${lines}): ${msg.split("\n")[0]}`);
  return true;
}

function statusPaths() {
  // Tracked changes only first (fast). Untracked added via explicit include walks.
  const out = sh("git status --porcelain --untracked-files=no");
  const paths = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    let p = line.slice(3);
    if (p.includes(" -> ")) p = p.split(" -> ").pop();
    p = p.replace(/^"|"$/g, "").replace(/\\/g, "/");
    paths.push(p);
  }
  // Untracked durable files under known roots
  const roots = [
    "artifacts/api-server/src",
    "artifacts/login-app/src",
    "lib",
    "scripts",
    "supabase/functions",
    "supabase/migrations",
  ];
  for (const root of roots) {
    try {
      const u = sh(`git ls-files --others --exclude-standard -- "${root}"`);
      for (const p of u.split("\n")) {
        const norm = p.trim().replace(/\\/g, "/");
        if (norm && !isTmp(norm)) paths.push(norm);
      }
    } catch {}
  }
  return [...new Set(paths)];
}

function isTmp(p) {
  return (
    /_tmp/i.test(p) ||
    /verification-screenshots/i.test(p) ||
    /\.log$/i.test(p) ||
    /\.out\.json$/i.test(p) ||
    /\.jsonl$/i.test(p) ||
    /(^|\/)=$/.test(p) ||
    p === "scripts/_commit-batches.mjs" ||
    p === "scripts/_commit-batches-app.mjs"
  );
}

function matchAny(p, globs) {
  return globs.some((g) => {
    const norm = g.replace(/\\/g, "/");
    if (norm.endsWith("/**")) return p.startsWith(norm.slice(0, -3));
    if (norm.endsWith("/")) return p === norm.slice(0, -1) || p.startsWith(norm);
    if (norm.includes("*")) {
      const re = new RegExp(
        "^" + norm.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$",
      );
      return re.test(p);
    }
    return p === norm || p.startsWith(norm + "/");
  });
}

const batches = [
  {
    msg: "feat(channel-platform): expand email IMAP/SMTP providers and polling\n\nHarden email adapters, inbound/outbound pipelines, and polling worker.",
    include: ["lib/channel-platform/"],
  },
  {
    msg: "feat(handoff): strengthen queue routing and presence engines\n\nUpdate human-handoff command/query services and routing tests.",
    include: ["lib/human-handoff-platform/"],
  },
  {
    msg: "feat(ai-conversation): tighten conversation and participant services\n\nAlign conversation package types, repositories, and state services.",
    include: ["lib/ai-conversation/"],
  },
  {
    msg: "feat(platforms): update lead, ticket, and tool-router adapters\n\nKeep CRM agent tool ports and command services in sync.",
    include: [
      "lib/lead-platform/",
      "lib/ticket-platform/",
      "lib/ai-tool-router/",
      "lib/ai-intent-engine/",
      "lib/ai-prompt-orchestrator/",
      "lib/application-layer/",
      "lib/automation-platform/",
      "lib/runtime-integration/",
      "lib/tenant-ai-bootstrap/",
    ],
  },
  {
    msg: "feat(api): email connection, SMS webhooks, and workspace routes\n\nAdd email/SMS API surfaces and permission-aware connection gates.",
    include: ["artifacts/api-server/"],
  },
  {
    msg: "feat(email): personal and company identity settings UI\n\nSplit Email Identity into personal/company sections with effective signatures.",
    include: [
      "artifacts/login-app/src/components/email/",
      "artifacts/login-app/src/hooks/email/",
      "artifacts/login-app/src/lib/email-workspace/",
      "artifacts/login-app/src/lib/email-templates/",
      "artifacts/login-app/src/lib/email-routing/",
      "artifacts/login-app/src/pages/dashboard/email/",
      "artifacts/login-app/src/pages/dashboard/settings/email-settings-page.tsx",
      "artifacts/login-app/src/config/email-route-registry.ts",
      "artifacts/login-app/src/hooks/notifications/use-email-health.ts",
      "artifacts/login-app/src/lib/notifications/providers/email/",
      "artifacts/login-app/src/lib/company-workspace/brand-center/",
      "artifacts/login-app/src/lib/company-workspace/services/company-brand-center-service.ts",
      "artifacts/login-app/src/hooks/company-workspace/use-company-brand-center.ts",
      "artifacts/login-app/src/components/company-workspace/brand-center/",
    ],
  },
  {
    msg: "feat(omnichannel): workspace layout, translation, and assignment UX\n\nImprove agent desk/workspace v2 panels and conversation tooling.",
    include: [
      "artifacts/login-app/src/components/omnichannel/",
      "artifacts/login-app/src/lib/omnichannel/",
      "artifacts/login-app/src/hooks/omnichannel/",
      "artifacts/login-app/src/hooks/conversations/",
      "artifacts/login-app/src/lib/conversation-lifecycle/",
      "artifacts/login-app/src/lib/human-handoff-platform/",
      "artifacts/login-app/src/lib/ai-conversation/",
    ],
  },
  {
    msg: "feat(i18n): email identity and permission catalog copy\n\nLocalize connection/identity permissions and settings hub strings.",
    include: [
      "artifacts/login-app/src/locales/en/common.json",
      "artifacts/login-app/src/locales/ar/common.json",
      "artifacts/login-app/src/locales/en/permission-catalog.json",
      "artifacts/login-app/src/locales/ar/permission-catalog.json",
      "artifacts/login-app/src/lib/rbac/",
    ],
  },
  {
    msg: "feat(profile): department, theme, and currency preferences\n\nWire department assignment, preferred theme defaults, and profile currency.",
    include: [
      "artifacts/login-app/src/components/profile/",
      "artifacts/login-app/src/components/theme/",
      "artifacts/login-app/src/components/users/",
      "artifacts/login-app/src/components/roles/",
      "artifacts/login-app/src/components/rbac/",
      "artifacts/login-app/src/hooks/use-my-profile.ts",
      "artifacts/login-app/src/hooks/use-rbac.ts",
      "artifacts/login-app/src/hooks/use-users-management.ts",
      "artifacts/login-app/src/hooks/use-company-locale.ts",
      "artifacts/login-app/src/lib/theme/",
      "artifacts/login-app/src/lib/company-locale/",
      "artifacts/login-app/src/lib/i18n/",
      "artifacts/login-app/src/lib/settings/settings-permissions.ts",
      "artifacts/login-app/src/pages/users.tsx",
      "artifacts/login-app/src/pages/roles.tsx",
      "supabase/functions/provision-user/",
      "supabase/functions/reset-employee-password/",
      "scripts/reset-employee-password-e2e.mts",
      "scripts/reset-employee-password-validation.test.mts",
    ],
  },
  {
    msg: "feat(campaigns): email/SMS campaign UI and execution wiring\n\nExtend campaign create/detail flows for email and SMS channels.",
    include: [
      "artifacts/login-app/src/lib/campaigns/",
      "artifacts/login-app/src/pages/dashboard/campaigns/",
    ],
  },
  {
    msg: "feat(billing): dual-currency display and payable helpers\n\nSurface dual-currency amounts in billing and subscription UI.",
    include: [
      "artifacts/login-app/src/lib/billing/",
      "artifacts/login-app/src/pages/dashboard/billing/",
      "artifacts/login-app/src/pages/dashboard/workspace/billing/",
      "artifacts/login-app/src/hooks/companies/use-company-commercial-terms.ts",
      "artifacts/login-app/src/components/company-workspace/tabs/company-subscription-tab.tsx",
      "artifacts/login-app/src/components/profile/profile-currency-field.tsx",
    ],
  },
  {
    msg: "feat(tickets): Ticket360 panels and customer workspace links\n\nRefresh ticket workspace presentation and customer context hooks.",
    include: [
      "artifacts/login-app/src/components/tickets/",
      "artifacts/login-app/src/hooks/tickets/",
      "artifacts/login-app/src/pages/dashboard/tickets-page.tsx",
      "artifacts/login-app/src/components/customer-workspace/",
      "artifacts/login-app/src/components/customer-profile/",
      "artifacts/login-app/src/lib/customer-workspace/",
      "artifacts/login-app/src/lib/customer-profile/",
      "artifacts/login-app/src/lib/customer-timeline/",
      "artifacts/login-app/src/hooks/customer-workspace/",
      "artifacts/login-app/src/hooks/use-customer.ts",
      "artifacts/login-app/src/hooks/use-customers.ts",
      "artifacts/login-app/src/pages/dashboard/customers/",
      "artifacts/login-app/src/components/universal-operations/",
    ],
  },
];

const all = statusPaths().filter((p) => !isTmp(p));
const claimed = new Set();

for (const b of batches) {
  resetStage();
  const files = all.filter((p) => matchAny(p, b.include) && !claimed.has(p));
  if (files.length === 0) {
    console.log(`SKIP none: ${b.msg.split("\n")[0]}`);
    continue;
  }
  addPaths(files);
  // If oversize, commit in chunks of files
  let lines = stagedLines();
  if (lines <= MAX) {
    if (commit(b.msg)) files.forEach((f) => claimed.add(f));
    continue;
  }
  console.log(`Splitting oversized batch (${lines}) for ${b.msg.split("\n")[0]}`);
  resetStage();
  let part = 1;
  let chunk = [];
  for (const f of files) {
    chunk.push(f);
    resetStage();
    addPaths(chunk);
    const n = stagedLines();
    if (n > MAX && chunk.length > 1) {
      // commit previous without last
      const last = chunk.pop();
      resetStage();
      addPaths(chunk);
      commit(`${b.msg.split("\n")[0]} (${part})\n\n${b.msg.split("\n").slice(2).join("\n") || b.msg}`);
      chunk.forEach((x) => claimed.add(x));
      part += 1;
      chunk = [last];
    }
  }
  if (chunk.length) {
    resetStage();
    addPaths(chunk);
    commit(part === 1 ? b.msg : `${b.msg.split("\n")[0]} (${part})\n\n${b.msg.split("\n").slice(2).join("\n") || b.msg}`);
    chunk.forEach((x) => claimed.add(x));
  }
}

// Remaining durable files
resetStage();
const rest = statusPaths().filter((p) => !isTmp(p) && !claimed.has(p));
console.log(`\nRemaining durable files: ${rest.length}`);
if (rest.length) {
  // split remaining into <=MAX chunks
  let part = 1;
  let chunk = [];
  for (const f of rest) {
    chunk.push(f);
    resetStage();
    addPaths(chunk);
    const n = stagedLines();
    if (n > MAX && chunk.length > 1) {
      const last = chunk.pop();
      resetStage();
      addPaths(chunk);
      commit(
        `chore: apply remaining platform wiring (${part})\n\nCatch-up commit for durable files not covered by feature batches.`,
      );
      part += 1;
      chunk = [last];
    }
  }
  if (chunk.length) {
    resetStage();
    addPaths(chunk);
    commit(
      part === 1
        ? `chore: apply remaining platform wiring\n\nCatch-up commit for durable files not covered by feature batches.`
        : `chore: apply remaining platform wiring (${part})\n\nCatch-up commit for durable files not covered by feature batches.`,
    );
  }
}

console.log("\nDone app batches.");
console.log(sh("git log --oneline caac257..HEAD").trim());
console.log("---");
console.log(sh("git status -sb").split("\n").slice(0, 15).join("\n"));
