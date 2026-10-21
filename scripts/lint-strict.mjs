#!/usr/bin/env node
/**
 * Blocking ESLint (errors only) for every path that is already clean.
 *
 * This is a ratchet: when you fix the lint errors in an area, ADD ITS PATH to CLEAN_PATHS in the
 * same PR so it can never regress. When the list covers `src`, `tests` and `scripts`, delete this
 * script and make the plain `npm run lint` blocking in CI (Roadmap A0.6).
 *
 * Still failing (Lane B / AI, see ROADMAP A0.6 and B0.5):
 *   src/app/api/chat, src/app/components/AIAssistant.tsx, src/app/dashboard/{customers,orders,compliance},
 *   src/server/domain/{reports,loyalty,whatsapp}.ts
 */
import { spawnSync } from "node:child_process";

const CLEAN_PATHS = [
  "tests",
  "scripts",
  "vitest.config.mts",
  "src/lib",
  "src/proxy.ts",
  "src/env.ts",
  "src/types",
  "src/server/db",
  "src/server/auth.ts",
  "src/server/rbac.ts",
  "src/server/roles.ts",
  "src/server/action.ts",
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/login",
  "src/app/register",
  "src/app/actions",
  "src/app/components/nav",
  "src/app/components/Sidebar.tsx",
  "src/app/components/ShellContext.tsx",
  "src/app/components/CommandPalette.tsx",
  "src/app/dashboard/layout.tsx",
  "src/app/dashboard/DashboardShell.tsx",
  "src/app/forbidden.tsx",
  "src/app/dashboard/sales",
  "src/app/dashboard/inventory",
  "src/app/dashboard/accounting",
  "src/app/dashboard/settings",
  "src/app/dashboard/purchases",
  "src/app/dashboard/suppliers",
  "src/app/dashboard/gst",
  "src/app/dashboard/reports",
  "src/app/dashboard/reminders",
  "src/app/dashboard/whatsapp",
];

const r = spawnSync("npx", ["eslint", "--quiet", ...CLEAN_PATHS], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);
