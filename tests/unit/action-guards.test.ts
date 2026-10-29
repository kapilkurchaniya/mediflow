import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ROADMAP A1.7 review rule: every exported Server Action is a public HTTP endpoint, so every one must check a
 * permission. This test reads the source of src/app/actions and fails when a NEW action has no guard.
 *
 * - PUBLIC_BY_DESIGN: actions that legitimately run before sign-in, or only server-side.
 * - KNOWN_UNGUARDED: gaps that exist today (all in Lane B files, see MANUAL_TESTING.md section 18).
 *   Fix the action, then DELETE its line here: the last test fails while a listed action is already guarded.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  loginAction: "sign-in",
  registerAction: "creates a new pharmacy",
  logoutAction: "ends the session",
  changePasswordAction: "any signed-in user changes their OWN password (requires sign-in and the current password, no permission)",
  createExternalOrderForTenant: "server-only helper called by /api/v1/orders after API-key auth",
};

const KNOWN_UNGUARDED: Record<string, string> = {
  enrichMedicineDetails: "NO AUTH AT ALL: anyone can call the AI provider through it",
  listApiKeys: "login only",
  createApiKey: "login only: any role can mint API keys",
  revokeApiKey: "login only",
  getBankStatements: "login only",
  getStatementLines: "login only",
  uploadBankStatement: "login only",
  runAutoMatch: "login only",
  manualMatchLine: "login only",
  unmatchLine: "login only",
  getCandidatePayments: "login only",
  getExternalOrders: "login only",
  getOrderById: "login only",
  updateOrderStatus: "login only",
  createExternalOrder: "login only",
  getGstRateDistribution: "login only",
  previewGstRerate: "login only",
  processInventoryImport: "login only",
  getMedicalReps: "login only",
  createMedicalRep: "login only",
  toggleMedicalRepStatus: "login only",
  getCommissionReport: "login only",
  getPromiseOrders: "login only",
  createPromiseOrder: "login only",
  updatePromiseOrderStatus: "login only",
  getSchemes: "login only",
  createScheme: "login only",
  toggleSchemeStatus: "login only",
  deleteScheme: "login only",
  checkItemScheme: "login only",
};

const GUARD = /requirePermission\(|checkPermission\(|protectedAction\(|assertPermission\(|getAuthCtx\(|can\(ctx/;
const dir = path.resolve(__dirname, "../../src/app/actions");

function exportedActions() {
  const out: { file: string; name: string; guarded: boolean }[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const found = [...src.matchAll(/^export (?:async function|const) ([A-Za-z0-9_]+)/gm)];
    found.forEach((m, i) => {
      const end = i + 1 < found.length ? found[i + 1].index! : src.length;
      out.push({ file, name: m[1], guarded: GUARD.test(src.slice(m.index!, end)) });
    });
  }
  return out;
}

describe("every Server Action checks a permission", () => {
  const actions = exportedActions();

  it("finds the actions (sanity)", () => {
    expect(actions.length).toBeGreaterThan(100);
    expect(actions.find((a) => a.name === "createSaleInvoice")).toMatchObject({ guarded: true });
  });

  it("a new action without a permission check fails here", () => {
    const missing = actions
      .filter((a) => !a.guarded && !(a.name in PUBLIC_BY_DESIGN) && !(a.name in KNOWN_UNGUARDED))
      .map((a) => `${a.file}: ${a.name}`);
    expect(missing, "add requirePermission/protectedAction (or, if truly public, list it in PUBLIC_BY_DESIGN)").toEqual([]);
  });

  it("KNOWN_UNGUARDED lists only actions that are still unguarded (delete the line once you fix one)", () => {
    const fixed = actions.filter((a) => a.guarded && a.name in KNOWN_UNGUARDED).map((a) => a.name);
    expect(fixed, "these are guarded now: remove them from KNOWN_UNGUARDED").toEqual([]);
    const gone = Object.keys({ ...KNOWN_UNGUARDED, ...PUBLIC_BY_DESIGN }).filter((n) => !actions.some((a) => a.name === n));
    expect(gone, "these no longer exist: remove them from the lists").toEqual([]);
  });
});
