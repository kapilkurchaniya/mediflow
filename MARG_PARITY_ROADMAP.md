# MediFlow Roadmap, Part 2: Marg parity and beyond (Phases 7–12)

> **Plan date:** 25 Nov 2026 · **Week 1 starts:** Mon 30 Nov 2026 · **Continues:** [`ROADMAP.md`](../ROADMAP.md) (Phases 0–6, all ticked)
> **Built from:** [`docs/MARG_ERP_COMPLETE_GAP_ANALYSIS.md`](MARG_ERP_COMPLETE_GAP_ANALYSIS.md) (gap IDs like `A5`, `G1`, `N8`, quick wins `Q1–Q15`) and [`docs/MARG_KEYBOARD_PARITY.md`](MARG_KEYBOARD_PARITY.md) (bugs `B1–B9`, phases `K0–K4`, advantages `U1–U15`), plus a fresh code read of `origin/main` @ `7486b5e` and new research (see *Sources*).
> **Platform:** Tauri 2 desktop app only. **Windows first.** macOS and Linux are deferred (see *Deferred: macOS and Linux*). No web version for customers. The browser stays a developer tool.
> **Lanes:** unchanged. **Lane A** = overxpowered (`lane-a/*`), **Lane B** = Kapil (`lane-b/*`). Ownership follows `.github/CODEOWNERS` and ADR 0004.

---

## 0. How to use this roadmap

### 0.1 Same rules as Part 1
Everything in `ROADMAP.md` §0 still applies: phases with a Lane A and a Lane B section, task IDs in PR titles, **Why / Files / How / Done when**, the symbols below, and "1 day ≈ 3 focused hours".

New in Part 2:
- **`X` tasks** (e.g. `X7.2`) are shared or non-code work: buying a certificate, choosing a vendor, a CA review, a field trial. The owner is named on each one.
- Each task lists the research IDs it closes, so nothing in the two research files gets lost. The full map is in Appendix A.
- Each phase ends with a **milestone** that someone outside the team can check.

| Symbol | Meaning |
|---|---|
| 🤝 | **Contract.** The other lane depends on this interface. Merge the types and a stub first, then implement |
| 🔀 | Touches a **shared file** (schema index, migrations, permissions, nav, `package.json`, `tauri.conf.json`). Follow docs/07 |
| ⛔ | **Blocking.** Other tasks wait for this one |
| 🧪 | Tests required in the same PR |
| ⏱ | Effort for one part-time developer (1 day ≈ 3 focused hours) |

### 0.2 Why Part 2 exists (what changed since Part 1)
1. **Every Phase 0–6 box is ticked, but several "done" items aren't production-ready.** Unit tests can't see hardware, vendor or packaging gaps. The research found:
   - **B5.1** "Real e-invoicing via a GSP" is ticked, but `einvoice-providers/gsp-provider.ts:56–57` still calls a placeholder host (`gsp.mediflow.in`).
   - **A4.9** "Desktop POS App (Tauri, SQLite & Hardware Print Bridge)" is ticked, but:
     - Windows printing is an `eprintln!` stub (`printer.rs:85–95`);
     - the SQLite adapter (`src/desktop/sqlite-storage.ts`) has no implementation;
     - there is no production desktop build (`frontendDist: ../../out` can't be produced from the `standalone` Next.js app).
   - **`docs/v1-sellable-checklist.md` #2** ("POS survives a 2-hour outage") is marked PASS on unit tests, and credits an "Offline SQLite Engine". Offline storage is actually IndexedDB (`src/offline/db.ts`).
   - **`MANUAL_TESTING.md` §4** is stale (it still says split tender, hold and returns are missing).
   - **The in-app help claims** "MediFlow verifies price stays below DPCO legal ceiling" (`help/catalog.ts`); no such check exists. Since #102 it also says "Alt+N adds a new customer" on the POS screen; nothing handles that key there.
2. **Decisions since Part 1:** desktop-only on Windows (25 Nov 2026); macOS and Linux later.
3. **Fixed since the research:** #102 corrected the help text for F6/F7/F8/F4. Bug B5 in the keyboard doc is therefore partly closed. The DPCO and Alt+N claims remain.
4. **Tax-law updates found while planning:** TCS on sale of goods (s.206C(1H)) was removed from 1 Apr 2025, and the Income-tax Act, 2025 replaced the 1961 Act from 1 Apr 2026 (gap analysis §1.2). G10 is dropped, and G9 is rebuilt on the new Act.

### 0.3 Definition of Done, v2 (on top of Part 1's DoD)
1. **Verified in the Windows desktop build** (staging shell or `tauri dev` on Windows), not only in a browser tab.
2. Anything that **prints, scans or talks to a vendor** is checked on real hardware or in the vendor's sandbox. The PR includes the evidence: a photo of the printed bill, a sandbox IRN, an import log.
3. **Counter rules** (pricing, guards, bans, negative stock) are written once, in a shared module that all three sale paths use: POS cart, offline sale (`src/offline/offline-sale.ts`) and `createSale`. The rule's data is added to the offline pull (`src/server/domain/sync/pull.ts` → `src/offline/db.ts`).
4. **Cost and margin** fields obey `cost.view` (after A7.8).
5. **New shortcuts** are registered in the keymap registry (after A8.1). No new raw `window` keydown listeners.
6. `MANUAL_TESTING.md` (and `USER_MANUAL.md` if the UI changed) is updated in the same PR. Help text claims only what exists.
7. **Tax or statutory logic** (TDS, composition, free-goods GST, ITC reversal) has a CA review noted in the PR (X9.1).
8. Before touching Next.js code, read the guide in `node_modules/next/dist/docs/` (this repo's Next.js version has breaking changes: see `AGENTS.md`).

### 0.4 Timeline and milestones (nominal)

| Phase | Weeks | Dates (nominal) | Theme | Lane A ⏱ | Lane B ⏱ | Milestone at the end |
|---|---|---|---|---|---|---|
| **7** | 1–6 | 30 Nov – 10 Jan | Pilot-safe Windows counter | 25.5 | 21 | **M1** Signed, auto-updating Windows app that prints. Owners can hide cost. No invented MRP. Banned drugs blocked → install at one friendly store (unpaid) |
| **8** | 7–14 | 11 Jan – 7 Mar | Marg-switchable counter | 32.5 | 30 | **M2** An ex-Marg operator bills a 5-item Rx with no mouse in ≤ 25 s. Schemes and party rates work. Real IRN in sandbox → **first paid pilot** |
| **9** | 15–20 | 8 Mar – 18 Apr | The CA signs off | 23 | 21.5 (+3 stretch) | **M3** Vouchers, PDC, Tally import, edit log, composition and TDS reviewed by a practising CA |
| **10** | 21–27 | 19 Apr – 6 Jun | Trust, data and language | 29 | 30 | **M4** Encrypted local data with backups, Hindi bills, WhatsApp with no setup, drug master |
| **11** | 28–34 | 7 Jun – 25 Jul | Better than Marg | 28.5 | 18 | **M5** Discoverable keyboard, PIN switch, labels and pack QR, ABHA billing |
| **12** | 35+ | from Aug 2027 | Segment packs, on demand | — | — | Picked from pilot feedback (wholesale, godowns, LAN relay, …) |

**About these dates:** they assume about 4.5 roadmap days per week per developer, with a holiday dip in late December. Lane A is the heavier lane in every phase, so its total sets the length. Part 1's tracker shows Phases 0–6 (≈163 estimated days) ticked in about 4.5 weeks, much faster than planned. But this roadmap's DoD v2 adds hardware and vendor verification, which is slower. **Re-baseline at the end of Phase 7** using real velocity under DoD v2.

### 0.5 Ownership proposal: balance Phase 7
Phase 7 is mostly desktop work, and desktop work defaults to Lane A. To balance it, this plan gives the **release pipeline** to Lane B: staging channel, Windows CI build, code signing, auto-update (B7.1–B7.4). Kapil already maintains `vercel.json`. The Rust bridge, printing and the shell stay with Lane A.

If you agree, edit `.github/CODEOWNERS` (add `/desktop/src-tauri/` → A; `/.github/workflows/desktop.yml` → B) and ADR 0004 in one PR, as Part 1 requires. If not, move B7.1–B7.4 to Lane A and Phase 7 grows by about 1.5 weeks. *(Decision Q10 in *Open questions*.)*

### 0.6 Environments and release channels (how you test without reinstalling)

| Channel | Used by | The app window loads | How changes arrive |
|---|---|---|---|
| **Dev** | the developer | `http://localhost:3000` in Edge (closest to WebView2), or `tauri dev` on a Windows PC pointing at a dev server on the LAN | Hot reload. Rust changes recompile in seconds |
| **Staging** | both devs, testers, the friendly store | the staging URL (a stable Vercel branch domain, or the AWS staging env: see Q1) | **Page reload** for UI and server changes. A "MediFlow (Staging)" app is installed once; Rust changes come through the staging updater channel |
| **Stable** | paying stores | the production URL | Updater stable channel, rolled out store by store, never mid-bill |

Only changes under `desktop/src-tauri/` need a new installer. Everything else ships by deploying the server.

### 0.7 Critical path and dependencies

```
Phase 7   A7.1 dev loop ─► A7.3 prod shell ─► B7.1 staging ─► B7.2 CI build ─► B7.3 signing ─► B7.4 updater ─► M1
          A7.2 ADR 0005 (+Q1 hosting) ─┘                       X7.2 certificate ──┘
          A7.5 winspool ─► A7.6 print UX ─► A7.7 A5/58mm ───────────────────────────────────────────────► M1
          A7.8 cost.view (🤝) ─► B7.5 · A8.2 (Alt+F10) · B9.5 (GP reports)
          B7.9 ban registry (🤝) ─► A7.10 POS/offline enforcement
          B7.11 GSP vendor ─► B8.8 real IRN ─► B8.9 GSTIN · B8.10 IRN deadline · B9.4 IMS/2B
Phase 8   A8.1 keymap (🤝) ─► A8.2 POS parity · B8.1 help keys · A9.2 voucher keys · A10.6 / B10.1 · A11.3–A11.5
          B8.2 sale schemes (🤝) ─► A8.3 price resolver (🤝) ─► A8.4 free qty · B8.3 pricing masters
          A8.5 negative stock ◄─ B8.4 GRN hook (🤝)
Phase 9   A9.1 journal core (🤝) ─► A9.2 vouchers · A9.3 PDC · A9.6 ITC reversal · B9.1 GST notes
          createSale tax step (A) ◄─ B9.2 composition (🤝)
Phase 10  A10.1 SQLite ─► A10.2 encryption · A10.3 backups · Phase 12 LAN relay
          A10.7 open-WhatsApp command (🤝) ─► B10.2
Phase 11  X7.4 ABDM sandbox (started in Phase 7) ─► B11.2 ABHA billing
```

---

## Phase 7 · Pilot-safe Windows counter (Weeks 1–6)

**Goal:** a signed, auto-updating Windows app that prints. Owners can hide cost from staff, imports never invent prices, banned drugs can't be sold, and every claim in our docs and help is true.

**Exit criteria (M1):**
- Install the signed installer on a clean Windows 10 and a clean Windows 11 PC.
- Print 100 bills (thermal and A5) with no fake "success".
- Push one update through the staging channel.
- A Cashier role can't see purchase rate anywhere.
- A banned FDC is blocked at POS and GRN, online and offline.
- The truth reset (X7.6) is done.

### 7.1 Desktop delivery: dev loop → staging → signed, auto-updating installer

#### A7.1 ⛔ Desktop dev loop ⏱ 1 day
- **Why:** rebuilding and reinstalling for every change is too slow. The desktop app is a window around the web UI, so it can load a live dev server. *(N8; your 25 Nov question)*
- **Files:** ✏️ `desktop/package.json` (add `@tauri-apps/cli` v2; today the `tauri` script points at a CLI that isn't installed) · ✏️ `desktop/src-tauri/tauri.conf.json` (`build.beforeDevCommand`) · ✏️ `docs/08-local-setup.md` (new "Desktop development" section)
- **How:**
  1. Install the CLI. Make `beforeDevCommand` start the root `npm run dev`, or document running it separately.
  2. Support a LAN dev server: `next dev -H 0.0.0.0` on the Linux box, plus `tauri dev --config '{"build":{"devUrl":"http://<lan-ip>:3000/dashboard/sales/pos"}}'` on the Windows PC. Next.js may block dev requests from another origin; find the dev-origin allow-list setting in `node_modules/next/dist/docs/` and add the LAN host.
  3. Document "Edge for everyday UI work, `tauri dev` on Windows for desktop work".
- **Done when:** on a Windows PC, saving a `.tsx` file on the Linux box updates the Tauri window within about 2 s, and a Rust edit rebuilds without reinstalling.

#### A7.2 ⛔ ADR 0005: desktop delivery architecture (and hosting) ⏱ 1 day (both review)
- **Why:** the production app has no defined way to reach its UI and server code (N8). The choice also decides the staging URL, so hosting question **Q1** (Vercel in `vercel.json` vs AWS ECS in `.github/workflows/deploy.yml`) must be settled now.
- **Files:** ➕ `docs/adr/0005-desktop-delivery.md` · ✏️ `docs/10-offline-pos-design.md` (mark the PWA sections superseded; full rewrite in X7.6)
- **How:** record the decision from gap analysis §5-N:
  - **(a) thin shell → hosted URL** for the pilot;
  - **(c) bundled POS + cloud API** as the target for offline-critical screens;
  - **(b) local Next.js sidecar is rejected**, because every counter would hold database credentials.

  Name the production and staging origins. State the offline cold-start rule: WebView2 is Chromium, so the service worker in `public/sw.js` *should* work on Windows. A7.3 tests it; if it fails, bring A10.x / bundled POS forward.
- **Done when:** ADR merged, Q1 answered in `ROADMAP.md` open questions, origins known.

#### A7.3 ⛔ 🔀 Production shell, permissions and offline cold start ⏱ 3 days
- **Why:** turn the dev-only shell into a shippable one that loads only our servers and exposes the Rust bridge only to them. *(N8, N11 part)*
- **Files:** ✏️ `desktop/src-tauri/tauri.conf.json` (window URL / `frontendDist` → production origin; drop `../../out`; `bundle.targets: ["nsis"]`; `bundle.windows.webviewInstallMode: { "type": "embedBootstrapper" }`) · ➕ `desktop/src-tauri/capabilities/default.json` · ✏️ `desktop/src-tauri/src/lib.rs`
- **How:**
  1. Point the main window at the production URL. Check the Tauri 2 config reference for whether that's `windows[].url` or a URL `frontendDist`.
  2. Add a capability whose `remote.urls` lists **only** the production and staging origins (Tauri 2 gives remote pages no IPC unless a capability lists them). Grant our printer and scanner commands plus the few plugins we use, nothing broad.
  3. Keep DevTools out of release builds.
  4. **Offline cold-start spike (½ day):** install, load the POS once online, then disconnect the network, reboot the PC and open the app. Record whether `public/sw.js` serves the POS shell from WebView2's cache. Write the result into ADR 0005.
- **Done when:** a release build opens the production POS; a page from any other origin can't call `invoke`; the cold-start result is recorded.
- **Tests:** DSK-1 (install, first run), DSK-2 (offline cold start) in `MANUAL_TESTING.md`.

#### A7.4 🧪 Shell hardening: one instance, no lost bills, no stray browser keys ⏱ 2.5 days
- **Why:**
  - two copies of the POS on one PC would double-sync and fight over bill numbers (Q15);
  - Alt+F4 or the X button can lose an open bill;
  - WebView2's own accelerators (F5/Ctrl+R reload, Ctrl+F find, Ctrl+P print, zoom) break the counter and steal Marg keys.

  *(Keyboard doc §4.2 items 1–2, U6; Q15)*
- **Files:** ✏️ `desktop/src-tauri/Cargo.toml` (`tauri-plugin-single-instance`, `tauri-plugin-window-state`, `webview2-com` for Windows) · ✏️ `desktop/src-tauri/src/lib.rs` · ✏️ `src/desktop/hardware-bridge.ts` (new `setUnsavedState` command) · ✏️ POS cart and form-draft hooks (`src/lib/useFormDraft.ts`, `src/lib/pos-cart-persistence.ts`) to report dirty state
- **How:**
  1. Register single-instance first; a second launch focuses the running window.
  2. In Rust, handle `WindowEvent::CloseRequested`: if the page reported unsaved work, `prevent_close()` and ask "Bill has N lines: park it and close?".
  3. In `with_webview`, get the WebView2 settings and set `AreBrowserAcceleratorKeysEnabled = false`.
  4. Remember window size and position.
- **Done when:** KB-7 (close/reload guard) passes on Windows. F5, Ctrl+R and Ctrl+F do nothing at the counter. A second launch focuses the first window.

#### B7.1 Staging channel ⏱ 1.5 days *(proposed Lane B, see §0.5)*
- **Why:** testers install once and get every merged change by reloading. *(§0.6)*
- **Files:** ✏️ `vercel.json` (`git.deploymentEnabled`: allow a `staging` branch; today `"*": false`) or the AWS equivalent per Q1 · ➕ `desktop/src-tauri/tauri.staging.conf.json` (productName "MediFlow (Staging)", identifier `com.mediflow.pos.desktop.staging` so it installs next to stable, staging URL) · ✏️ `docs/08-local-setup.md`
- **How:**
  1. Give the staging deploy a stable domain, plus its own database and secrets (never production data).
  2. Build with `tauri build --config tauri.staging.conf.json`.
  3. Add a visible "STAGING" ribbon, the way B0.3 marks the e-invoice simulator.
- **Done when:** a change merged to `staging` shows up in the installed staging app after a reload.

#### B7.2 🔀 Windows desktop CI build ⏱ 2 days *(proposed Lane B)*
- **Why:** installers must come from CI, never from a laptop. *(N9)*
- **Files:** ➕ `.github/workflows/desktop.yml` (`windows-latest`, Rust cache, `tauri-apps/tauri-action`) · ✏️ `docs/07-git-workflow.md`
- **How:**
  1. On PRs that touch `desktop/`, build an **unsigned** NSIS artifact (internal only).
  2. On tags, build **signed** stable and staging installers (after B7.3).
  3. Run `cargo test` and `cargo clippy` for `desktop/src-tauri`.
  4. Optional: a smoke step that launches the app with `tauri-driver` and checks the window opens (WebdriverIO supports Tauri on Windows).
- **Done when:** every desktop PR has a downloadable installer, and tags produce release artifacts.

#### B7.3 Code signing ⏱ 1.5 days + procurement (X7.2) *(proposed Lane B)*
- **Why:** unsigned installers trigger SmartScreen and scare shop owners. Microsoft's docs say EV certificates no longer skip SmartScreen: both OV and EV signed files must **build reputation**. Since June 2023, the signing key must live on a hardware token or cloud HSM. Microsoft's own cloud signing service (Artifact Signing) is open only to organisations in the US, Canada, EU and UK, so **an Indian company needs a CA-issued OV certificate with cloud signing** (e.g. SSL.com eSigner, DigiCert KeyLocker). *(N9; see *Sources*)*
- **Files:** ✏️ `tauri.conf.json` (`bundle.windows.signCommand` calling the CA's signing tool, with timestamping) · ✏️ `.github/workflows/desktop.yml` (secrets)
- **How:**
  1. Sign the app binary and the installer, with an RSA certificate and a timestamp.
  2. Write a pilot install guide that expects a SmartScreen "More info → Run anyway" while reputation builds.
  3. Keep the same publisher name across renewals.
- **Done when:** the signed installer shows our company as publisher, and `signtool verify /pa` passes in CI.

#### B7.4 Auto-update with channels ⏱ 2.5 days *(proposed Lane B)*
- **Why:** with the thin shell, only Rust changes need an installer, but those must still reach every counter without a visit. Marg ships "update patches". *(N10)*
- **Files:** ✏️ `Cargo.toml` (`tauri-plugin-updater`) · ✏️ `tauri.conf.json` (`bundle.createUpdaterArtifacts`, `plugins.updater` endpoints and public key) · ✏️ `desktop.yml` (publish `latest.json` per channel) · ✏️ `src/desktop/*` (update banner)
- **How:**
  1. Generate the updater signing key (separate from the Windows certificate) and store it in GitHub secrets.
  2. Run a staging and a stable channel, with stable rolled out per store.
  3. Show "Update ready: restart after this bill". **Never restart with an open cart.**
  4. Keep the previous version available for rollback.
- **Done when:** a staging install updates itself from version N to N+1. An open cart blocks the restart prompt until the bill is saved or parked.
- **Tests:** DSK-3 (update with an open cart).

### 7.2 Printing that works on Windows

#### A7.5 ⛔ 🧪 Windows raw printing, printer discovery, real errors ⏱ 3 days
- **Why:** printing on Windows is a stub, printer discovery returns hard-coded names, and every OS path reports success even when nothing printed. *(J1, J2, Q14; §2 #1 of the gap analysis)*
- **Files:** ✏️ `desktop/src-tauri/src/printer.rs` · ✏️ `desktop/src-tauri/Cargo.toml` (`windows-sys` features `Win32_Graphics_Printing`, `Win32_Foundation`) · ✏️ `src/desktop/hardware-bridge.ts`, `src/desktop/print-service.ts` (propagate errors)
- **How:**
  1. `print_raw_bytes`: `OpenPrinterW` → `StartDocPrinterW` (`DOC_INFO_1W`, `pDatatype = "RAW"`) → `StartPagePrinter` → `WritePrinter` (loop until all bytes are written) → `EndPagePrinter` → `EndDocPrinter` → `ClosePrinter`. Close handles on every error path.
  2. `list_system_printers`: `EnumPrintersW` (local + connections) plus `GetDefaultPrinterW`.
  3. Remove the final `println!` + `Ok(())` fallback and return `Err` when no path ran.
  4. The cash drawer kick uses the same function.
- **Done when:** on the hardware lab PC (X7.1), a TVS/Epson 80 mm, a 58 mm and an Epson LX-310 all print, and unplugging a printer produces a visible error.
- **Tests:** Rust unit test for the error path; HW-1…HW-4 (thermal 80/58, dot-matrix, drawer) in `MANUAL_TESTING.md`.

#### A7.6 Print reliability UX ⏱ 2 days
- **Why:** a counter needs to know a bill didn't print and fix it in one key. Marg's modify-bill window has F10 print. *(J1; keyboard doc §3.8)*
- **Files:** ✏️ `src/app/dashboard/sales/pos/_components/*` (status toast + retry) · ✏️ `src/app/dashboard/sales/register/*` and `sales/[id]` (reprint) · ✏️ `src/app/dashboard/settings/printers/PrintersAndTemplatesClient.tsx` (test page; printer per document type: thermal bill, A4/A5 bill, label) · ✏️ store settings (drawer kick on cash only)
- **Done when:** a failed print shows "Not printed: Retry (F10) / Choose printer", and reprint works from the bill and the register.

#### A7.7 A5 and 58 mm formats, silent document printing ⏱ 2.5 days
- **Why:** A5 half-page is common at Indian chemists, and only `a4 | thermal_80mm` exist (`sales.ts:199`). A4/A5 HTML bills currently go through a print dialog. *(K2, Q9, J6)*
- **Files:** ✏️ `src/server/db/schema/sales.ts` (`BillingTemplateFormat` + migration) · ✏️ billing template engine and print pages (`src/app/dashboard/sales/[id]/print/*`) · ✏️ `printer.rs` / `lib.rs` (document print command)
- **How:**
  1. Add `a5` and `thermal_58mm` templates.
  2. For A4/A5, evaluate WebView2's print API: it prints to a named printer without a dialog (check it against the installed WebView2 runtime). Fall back to "render to PDF → send to the Windows print queue".
- **Done when:** an A5 bill prints silently on the chosen laser printer from F10, and a 58 mm bill fits the paper.

#### X7.1 Hardware lab *(owner: Lane A, non-code; start in week 1)*
Buy or borrow:
- one Windows 10 and one Windows 11 counter PC;
- an 80 mm thermal printer (TVS RP3160 or Epson TM-T82) and a 58 mm thermal;
- an Epson LX-310 dot-matrix;
- a TSC TE244 label printer;
- a cash drawer;
- a USB barcode scanner;
- one strip with a Schedule H2 QR code.

Write a minimum counter PC spec for sales: Windows 10 1803+ or 11 (WebView2 ships with those; Windows 7 is under 1% of Indian desktop traffic), RAM and disk. *(Q11)*

### 7.3 Counter safety: cost hiding, price guard, cheque payments

#### A7.8 ⛔ 🤝 🔀 🧪 Cost and margin visibility permissions ⏱ 4 days
- **Why:** owners won't let counter staff use software that shows purchase rate and margin. Marg hides these per operator. Today Cashier and Pharmacist see cost through `inventory.view` and `medicine.view`. *(I1, Q6, U13; gap analysis §2 #2)*
- **Files:**
  - ✏️ `src/lib/permissions.ts`: add `cost.view` and `margin.view`, granted to owner, manager, purchase_manager, accountant and auditor only. System roles re-seed through `src/server/roles.ts`.
  - ➕ `src/server/redact.ts` (🤝): `canViewCost(ctx)` and `redactCost(row, ctx)`.
  - ✏️ Lane A readers: `src/app/actions/{inventory,stock,transfers,quarantine,inventory-import}.ts` and the 17 `src/app/dashboard/inventory/*` files, plus sales and accounting pages that show `purchaseRate`, `purchasePrice`, `unitCost` or landed cost (about 31 files on `main`).
- **How:**
  1. Strip the fields **on the server**, in the action or query, not only in the UI.
  2. Hide the columns in the UI.
  3. The POS search API already returns no cost, so keep it that way.
  4. Margin indicators (A8.2) need `margin.view`.
- **Done when:** a Cashier's network responses contain no cost fields on any inventory or sales screen. Owner unchanged.
- **Tests:** integration test per role over the affected actions; RBAC-11 in `MANUAL_TESTING.md`.

#### B7.5 Apply cost redaction to Lane B screens and exports ⏱ 2 days (after A7.8's contract)
- **Files:** ✏️ `src/app/dashboard/reports/*` (5 files), `src/app/dashboard/purchases/*` list views, `src/app/api/export/*`, `src/app/dashboard/import/*`, AI tools that read cost (`src/server/ai/tools/*`)
- **Done when:** the same role test covers reports, exports and the AI assistant (a Cashier asking the AI "what's our margin on Dolo?" gets a refusal).

#### A7.9 🧪 Price guard: below cost warns or blocks, above MRP always blocks ⏱ 1.5 days
- **Why:** Marg has "Indicate-Y / Ban-B if sale rate < purchase rate or sale rate > MRP". Selling above MRP breaks Legal Metrology rules. *(A5, Q7)*
- **Files:** ➕ `src/lib/pricing/price-guard.ts` (pure, used by the POS cart, `src/offline/offline-sale.ts` and `create-sale.ts` near the `maxDiscountBp` check at l.156–162) · ✏️ `src/server/db/schema/platform.ts` (`StoreSettings.belowCostPolicy: "off" | "warn" | "block"`)
- **How:**
  - Above MRP: always block.
  - Below landed cost: apply the store policy. An override needs `sale.discount_override` and writes an audit row.
  - The guard uses `unitCost` server-side, but the cashier only sees "below cost" (no number) unless they have `cost.view`.
- **Done when:** both rules hold online, offline and on sync replay.
- **Tests:** unit tests for the guard; POS-x cases in `MANUAL_TESTING.md`.

#### A7.12 🔀 Cheque, NEFT and RTGS payment methods ⏱ 1 day
- **Why:** clinics and B2B buyers pay by cheque. Today `payments.method` allows only `cash | upi | card | bank` (`schema/accounting.ts:99`), and a cheque number is just free text. This also prepares the PDC lifecycle (A9.3). *(Q5, F4 prep)*
- **Files:** ✏️ `schema/accounting.ts` (method values, `chequeNo`, `chequeDate`, `bankName` + migration) · ✏️ `src/server/domain/payments.ts` · ✏️ receipts UI (`accounting/receipts`) · 🤝 Lane B: supplier pay screen (`suppliers/[id]/pay`)
- **Done when:** a receipt and a supplier payment can be recorded as a cheque with its number and date, and the bank reconciliation matcher (`bank-reconciliation.ts`) matches on cheque number.

### 7.4 Data honesty quick wins (Lane B)

#### B7.6 🧪 Never invent an MRP or sale rate on import ⏱ 1 day
- **Why:** when a distributor bill lacks MRP, the import sets `mrp = PTR × 1.3` and always sets `saleRate = PTR × 1.25` (`distributor-invoice.ts:398–404`). An invented MRP on a printed bill is a legal risk. *(Q1, A4)*
- **How:** a missing MRP marks the line "needs review" and blocks commit. The default sale rate is the MRP (Indian retail sells at MRP less discount) until the pricing engine (A8.3) provides store rules.
- **Done when:** importing a bill with a missing MRP can't commit until someone enters it, and nothing multiplies PTR any more.

#### B7.7 🧪 Use the existing fuzzy matcher in distributor import ⏱ 1.5 days
- **Why:** distributor import does exact name matching (`distributor-invoice.ts:438`), while a three-stage barcode / name+pack / Dice-similarity matcher sits unused in `src/server/domain/import/match.ts:129`. *(Q3, C3)*
- **How:** call `match.ts` and show the confidence on each line. Below a threshold, the user must confirm. Feed confirmations to B8.6 later.
- **Done when:** "DOLO-650MG (15)" matches the local "Dolo 650 Tab 15s" with a confidence shown.

#### B7.8 Accept `.xlsx` distributor bills ⏱ 1 day
- **Why:** distributors send Excel, and `src/lib/stock-csv-validator.ts:15` rejects it. *(Q10, C3)*
- **How:** convert the first sheet to rows (SheetJS or similar), then run the existing CSV pipeline.
- **Done when:** a Pharmarack/Marg `.xlsx` export imports the same as its CSV.

#### B7.9 ⛔ 🤝 🔀 🧪 Banned and restricted drug registry ⏱ 3 days + 2 days data
- **Why:** the watchlist has 8 rules in a TypeScript file (`src/lib/indian-drug-catalog.ts`), checked only at enrichment and stock OCR. The government has banned 156 FDCs (2 Aug 2024), 16 more (11 Jun 2026) and 344 in 2016. *(B11, Q4)*
- **Files:**
  - ➕ table `regulatory_drug_bans` in `src/server/db/schema/compliance.ts`: **global reference data, not tenant-scoped**. Columns: ingredients set, status `banned | restricted`, notification ref, date, source URL.
  - ✏️ `src/server/domain/compliance.ts`: `checkDrugBan(medicine)` 🤝.
  - ➕ seed script with the CDSCO lists.
  - ✏️ GRN line save and medicine create/edit.
- **How:**
  - Match on the normalised salt combination, not the brand.
  - Seed from the CDSCO FDC page (`cdsco.gov.in/opencms/opencms/en/Drugs/FDC/`).
  - Version the data and show "list updated on …" in Settings.
  - Retire the 8 hard-coded rules.
- **Done when:** every combination on the 2024 and 2026 lists is blocked at GRN and medicine create, with the notification shown.

#### A7.10 🧪 Enforce bans at the POS and offline ⏱ 1.5 days (after B7.9's contract)
- **Files:** ✏️ POS add-line (`RetailPosTerminal.tsx` / `usePosCart.ts`) · ✏️ `create-sale.ts` (server check) · ✏️ `src/server/domain/sync/pull.ts` + `src/offline/db.ts` (new `drugBans` table; Dexie version bump)
- **Done when:** a banned item can't be added to a cart online or offline, and a synced offline sale containing one is rejected into the conflicts queue.

#### B7.10 Help-text truth pass ⏱ 0.5 day
- **Why:** help must not claim checks or keys that don't exist. *(B13 note, keyboard B5 remainder)*
- **How:** in `src/server/domain/help/catalog.ts`, remove "MediFlow verifies price stays below DPCO legal ceiling" and the NPPA summary until B10.5 ships. Remove "Alt+N to quickly add a new Customer" (or wire it in A8.2). Keep `tests/unit/help-docs.test.ts` passing.

### 7.5 Keyboard K0 (Lane A)

#### A7.11 Keyboard bug fixes (K0) ⏱ 1.5 days
- **Why:** bugs B1–B4 and B6–B9 from the keyboard doc, at no behaviour risk. Remapping waits for A8.2.
- **Files:** `src/app/components/ShellContext.tsx`, `src/app/dashboard/sales/pos/_state/usePosShortcuts.ts`, `src/app/dashboard/sales/register/RegisterClient.tsx`, `src/app/components/ShortcutsModal.tsx`
- **How:**
  - **B2:** Alt+L → `/dashboard/accounting/ledger` (today `/dashboard/crm/customers` gives a 404).
  - **B3:** remove the duplicate F12 toggle from `usePosShortcuts` (shell and POS cancel each other).
  - **B4:** the shell skips Alt shortcuts when `e.defaultPrevented`; Register calls `preventDefault`.
  - **B8:** match on `e.code`.
  - **B9:** rename the "Marg ERP Counter Billing" heading.
  - **B1:** make the cheat sheet tell the truth (F9 = promise order) until A8.2.
- **Done when:** KB-4 passes (F12 opens the calculator once on POS; Alt+P on Register prints the X-report).

### 7.6 Vendors and lead-time starts (start in week 1; they take calendar time, not effort)

| ID | Task | Owner | Why now |
|---|---|---|---|
| **B7.11** | **GSP vendor selection + sandbox credentials** ⏱ 1.5 days. Score vendors on: IRN, EWB, GSTIN search, IMS and 2B APIs, ISV pricing, sandbox quality, SLA, India data residency. Candidates include ClearTax, Masters India, IRIS, Adaequare, Sandbox.co.in. Closes Part 1's **Q2** | B | B8.8 needs credentials on day one of Phase 8 |
| **X7.2** | **Code-signing certificate:** confirm the legal entity (an OV certificate needs a registered organisation), order an OV certificate with cloud signing, and complete validation | whoever holds the company documents | Validation takes days to weeks, and B7.3 is blocked until it's done (**Q8**) |
| **X7.3** | **Marg dealer demo:** run the 16 questions in gap analysis §10 and record the answers in that file | both (2–3 h) | Settles ❓ items before Phase 8 scope locks |
| **X7.4** | **ABDM sandbox registration + HFR:** register on the ABDM sandbox and start the milestones. Production needs functional validation plus a CERT-In-empanelled security audit (**Q14**) | B | Long lead time for B11.2 |
| **X7.5** | **WhatsApp BSP shortlist + Meta business verification** for a MediFlow-owned number (**Q12**) | B | Verification and template approvals take time before B10.3 |

### 7.7 Phase 7 exit: truth reset

#### X7.6 Re-verify "v1 sellable" on a real Windows counter ⏱ 2 days (A 1 + B 1)
1. Run v1 criterion #2 on the **desktop build**: 2-hour outage, including a cold boot while offline.
2. Print 100 bills.
3. Import a real distributor bill.
4. Update `docs/v1-sellable-checklist.md` with honest statuses and evidence.
5. Rewrite `MANUAL_TESTING.md` §4 (stale) and add the DSK-, HW- and KB- sections.
6. Rewrite `docs/10-offline-pos-design.md` for desktop (it still describes a browser PWA).
7. Add a pointer from `ROADMAP.md` to this file.

---

## Phase 8 · Marg-switchable counter (Weeks 7–14)

**Goal:** an operator with years of Marg muscle memory bills at full speed, schemes and party rates work the way distributors and regular customers expect, distributor bills mostly type themselves, and e-invoices are real.

**Exit criteria (M2):**
- KB-1 (zero-mouse bill) passes on Windows.
- KB-2: a trained ex-Marg operator bills a 5-item Rx in ≤ 25 s.
- A 10+1 scheme and a party special price apply automatically, online and offline.
- The second import of the same supplier's bill auto-maps ≥ 95% of lines.
- A sandbox IRN and e-way bill are generated and cancelled.
- **Paid-pilot go/no-go (X8.1).**

### 8.1 Keymap engine

#### A8.1 ⛔ 🤝 🔀 🧪 Keymap registry, scoped dispatcher, profiles ⏱ 6 days
- **Why:** 25 files each add their own `window` keydown listener. That's the root cause of bugs B3 and B4, and of three hand-written key lists drifting apart. A registry also enables the Classic (Marg) and MediFlow profiles. *(K1, A19, U9; keyboard doc §5)*
- **Files:**
  - ➕ `src/lib/keymap/{actions.ts, bindings.ts, dispatcher.ts, useKeyAction.ts, profiles.ts, format.ts}`
  - ✏️ `src/server/db/schema/platform.ts`: `users.preferences jsonb` (no preferences column exists today) + migration, for `keymapProfile: "classic" | "mediflow"` and overrides.
  - ✏️ `ShortcutsModal.tsx` (generated from the registry), `GlobalTooltipLayer.tsx`, `CommandPalette.tsx` (key hints).
  - ✏️ the 25 listener files (list them with `grep -rln keydown src`).
- **How:**
  1. Declare each action once: id, labels (en/hi), scope, bindings per profile, required permission, `when` condition.
  2. One `window` listener resolves the innermost scope (`modal > field > screen > global`), handles each key once, and matches on `e.code`.
  3. Ignore keystrokes that belong to the barcode-wedge buffer (`hardware-bridge.ts`).
  4. Profile defaults: Classic if the user answers "used Marg" (B11.5), otherwise MediFlow.
- **Done when:** no raw keydown listeners remain outside the dispatcher, the cheat sheet is generated, and profiles switch per user.
- **Tests:** dispatcher unit tests (scope priority, conflicts, `e.code`); KB-4, KB-6, KB-9.

#### B8.1 🤝 Help and docs read keys from the registry ⏱ 1 day
- **Files:** ✏️ `src/server/domain/help/catalog.ts` (`shortcutKey` values become action ids resolved through the registry) · ✏️ `tests/unit/help-docs.test.ts`
- **Done when:** KB-8 passes: every key mentioned in help, the cheat sheet or the F-key bar resolves to a registered action.

### 8.2 POS Classic-profile parity

#### A8.2 🧪 POS parity with Marg's counter keys ⏱ 7 days
- **Why:** the target map in keyboard doc §6.2. Two of these are safety items: **F2 parks the bill instead of discarding it**, and in Classic **F10 shows the tax breakup and does not complete the sale**. *(K2, A8, B8 shortage key, Q12, U6)*
- **Files:** `src/app/dashboard/sales/pos/_components/*`, `_state/*`; new small queries in `src/server/domain/sales/` (party item history, last deal)
- **Scope:**
  - F2 → park + new bill (Classic).
  - F4 → bill discount; Shift+F4 → cash register.
  - F7 in search results → substitutes (fixes B1).
  - F9 → this party's past purchases of the item; Alt+L / Alt+D → last deal.
  - Ctrl+Home and `*` in search results → shortage / promise order (moves off F9).
  - Ctrl+F2 → auto-FEFO ↔ manual batch.
  - Alt+Enter and Ctrl+Tab → batch detail.
  - F5 → party field and party detail.
  - End and Ctrl+Enter save from the qty fields; Ctrl+W saves (Classic).
  - Ctrl+P → load pending promise/external orders.
  - Ctrl+Shift+R / Ctrl+T → repeat the customer's last bill.
  - Ctrl+R → change rate calculation.
  - Alt+F10 (bill profit) and Shift+` (item cost/margin) only for `margin.view` / `cost.view`.
  - A margin-loss chip on lines below the minimum margin (`margin.view`).
  - The UPI panel key (U / Ctrl+N), wired to B8.5.
- **Done when:** KB-1, KB-3 and KB-5 pass.

### 8.3 Pricing, schemes, party rates

#### A8.3 ⛔ 🤝 🔀 🧪 Price rules and one price resolver ⏱ 6 days
- **Why:** Marg resolves a line price from item-party special price → party category → party-wise company discount → qty slab or scheme → party bill discount, then applies the guard. We have a single `saleRate` per batch and a flat discount ceiling. *(A1, A3, A4; gap analysis §5-A)*
- **Files:**
  - ➕ `src/server/db/schema/pricing.ts` (`price_categories`, `price_rules`: scope tenant/store × party/party-category × medicine/manufacturer/category; type `special_rate | discount_bp | qty_slab`) + `customers.priceCategoryId` (`schema/crm.ts`) + migration.
  - ➕ `src/lib/pricing/resolve-line-price.ts`: **pure, isomorphic**, used by the POS cart, `offline-sale.ts` and `create-sale.ts` (step 1 already recomputes prices: "never trust numbers from the browser").
  - ✏️ `src/server/domain/sync/pull.ts` + `src/offline/db.ts` (pull `price_rules`).
- **How:** fixed precedence, documented in the file header; every result carries a `reason` ("Party special", "10+1 scheme"); then the A7.9 guard. Unit-test it as a matrix, the way `allocate-fefo` is tested.
- **Done when:** the same cart gives the same price on the POS, offline and on the server, with a visible reason.

#### B8.2 🤝 🧪 Sale-side schemes ⏱ 2.5 days
- **Why:** the `schemes` table (`schema/purchasing.ts:168`) and `getApplicableSchemes()` exist, but they're purchase-oriented, and the POS only shows a text badge. *(A1, A2)*
- **Files:** ✏️ `schema/purchasing.ts` (`appliesTo: "purchase" | "sale" | "both"`, half-scheme / per-qty table) · ✏️ `src/server/domain/schemes.ts` (`getApplicableSaleSchemes()` 🤝 for A8.3) · ✏️ `src/app/dashboard/settings/schemes/*` ("My own sales scheme")
- **Done when:** a store-wide sale scheme "10+1 on Dolo 650" is returned for qty ≥ 10, and a half scheme gives 1 free for 5.

#### A8.4 🧪 Free-quantity sale lines ⏱ 4 days
- **Why:** a free unit has to leave stock, print as "Free", be returnable, and hit the books correctly. *(A1)*
- **Files:** ✏️ `schema/sales.ts` (`sale_items`: `isFree`, `freeOfLineId`, `schemeId` + migration) · ✏️ `create-sale.ts` (FEFO-allocate free units, zero rate) · ✏️ `return-sale.ts` · ✏️ `accounting.ts` (free goods' cost to COGS) · ✏️ print templates
- **How:** model free units as **separate zero-rate lines** linked to the paid line. That keeps GST, the H1 register (batch per unit) and returns simple. **The GST treatment of free goods on a B2C bill is a CA decision (Q9)**: implement the CA's answer, default to zero taxable value.
- **Done when:** a 10+1 bill deducts 11 from stock, prints 1 free line, and a return of the paid lines handles the free unit by the rule the CA chose.

#### B8.3 Pricing masters UI ⏱ 3 days
- **Files:** ✏️ customers screens (`src/app/dashboard/customers/*`, `actions/customers.ts`): price category on the customer · ➕ party special prices · ➕ party × manufacturer discount
- **Done when:** a clinic customer gets PTR + 5% and a senior-citizen category gets 10% off, set by the owner without a developer.

### 8.4 Counter controls

#### A8.5 🧪 Negative-stock policy and reconcile queue ⏱ 5 days
- **Why:** "the stock arrived but the GRN isn't typed yet" turns into a lost sale. Marg offers Y / N / store / item-wise plus an operator power. `opts.allowNegativeStock` is already plumbed (`create-sale.ts:216`) and used by offline sync. *(A6, Q11)*
- **Files:** ✏️ `StoreSettings.negativeStock: "block" | "warn" | "allow"` · ✏️ `storeMedicineSettings` (per-item allow) · ✏️ `src/lib/permissions.ts` (`sale.negative_stock`) · ✏️ `src/server/domain/stock.ts` / `allocate-fefo.ts` · ➕ "Negative stock to reconcile" page under inventory
- **How:**
  - A negative sale books against a provisional batch row.
  - When a GRN posts (B8.4 hook), re-point the movement to the real batch with a balanced adjustment pair.
  - **Never allow negative stock for Schedule H1 / X / NDPS**: their registers need a real batch. Recommended; confirm as Q15.
- **Done when:** a warn-mode sale of an unreceived item succeeds with a warning, and appears and auto-clears in the queue when the GRN posts. The stock ledger invariants still hold.

#### B8.4 🤝 GRN hook: reconcile negative stock ⏱ 1 day
- **Files:** ✏️ `src/server/domain/purchases.ts` (after posting a GRN, call A8.5's `reconcileNegativeStock(tx, storeId, medicineId)`)

#### A8.6 Custom role editor ⏱ 3 days
- **Why:** the `roles` and `role_permissions` tables already support custom roles (`isSystem`), but `/dashboard/settings/roles` is read-only. Marg has per-operator powers. *(I2, Q8)*
- **Files:** ✏️ `src/app/dashboard/settings/roles/page.tsx` → editor · ✏️ `src/app/actions/users.ts` / `src/server/domain/users.ts` (create, clone, edit; system roles are clone-only)
- **How:** grouped permission checkboxes, including `cost.view`, `margin.view` and `sale.negative_stock`. Guard against an owner locking themselves out. Write an audit row on every change.
- **Done when:** an owner creates "Senior cashier" (returns + 5% discount, no cost view) and assigns it, and RBAC tests cover a custom role.

#### A8.7 Refill reminders from the sale ⏱ 1.5 days
- **Why:** `RemindersService.createRefillReminder()` exists (`src/server/domain/reminders.ts`) but nothing calls it. *(L3, Q2)*
- **Files:** ✏️ POS line (optional days-supply chips 5/10/15/30) · ✏️ `create-sale.ts` step 11 (optional savepoint)
- **How:** create a reminder only if the customer has a phone **and a `reminders` consent** (`ConsentPurpose` in `src/server/domain/privacy/types.ts`). The reminder date is days-supply − 3.
- **Done when:** a 30-tablet chronic sale creates a reminder on day 27, and no reminder is created without consent.

#### B8.5 🤝 Counter UPI QR ⏱ 3 days
- **Why:** customers show fake payment screenshots. MargPay creates a QR per invoice and confirms it automatically (on PayU since Aug 2026). We have Razorpay QR only in mobile delivery. *(A14)*
- **Files:** ✏️ `src/server/domain/mobile/razorpay-client.ts` (generalise) · ✏️ `src/app/api/v1/mobile/webhooks/razorpay/route.ts` (or a POS webhook) · ✏️ `delivery_payment_intents` → general `payment_intents` (`schema/mobile.ts`) · 🤝 A8.2 shows the QR and completes the sale on webhook confirmation
- **Offline:** show a static store UPI QR (`upi://pay?pa=…&am=…`; `src/desktop/escpos.ts` already builds `upi://` strings) marked "verify manually".
- **Done when:** a sandbox UPI payment completes the bill with its UTR stored, and the offline fallback prints.

### 8.5 Distributor bills that type themselves

#### B8.6 ⛔ 🔀 🧪 Supplier item map ⏱ 4 days
- **Why:** every distributor names items differently. Marg remembers each mapping after the first confirmation. *(C3)*
- **Files:** ➕ table `supplier_item_map` (tenant, supplier, normalised supplier item key or code, pack text → `medicine_id`, pack conversion, confidence, confirmed_by, last_used_at) in `schema/purchasing.ts` · ✏️ `import/distributor-invoice.ts`, `api/ocr/grn-invoice/route.ts` (look up the map first, then `match.ts`) · ➕ mappings screen per supplier
- **Done when:** the second import of the same supplier's 50-line bill auto-maps ≥ 95% of lines.

#### B8.7 🧪 Rate-difference alert ⏱ 2.5 days
- **Why:** Marg flags "Diff Rate" when a distributor bills above the last purchase or PO rate. *(C6)*
- **Files:** ✏️ GRN entry (`src/app/dashboard/purchases/new/*`) · ✏️ `src/server/domain/purchases.ts`
- **How:** compare PTR, discount and scheme per line with the last purchase from this supplier and the PO. Flag lines, and offer "record rate-difference claim". The financial debit note comes in A9.2.
- **Done when:** a line billed ₹2 above the last rate is flagged before posting.

### 8.6 Real GST rails

#### B8.8 ⛔ 🧪 Real GSP adapter for IRN and e-way bill ⏱ 6 days
- **Why:** the e-invoice client points at a placeholder host. IRNs must be reported within 30 days for AATO ≥ ₹10 Cr, and e-invoicing applies from ₹5 Cr. *(G1; gap analysis §6)*
- **Files:** ➕ `src/server/domain/einvoice-providers/<vendor>-provider.ts` implementing `IRPProvider` (`einvoice-types.ts:116`: `generateIRN`, `cancelIRN`, `generateEWayBill`, `cancelEWayBill`, vehicle update) · ✏️ `einvoice-provider-factory.ts` · 🗑️ the placeholder URLs in `gsp-provider.ts:56–57` · ✏️ `tenantGspCredentials` usage (already encrypted, B0.4)
- **How:**
  - Cache auth tokens.
  - Map vendor error codes to clear messages.
  - Handle duplicate IRN by fetching the existing one.
  - Respect the 24-hour IRN cancellation window.
  - Retry through the outbox (B2.1).
  - Check the payload against current schema changes (e.g. Ship-To fields).
  - Sandbox first, production after one month of pilot use.
- **Done when:** a B2B sale gets a sandbox IRN and signed QR printed on the bill, and an EWB is generated and cancelled.
- **Tests:** contract tests against recorded sandbox responses; GST-x in `MANUAL_TESTING.md`.

#### B8.9 GSTIN lookup ⏱ 1.5 days
- **Why:** typing a GSTIN should fill the name, address and status, and flag a cancelled or composition GSTIN. *(G4)*
- **Files:** ✏️ supplier and customer forms (`suppliers/new`, customers) · ✏️ GSP adapter (`searchTaxpayer`) · cache table
- **Done when:** entering a valid GSTIN auto-fills the party, and a cancelled GSTIN warns.

#### B8.10 IRN deadline guard ⏱ 1 day
- **Files:** ✏️ tenant/store settings (AATO band) · ✏️ `e-invoice.ts`
- **Done when:** AATO ≥ ₹10 Cr tenants see invoices approaching 30 days without IRN on the dashboard, and the app won't attempt IRN past the window.

### 8.7 Compliance and B2B checks

#### B8.11 TB register ⏱ 1.5 days
- **Why:** Marg has a TB report under Department Reports. *(H2)*
- **Files:** ✏️ `src/server/domain/compliance.ts`, `src/app/dashboard/compliance/[register]` (tag anti-TB molecules: rifampicin, isoniazid, pyrazinamide, ethambutol and combinations; print like the H1 register)

#### B8.12 Doctor-wise and patient-wise sale reports ⏱ 1.5 days
- **Why:** Marg's chemist setup has patient statements, patient × doctor and doctor × company reports. We already capture doctor and patient on Rx sales. *(H3)*
- **Files:** ✏️ `src/server/domain/reports.ts`, `src/app/dashboard/reports/*`

#### B8.13 🤝 Customer drug licence and B2B block ⏱ 1.5 days
- **Why:** a semi-wholesale chemist must not sell scheduled drugs to a clinic or shop whose drug licence has expired. *(D3)*
- **Files:** ✏️ `schema/crm.ts` (`customers.drugLicenseNo`, `drugLicenseExpiry`, `fssaiNo`) · ✏️ customer form · 🤝 Lane A check in `create-sale.ts` step 2 (Lane A adds it as a ½-day part of A8.2)
- **Done when:** a B2B bill with Rx items to a customer with an expired DL is blocked with the reason shown.

### 8.8 Phase 8 exit

| ID | Task | Owner |
|---|---|---|
| **X8.1** | **Ex-Marg operator trial and paid-pilot go/no-go:** a real Marg counter operator does KB-1 and KB-2 cold, then after 1 hour. Record times and stumbles, fix the top 5, then decide the paid pilot | both |
| **X8.2** | **Pricing model + 3-year cost comparison with Marg** (licence + annual renewal + Wallet + dealer visits; gap analysis §5-N): closes Part 1's **Q3** | both |

---

## Phase 9 · The CA signs off (Weeks 15–20)

**Goal:** the pharmacy's CA can close the books and file without asking for Marg or Tally side-work.

**Exit criteria (M3):**
- Journal, contra, debit-note and credit-note vouchers post and reverse correctly.
- A PDC moves from received to cleared or dishonoured.
- The month's day book imports into a TallyPrime trial (file **and** direct post) with matching P&L.
- The edit-log report shows old and new values.
- A composition store issues a bill of supply and produces CMP-08.
- TDS under the new Act is reviewed by a practising CA (X9.1).

### 9.1 Journal core and vouchers

#### A9.1 ⛔ 🤝 🧪 One journal-posting function ⏱ 2 days
- **Why:** every posting function inserts journal rows inline (`accounting.ts:143, 334, 514, 698`, opening balances, `inventory/expiry-claims.ts:444`). Manual vouchers must not add a sixth copy, and balance and period-lock checks belong in one place.
- **Files:** ✏️ `src/server/domain/accounting.ts`: extract `postBalancedJournal(tx, { tenantId, storeId, date, source, narration, lines })`, which enforces Σ debit = Σ credit and the period lock (`accounting-periods`) and returns the entry id. Migrate the existing callers; 🤝 Lane B reviews the expiry-claims call site.
- **Done when:** all journal inserts go through one function, and the existing accounting tests pass unchanged.

#### A9.2 🧪 Manual vouchers: journal, contra, debit note, credit note ⏱ 5 days
- **Why:** a CA's first ask. Marg's keys: Alt+V opens vouchers; F2 payment / F3 receipt / F4 journal / F5 debit note / F6 credit note / F7 contra switch type. *(F1, F2, F3; keyboard doc §3.7)*
- **Files:** ➕ `src/server/domain/accounting/vouchers.ts` · ✏️ `src/server/domain/sequence.ts` docTypes `jv`, `contra`, `dn`, `cn` · ➕ `src/app/dashboard/accounting/vouchers/*` · ✏️ day book and ledgers (show them) · keymap actions (A8.1)
- **How:**
  - Contra is restricted to cash and bank accounts.
  - Notes against a party update its outstanding.
  - Mistakes are corrected by **reversal**, never by delete (docs/04 rule).
  - GST-bearing notes call B9.1.
- **Done when:** a ₹50,000 cash deposit to HDFC posts as contra, and a rate-difference debit note to a supplier reduces their outstanding.

#### B9.1 🤝 GST for financial credit and debit notes ⏱ 1.5 days
- **Files:** ✏️ `src/server/domain/gst.ts` (GST document for a non-stock note; GSTR-1 CDNR/CDNUR) · `B2.6` patterns
- **Done when:** a GST-bearing credit note to a B2B customer appears in GSTR-1 CDNR.

### 9.2 Cheques and PDC

#### A9.3 🔀 🧪 Cheque and PDC lifecycle ⏱ 5 days (after A7.12)
- **Why:** Marg's flow: record PDC → pay-in-slip (F3 deposits all) → clearance date → or dishonour, which reverses and can add charges. *(F4)*
- **Files:** ➕ `cheques` table (direction in/out, party, number, date, bank, amount, status `received → deposited → cleared | dishonoured`, `issued → presented → cleared`, event log) in `schema/accounting.ts` · ✏️ `src/server/domain/payments.ts` (post on clearance, or to a "PDC in hand" account by tenant choice) · ➕ cheque register, pay-in-slip and maturity alerts on the dashboard · keymap Alt+U / Alt+Q
- **Done when:** a dishonoured customer cheque restores the bill's outstanding and optionally raises a charges debit note, and PDCs due today show on the dashboard.

### 9.3 Tally

#### A9.4 🧪 Tally XML export and direct post to TallyPrime ⏱ 5 days
- **Why:** most CAs work in Tally. Marg exports two XML files (masters and day book). TallyPrime also accepts **XML over HTTP on port 9000**, so the desktop app can post straight into Tally running on the same PC or LAN. Marg can't. *(F6; see *Sources*)*
- **Files:** ✏️ `src/server/domain/reports/ca-pack.ts` (Tally `ENVELOPE/TALLYMESSAGE`: ledgers, vouchers; stock items optional) · ➕ ledger-mapping table and screen · ➕ Rust command `tally_post(xml)` in `desktop/src-tauri/src/` (allowed only for localhost/LAN; done in Rust because Tally sends no CORS headers)
- **How:** give each voucher a stable id (Tally's remote id/GUID), so a re-export updates rather than duplicates. Parse Tally's created/altered/error counts and show them.
- **Done when:** a month of a test store's day book imports into a TallyPrime trial both ways, with P&L equal to MediFlow's.

### 9.4 Statutory audit trail and ITC reversal

#### A9.5 🔀 🧪 Statutory edit log ⏱ 4 days
- **Why:** companies must use accounting software with a non-disableable audit trail. Today `audit_logs` has 91 `writeAudit` calls in 46 files, with no database-level guarantee. *(G11)*
- **Files:** ➕ migration: `edit_log` table + Postgres triggers on journal, payment, sale, purchase and stock-movement tables, plus party financial fields, storing old/new `jsonb`, table, row id, operation, actor and time · ✏️ `src/server/action.ts` (run `SET LOCAL app.user_id` in every transaction that writes financial tables; the `protectedAction` wrapper is the natural place) · DB role: `REVOKE UPDATE, DELETE ON edit_log` for the app role · ➕ auditor report (period, table, user; export) · settings change history
- **Done when:** editing a purchase rate shows before/after with user and time in the report, and the app role can't modify `edit_log`.

#### A9.6 🤝 🧪 ITC reversal on destroyed stock ⏱ 2 days
- **Why:** when expired stock is destroyed instead of returned, its input tax credit must be reversed (s.17(5)(h)). *(G8)*
- **Files:** ✏️ quarantine and write-off flow (`src/server/domain/inventory/*`) · ✏️ `accounting.ts` (reversal journal) · 🤝 Lane B: GSTR-3B reversal table (CA confirms the row, X9.1)
- **Done when:** destroying 10 strips posts the reversal and shows it in the 3B summary.

### 9.5 Tax schemes

#### B9.2 🤝 🧪 Composition scheme ⏱ 5 days
- **Why:** many small shops are composition dealers. Marg produces CMP-08 as Excel and GSTR-4 as JSON. *(G5)*
- **Files:** ✏️ `StoreSettings.gstScheme: "regular" | "composition"` · 🤝 Lane A: `create-sale.ts` step 5 issues no tax lines, a separate bill-of-supply series (`sequence.ts` docType `bos`), and **blocks inter-state supplies** (composition dealers can't make them) · ✏️ print templates (mandatory declaration) · ✏️ purchases (no ITC) · ➕ CMP-08 Excel and GSTR-4 JSON in `src/server/domain/gst.ts`
- **Done when:** a composition store's bill shows no tax and the declaration, and CMP-08 totals match the quarter's sales.

#### B9.3 🧪 TDS under the Income-tax Act, 2025 ⏱ 5 days
- **Why:** chains with turnover over ₹10 Cr must deduct TDS on purchases of goods over ₹50 L from one supplier (old s.194Q), and on expenses (old 194C/H/I/J). Since 1 Apr 2026 these live in the **s.393 table** of the new Act, and the quarterly return is **Form 140** (was 26Q). TCS on sale of goods no longer exists. *(G9; gap analysis §1.2)*
- **Files:** ✏️ suppliers (PAN, TDS flags) · ✏️ `src/server/domain/purchases.ts` and expenses · ✏️ `accounting.ts` ("TDS payable") · ➕ TDS register and Form 140 data export
- **How:** keep a running total per PAN per tax year, plus a tenant flag "previous-year turnover > ₹10 Cr". **Before coding, a CA confirms the new table entries, rates and form fields (X9.1).** Use new-Act labels in the UI ("s.393, Table …"), and keep the old section number in brackets for familiarity.
- **Done when:** the purchase that crosses ₹50 L deducts at the confirmed rate, and the quarter's register exports in the CA-approved layout.

#### B9.4 IMS and GSTR-2B through the GSP ⏱ 4 days
- **Why:** IMS has been mandatory for regular 3B filers since Apr 2026 and locks Table 4 ITC. Our IMS tagging is local only. GSTN has released IMS APIs to GSPs; the accept/reject endpoint depends on the vendor (see *Sources*). *(G3)*
- **Files:** ✏️ GSP adapter (2B pull, IMS get/act) · ✏️ `src/app/dashboard/gst/gstr2b/*` and reconciliation
- **Done when:** 2B loads without a manual JSON upload, and an accept/reject made in MediFlow appears on the portal (vendor permitting).

### 9.6 Analysis

#### B9.5 🧪 Business Analysis pivot and gross-profit reports ⏱ 6 days
- **Why:** Marg's real report power is "any field against any field, export". GP is the owner's first question. `sale_items.unitCost` already stores cost at the time of sale. *(M1, M2)*
- **Files:** ➕ `src/server/domain/reports/analysis.ts` (dimensions: item, salt, manufacturer, category, party, doctor, cashier, store, hour; measures: qty, value, GP, discount) · ➕ `src/app/dashboard/reports/analysis/*` · export to Excel/CSV
- **Rule:** GP needs `margin.view` (A7.8).
- **Done when:** an owner answers "GP by manufacturer last month" in under 30 s, and a Cashier can't open the page.

#### B9.6 (stretch) GSTR-9 data preparation ⏱ 3 days
- *(G6)* Build the annual tables from data already stored. If time is short, drop this to Phase 12.

#### X9.1 CA advisory *(both; ongoing from Phase 8)*
Book 1–2 hours a month with a practising CA for:
- free-goods GST (Q9);
- ITC reversal rows;
- composition rules;
- TDS under the new Act;
- the Tally ledger mapping.

Record each answer in `docs/05-domain-pharmacy-india.md`.

---

## Phase 10 · Trust, data and language (Weeks 21–27)

**Goal:** the owner trusts that their data is safe on the counter PC and in their own backups, staff and customers get Hindi bills, WhatsApp works on day one, and the drug master is real.

**Exit criteria (M4):**
- Offline data lives in encrypted SQLite.
- A scheduled backup restores on a fresh PC.
- A Hindi thermal bill prints.
- A bill is sent on WhatsApp with no Meta setup, and then from a MediFlow number.
- The drug master returns salts and substitutes for the top 1,000 brands.

### 10.1 Local data: SQLite, encryption, backups

#### A10.1 ⛔ 🔀 Offline store on SQLite (Rust side) ⏱ 6 days
- **Why:** offline data lives in IndexedDB inside the webview profile, which a webview reset can wipe, and it can't be encrypted, backed up as a file or shared over LAN. The `src/desktop/sqlite-storage.ts` interface already exists but has no implementation. *(N1 prep, N2, N11; gap analysis §1.1 D3)*
- **Files:** ✏️ `desktop/src-tauri/Cargo.toml` (`tauri-plugin-sql` with SQLite, or `rusqlite` commands) · ➕ implementation behind `sqlite-storage.ts` · ✏️ `src/offline/db.ts` → storage adapter: **SQLite in Tauri, Dexie in the browser**, because the dev loop still runs in Edge · one-time migration from Dexie
- **Done when:** offline sale, sync and conflicts work on SQLite in the desktop build, and the browser dev loop still works on Dexie. Offline E2E (A4.8) is green on both.

#### A10.2 Local data protection ⏱ 3 days
- **Why:** the counter PC holds patient names, Rx data and credit balances. DPDP applies. *(N11)*
- **How:** encrypt the database (SQLCipher, or a key protected by Windows DPAPI). Wipe local data when the device is revoked (the `devices` table exists). Add an idle lock screen (Ctrl+Q / Ctrl+Shift+L).
- **Done when:** copying the DB file to another PC yields nothing readable, and revoking the device wipes it on next launch.

#### A10.3 Backups and "download all my data" ⏱ 4 days
- **Why:** owners fear being locked into a startup. Marg backs up to the owner's own drive, USB or Google Drive. A desktop app can write straight to a folder. *(N2)*
- **Files:** ➕ Rust command for a scheduled encrypted export to a chosen folder (local, USB, or a Drive/OneDrive-synced folder) · ➕ server export job (CSV/XLSX + Tally XML + JSON of the tenant) · ➕ Settings › Backup (schedule, last success, restore guide)
- **Done when:** a nightly backup lands in the chosen folder, and a restore drill on a fresh PC recovers the offline DB.

### 10.2 Language

#### A10.4 Bills in Hindi, then other languages ⏱ 5 days
- **Why:** Marg prints Hindi, Tamil and Telugu bills and item names. Thermal ESC/POS text mode can't print Devanagari, so it needs raster images. *(K3)*
- **Files:** ✏️ `schema/catalog.ts` / `crm.ts` (`nameLocal` on medicines and parties) · ✏️ A4/A5 templates (bundle Noto Sans Devanagari, etc.) · ✏️ `src/desktop/escpos.ts` (render text to a bitmap, send `GS v 0`)
- **Done when:** a thermal and an A5 bill print the shop header and item names in Hindi.

### 10.3 Control Room v1

#### A10.5 Control Room: one place for business rules ⏱ 4 days
- **Why:** `StoreSettings` has 4 keys (`platform.ts:60–65`). Phases 7–9 add many more (below-cost policy, negative stock, GST scheme, round-off, mandatory doctor/phone, print copies, free-goods GST). Marg's Control Room keeps a change history. *(I4)*
- **Files:** ➕ `src/lib/settings-registry.ts` (typed, versioned keys with defaults, labels and help) · ✏️ `src/app/dashboard/settings/*` (searchable "Control Room" screen) · changes go to `edit_log` (A9.5)
- **Done when:** every store rule added in Phases 7–9 is on one searchable screen with its history.

### 10.4 Keyboard everywhere

#### A10.6 Keyboard grammar for lists, registers, ledgers and reports ⏱ 5 days
- **Why:** only the POS is keyboard-driven, while Marg is keyboard-driven everywhere. *(K3)*
- **Files:** ➕ shared `<KeyTable>` (Space / + / − / * / / selection, Enter drill-down, Esc back, F2 date range, Alt+P print or export, F10 filter) · ✏️ sales register (F10 reprint, F11 share, F9 audit, F4 e-invoice) · ✏️ inventory list (F2/F3, F4 item ledger, F7 salt, F9 company, F10 in-stock, Insert adjust) · ✏️ ledgers (F2, F6, F8, Ctrl+F1)
- **Done when:** a reprint, a ledger check and a report export each take no mouse.

#### B10.1 GRN keyboard flow ⏱ 3 days
- **Files:** ✏️ `src/app/dashboard/purchases/new/*`: supplier → bill no. → date → lines (item → batch → expiry → qty → free → PTR → MRP → disc), Enter to advance; F2 new line, F3 edit, Ctrl+O import, Ctrl+P load PO, F6 rate history (`cost.view`), End/Ctrl+Enter/Ctrl+W save *(keyboard doc §6.3)*
- **Done when:** a 10-line bill is entered without the mouse.

### 10.5 WhatsApp without setup, then managed

#### A10.7 🤝 Desktop "open WhatsApp" command ⏱ 0.5 day
- **Files:** ✏️ `Cargo.toml` (`tauri-plugin-opener`) · capability entry · `hardware-bridge.ts` method `openWhatsApp(phone, text)`

#### B10.2 WhatsApp day-one deep link ⏱ 1 day
- **Why:** every tenant must currently bring Meta Cloud API credentials (`whatsapp.ts:119–161`). Marg offers a zero-setup local mode. *(L1 step 1)*
- **How:** "Send on WhatsApp" opens WhatsApp Desktop with `whatsapp://send?phone=91…&text=<public bill link>` (the public receipt link already exists from B5.4).
- **Done when:** a new shop sends its first bill on WhatsApp within a minute of installing.

#### B10.3 Managed WhatsApp number via a BSP ⏱ 5 days (after X7.5)
- **How:** a MediFlow-owned WABA through the chosen BSP sends approved utility templates (bill, refill, payment reminder), with metering per tenant. Tenants can bring their own number later. *(L1 step 2)*
- **Done when:** a refill reminder from A8.7 is delivered from the MediFlow number with no tenant setup.

### 10.6 Drug intelligence

#### B10.4 ⛔ 🔀 Drug master v1 ⏱ 6 days (+ data licence, Q13)
- **Why:** Marg's PharmaNXT covers 1.5–5 lakh medicines with salts, substitutes and HSN. We have 46 hand-written brands. *(B1, U4)*
- **Files:** ➕ global `drug_master` table (brand, salts with strengths, form, pack, manufacturer, HSN, GST, schedule) · seed pipeline (licensed data, public CDSCO / Jan Aushadhi lists, cleaned tenant medicines) · ✏️ medicine create, POS substitutes (`SubstitutesModal.tsx`), AI enrichment · 🗑️ `src/lib/indian-drug-catalog.ts` after migration
- **Done when:** typing a brand in item create fills salt, HSN, GST and schedule for the top 1,000 brands, and substitutes come from the master.

#### B10.5 🧪 NPPA ceiling-price check ⏱ 3 days + data
- **Why:** scheduled formulations under DPCO have ceiling prices. The help text claims we check this; it doesn't yet. *(B13)*
- **Files:** ➕ `ceiling_prices` table (NPPA notifications) · check at GRN (MRP above ceiling → warn) and POS (rate above ceiling → block) through a shared module · restore the help text
- **Done when:** an MRP above the notified ceiling is flagged at GRN.

#### B10.6 Prescription images ⏱ 3 days
- **Why:** inspectors ask for Schedule X and H1 prescriptions, and `prescriptions.imageUrl` has no storage flow. *(H5)*
- **Files:** object storage (S3/R2) upload from POS (file, webcam, document scanner via `scanner.rs`) · view next to the register entry
- **Done when:** an H1 dispense shows its prescription image in the register.

### 10.7 Bills by email and deeper Marg migration

#### B10.7 Distributor bills by email ⏱ 5 days
- **Why:** this is the realistic answer to Marg's Collaborative Commerce: distributors already email PDFs and Excel files. *(C1)*
- **How:** a per-store inbound address through an inbound-mail provider → outbox job → existing AI OCR or `.xlsx` parse → draft GRN mapped through `supplier_item_map` → reviewer confirms.
- **Done when:** emailing a real distributor PDF produces a draft GRN within 2 minutes.

#### B10.8 Deeper Marg migration ⏱ 4 days
- **Why:** day-one credit continuity needs bill-by-bill open receivables and payables, PDCs and pending expiry claims, not only masters. *(N4)*
- **Files:** ✏️ `src/server/domain/import/presets/marg.ts` and commit · uses A9.3 cheques, B3.6 claims
- **Done when:** a Marg shop's open bills, with their dates, show correct ageing in MediFlow on day one.

### 10.8 Expiry sweep

#### A10.8 "Expired before" sweep to scrap ⏱ 1.5 days
- **Why:** Marg moves all stock expired before a chosen month to the scrap store in one step. *(B6)*
- **Files:** ✏️ quarantine flow (`src/app/dashboard/inventory/quarantine/*`, `actions/quarantine.ts`)
- **Done when:** one action quarantines every batch expired before the chosen month, with a summary.

---

## Phase 11 · Better than Marg (Weeks 28–34)

**Goal:** a newcomer learns the keyboard from the screen itself, a Marg veteran is faster than in Marg, and the app does things Marg can't.

**Exit criteria (M5):**
- The F-key bar and Alt hints are on every screen.
- A cashier switches by PIN in 2 s.
- Labels print from GRN.
- Scanning a Schedule H2 QR picks the batch.
- An ABHA-linked bill is accepted in the ABDM sandbox.

### 11.1 Labels and pack codes

#### A11.1 Barcode labels ⏱ 4 days
- *(B9, J3)* TSPL and ZPL label templates (name, batch, expiry, MRP, rack). Print from GRN and the item list (`+`) through the A7.5 raw path. Test on the TSC TE244.

#### A11.2 Pack QR (Schedule H2) and GS1 parsing ⏱ 3 days
- **Why:** QR codes are now required on vaccines, antimicrobials, NDPS and anticancer drugs (G.S.R. 506(E), 22 Jun 2026), phasing in from 2027. *(B10; gap analysis §6)*
- **Files:** ✏️ `src/desktop/hardware-bridge.ts` scanner buffer → parse GS1 AIs `(01)(10)(17)(21)` and the H2 QR payload · auto-select batch · block or warn on expired
- **Done when:** scanning the lab's H2 strip adds the right batch, and an expired pack is refused.

### 11.2 Discoverable keyboard

| ID | Task | ⏱ | Research |
|---|---|---|---|
| **A11.3** | **F-key bar**: a live strip of the keys for the focused scope, generated from the registry | 2.5 | U1 |
| **A11.4** | **Hold-Alt key hints**: hold Alt for 600 ms to see letter keys on everything navigable | 2 | U2 |
| **A11.5** 🤝 | **Palette that acts and speaks Marg**: Ctrl+K / Ctrl+J runs actions ("reprint 1043", "stock dolo 650", "new purchase cipla") and knows Marg vocabulary (*Control Room, Self Format, Brk/Exp, PTR, godown, challan*) | 4 | U3 |
| **B11.1** 🤝 | **AI fallback in the palette**: if nothing matches, Enter asks the AI assistant | 1.5 | U3 |

### 11.3 Counter speed and safety

| ID | Task | ⏱ | Research |
|---|---|---|---|
| **A11.6** | **PIN quick user switch** (Ctrl+U) + **supervisor PIN override** at the counter for discount and cancel. Each bill is attributed to the right person, and permissions follow the person | 4 | U8, I6 |
| **A11.7** | **Undo** in the cart (Ctrl+Z in MediFlow, Alt+Backspace in both) | 1.5 | U7 |
| **A11.8** | **Keyboard coach**: telemetry (`src/lib/telemetry.ts`) counts mouse vs key per action; nudges "Tip: F8"; owner sees seconds per bill per cashier | 3 | U10 |
| **A11.9** | **Practice bill** in onboarding + **printable key sticker** (A4 / thermal strip, English + Hindi) | 2.5 | U11, U12 |

### 11.4 ABHA billing

#### B11.2 ABHA-linked billing (HFR, DHIS) ⏱ 10 days (after X7.4)
- **Why:** Marg pays chemists ₹20 per ABHA-linked bill through the ABDM DHIS incentive (Marg's figure). It's a feature that earns money for the chemist. *(H4)*
- **How:**
  - HFR registration flow for the store;
  - ABHA number at billing;
  - push the bill as an ABDM health record (FHIR);
  - DHIS claim report.
  - Sandbox milestones, then functional validation, then the CERT-In-empanelled security audit (budget it: Q14), then production keys.
- **Done when:** the sandbox accepts an ABHA-linked bill, and the certification application is filed.

### 11.5 Owner insights and onboarding

| ID | Task | ⏱ | Research |
|---|---|---|---|
| **B11.3** | **Daily owner summary on WhatsApp/email** (sales, GP, cash, low stock, expiring) | 2 | M7 |
| **B11.4** | **Doctor-wise business and commission** (beyond MR commission) | 3 | L4 |
| **B11.5** | **Onboarding "Have you used Marg?"** → Classic profile, Marg-term glossary, 6-line "what's different" card | 1.5 | keyboard doc §8 |

### 11.6 Supportability

#### A11.10 Diagnostics bundle and remote-support playbook ⏱ 2 days
- **Why:** desktop installs need support at the shop. Marg dealers fix problems over AnyDesk in 10 minutes. *(N5)*
- **How:** "Help › Send diagnostics" zips the app version, printers, WebView2 version, recent errors and sync state, and attaches it to a support ticket. Write a remote-support guide.

---

## Phase 12 · Segment packs (on demand, from Aug 2027)

Pick packs from pilot feedback. Write each one up with full Why / Files / How / Done when when it's scheduled.

| Pack | Contents (research IDs) | Lane | Rough ⏱ | Trigger |
|---|---|---|---|---|
| **Wholesale and semi-wholesale** | Route/area/MR sale, collection and outstanding (D1) · interest on overdue (D2) · dispatch, LR, transporter (D5) · company stock and sales statement (D6) · salesman app (D4, later) | B (D2, D5: A) | 15 | A pilot sells B2B to clinics or shops |
| **Store operations** | Godowns inside a store (B3) · customer Brk/Exp receive (B5) · replacement issue/receive (A13) · estimates/quotations (A11) · delivery challan (A12) · kits (A17) · 3-level packs (A10) · picker → cashier queue (A16) · dosage label (A18) · cold-chain flag (B12) · dump-stock report (B15) · item/ledger hiding per user (I3) · back-date freeze (I5) | A (B15: B) | 30 | High-footfall or multi-godown pilot |
| **Multi-counter offline** | Store edge relay over LAN on SQLite (N1, after A10.1) | A | 15 | Pilots report multi-counter outages |
| **Bundled POS** | ADR 0005 option (c): POS and offline screens bundled in the app, calling the cloud API | A (+B for API) | 20 | Cold-start-offline fails, or latency complaints |
| **Payments and banking** | EDC terminals (A15) · bank statement fetch / account aggregator (F9) · payouts (F8) · cheque printing (F5) · fixed assets (F11) | A | 25+ | Chain finance teams ask |
| **Tax extras** | GSTR-9/9C (G6, if not in Phase 9) · RCM self-invoice (G7) | B | 7 | CA asks |
| **Purchasing extras** | Supplier rate comparison (C7) · claims tracker (C11) · scheme from purchase discount (C9) · ERP-to-ERP order with a distributor partner (C2) | B | 10 | Purchase managers ask |
| **CRM extras** | Memberships, wallets, vouchers (L6) · bulk WhatsApp bills and ledgers (L2) · allergy flags (H7) | B | 8 | Loyalty-heavy pilots |
| **Hardware extras** | Pole display, weighing scale (J5) · document scanner on more devices (J4d) | A | 5 | Specific shops |
| **Mobile** | eOwner depth: ledgers, outstanding, PDC, P&L (M4) · delivery GPS (M6) | A+B | 15 | Owners ask |
| **Migration extras** | Tally → MediFlow import (F7) · self-format designer depth (K1) · regional-language UI (K4) | B / A | 12 | Sales feedback |

---

## Deferred: macOS and Linux

Parked by the 25 Nov 2026 Windows-first decision. Re-open when a pilot needs it.
- **Printing:** macOS (J1m, Q13: share the CUPS code under `cfg(unix)`); Linux real errors (J1l).
- **Document scanner** on macOS (J4d: `scanner.rs` asks for NAPS2).
- **Builds:** macOS notarisation and DMG; Linux AppImage/deb (N9, N12); `tauri-driver` has no macOS support, so testing there is manual.
- **Keyboard** (keyboard doc §4.1–4.2):
  - Mac F-row media keys and missing End/Insert keys;
  - custom macOS menu;
  - Linux desktop shortcuts on Alt+F-keys (DE setup script);
  - Cmd-based MediFlow profile;
  - OS-aware key symbols;
  - "same keys everywhere" (U15).

## Out of scope (unchanged)
- HR and payroll; consumer storefront (product decision 2026-10-20).
- Hospital IPD/TPA (E1, E2); manufacturing; MargLabz.
- PharmaNXT distributor locator (B2) and the eRetail B2B network (M5): these need a distributor network.
- Embedded lending (N7).
- A physical dealer network (N5) is a go-to-market choice: recruit one implementation partner per pilot city instead.

---

## Open questions and decisions

Part 1's Q1–Q7 still apply. Q1, Q2 and Q3 become urgent.

| # | Question | Needed by | Owner |
|---|---|---|---|
| **Q1** | Hosting: Vercel (`vercel.json`, `sin1`) or AWS ECS (`deploy.yml`)? Sets the production and staging URLs the desktop app loads | A7.2 (week 1) | A |
| **Q2** | GSP vendor | B7.11 → B8.8 | B |
| **Q3** | Pricing model vs Marg's 3-year cost | X8.2 | both |
| Q8 | Which legal entity buys the code-signing certificate (OV needs a registered organisation)? | X7.2 (week 1) | owner of company documents |
| Q9 | GST and accounting treatment of free goods on B2C and B2B sales | A8.4 | CA (X9.1) |
| Q10 | Release pipeline (staging, CI build, signing, updater): Lane B as proposed in §0.5? | Phase 7 start | both |
| Q11 | Minimum counter PC spec (Windows 10 1803+/11, RAM, disk) and whether to offer a PC + printer kit | X7.1 | both |
| Q12 | WhatsApp BSP vendor; MediFlow number vs tenant numbers | X7.5 → B10.3 | B |
| Q13 | Drug-master data source and licence (extends Part 1's Q7) | B10.4 | B |
| Q14 | ABDM: certify as an integrated software, and the budget for the CERT-In-empanelled audit | X7.4 → B11.2 | both |
| Q15 | Negative stock for Schedule H1 / X / NDPS: block always (recommended)? | A8.5 | both (+ CA/legal) |

---

## Progress tracker

Tick items in PRs, one line per phase.

**Phase 7**
- A: [ ] A7.1 [ ] A7.2 [ ] A7.3 [ ] A7.4 [ ] A7.5 [ ] A7.6 [ ] A7.7 [ ] A7.8 [ ] A7.9 [ ] A7.10 [ ] A7.11 [ ] A7.12
- B: [ ] B7.1 [ ] B7.2 [ ] B7.3 [ ] B7.4 [ ] B7.5 [ ] B7.6 [ ] B7.7 [ ] B7.8 [ ] B7.9 [ ] B7.10 [ ] B7.11
- X: [ ] X7.1 [ ] X7.2 [ ] X7.3 [ ] X7.4 [ ] X7.5 [ ] X7.6

**Phase 8**
- A: [ ] A8.1 [ ] A8.2 [ ] A8.3 [ ] A8.4 [ ] A8.5 [ ] A8.6 [ ] A8.7
- B: [ ] B8.1 [ ] B8.2 [ ] B8.3 [ ] B8.4 [ ] B8.5 [ ] B8.6 [ ] B8.7 [ ] B8.8 [ ] B8.9 [ ] B8.10 [ ] B8.11 [ ] B8.12 [ ] B8.13
- X: [ ] X8.1 [ ] X8.2

**Phase 9**
- A: [ ] A9.1 [ ] A9.2 [ ] A9.3 [ ] A9.4 [ ] A9.5 [ ] A9.6
- B: [ ] B9.1 [ ] B9.2 [ ] B9.3 [ ] B9.4 [ ] B9.5 [ ] B9.6
- X: [ ] X9.1

**Phase 10**
- A: [ ] A10.1 [ ] A10.2 [ ] A10.3 [ ] A10.4 [ ] A10.5 [ ] A10.6 [ ] A10.7 [ ] A10.8
- B: [ ] B10.1 [ ] B10.2 [ ] B10.3 [ ] B10.4 [ ] B10.5 [ ] B10.6 [ ] B10.7 [ ] B10.8

**Phase 11**
- A: [ ] A11.1 [ ] A11.2 [ ] A11.3 [ ] A11.4 [ ] A11.5 [ ] A11.6 [ ] A11.7 [ ] A11.8 [ ] A11.9 [ ] A11.10
- B: [ ] B11.1 [ ] B11.2 [ ] B11.3 [ ] B11.4 [ ] B11.5

---

## Appendix A: traceability (every research finding → where it's handled)

**Gap analysis matrix**

| Domain | Mapping |
|---|---|
| A · POS & pricing | A1 → A8.3/A8.4/B8.2 · A2 → B8.2 · A3 → A8.3/B8.3 · A4 → A8.3, B7.6 · A5 → A7.9 · A6 → A8.5/B8.4 · A7 built · A8 → A8.2 · A9 built · A10, A11, A12, A13, A15, A16, A17, A18 → Phase 12 · A14 → B8.5 · A19 → A8.1/A8.2 |
| B · Inventory & drugs | B1 → B10.4 · B2 out · B3, B5, B12, B15 → Phase 12 · B4, B7, B14 built · B6 → A10.8 · B8 → A8.2 (shortage key; reorder engine built) · B9 → A11.1 · B10 → A11.2 · B11 → B7.9/A7.10 · B13 → B10.5 (+B7.10) |
| C · Purchasing | C1 → B10.7 (network out) · C2, C7, C9, C11 → Phase 12 · C3 → B7.7/B7.8/B8.6 · C4, C5, C8, C10 built · C6 → B8.7 |
| D · Wholesale | D1, D2, D4, D5, D6 → Phase 12 · D3 → B8.13 |
| E · Hospital | E1, E2 out |
| F · Accounting | F1, F2 → A9.2 · F3 → A9.2/B9.1 · F4 → A7.12 + A9.3 · F5, F7, F8, F9, F11 → Phase 12 · F6 → A9.4 · F10 built |
| G · GST & tax | G1 → B7.11/B8.8 · G2 built · G3 → B9.4 · G4 → B8.9 · G5 → B9.2 · G6 → B9.6 (stretch) · G7 → Phase 12 · G8 → A9.6 · G9 → B9.3 (new Act) · **G10 obsolete** (TCS on goods removed) · G11 → A9.5 |
| H · Regulatory | H1, H6, H8 built · H2 → B8.11 · H3 → B8.12 · H4 → X7.4 + B11.2 · H5 → B10.6 · H7 → Phase 12 |
| I · Security | I1 → A7.8/B7.5 · I2 → A8.6 · I3, I5 → Phase 12 · I4 → A10.5 · I6 → A11.6 |
| J · Hardware | J1, J2 → A7.5 · J1m, J1l → deferred · J3 → A11.1 · J4 built · J4d → deferred/Phase 12 · J5 → Phase 12 · J6 → A7.7 |
| K · Print & language | K1 → A7.7 (formats) + Phase 12 (designer depth) · K2 → A7.7 · K3 → A10.4 · K4 → Phase 12 |
| L · CRM & comms | L1 → A10.7/B10.2/B10.3 · L2, L6 → Phase 12 · L3 → A8.7 · L4 → B11.4 · L5, L7 built |
| M · Reports & mobile | M1, M2 → B9.5 · M3 built · M4, M6 → Phase 12 · M5 out · M7 → B11.3 |
| N · Platform & commercial | N1 → Phase 12 (after A10.1) · N2 → A10.3 · N3 built · N4 → B10.8 · N5 → A11.10 + partner per city · N6 → X8.2 · N7 out · N8 → A7.1–A7.3 · N9 → B7.2/B7.3 · N10 → B7.4 · N11 → A7.3 (IPC lock-down) + A10.2 · N12 → deferred |
| Quick wins | Q1 → B7.6 · Q2 → A8.7 · Q3 → B7.7 · Q4 → B7.9/A7.10 · Q5 → A7.12 · Q6 → A7.8 · Q7 → A7.9 · Q8 → A8.6 · Q9 → A7.7 · Q10 → B7.8 · Q11 → A8.5 · Q12 → A8.2 · Q13 → deferred · Q14 → A7.5 · Q15 → A7.4 |
| 2025–26 regulation (§6) | FDC bans → B7.9 · Schedule H2 QR → A11.2 · 30-day IRN → B8.10 · IMS / 3B lock → B9.4 · ABDM → B11.2 · MCA audit trail → A9.5 · EWB 180-day rule → B8.8 · Ship-To → B8.8 |

**Keyboard doc**

| Item | Mapping |
|---|---|
| Bugs | B1, B2, B3, B4, B6, B7, B8, B9 → A7.11 · B5 partly fixed in #102; rest (DPCO, Alt+N) → B7.10 |
| Phases | K0 → A7.11 · K1 → A8.1 (+B8.1) · K1b (Windows parts) → A7.4 · K2 → A8.2 · K3 → A10.6/B10.1 · K4 → Phase 11 |
| Advantages | U1 → A11.3 · U2 → A11.4 · U3 → A11.5/B11.1 · U4 → B10.4 · U5 built · U6 → A7.4/A8.2 · U7 → A11.7 · U8 → A11.6 · U9 → A8.1 · U10 → A11.8 · U11, U12 → A11.9 · U13 → A7.8 · U14 later (voice exists) · U15 → deferred |
| Tests | KB-1…KB-11 → added to `MANUAL_TESTING.md` in X7.6 and with each task |

## Appendix B: effort and capacity

| Phase | Lane A ⏱ | Lane B ⏱ | Weeks at ~4.5 days/week (heavier lane) |
|---|---|---|---|
| 7 | 25.5 | 21 | 6 (incl. holidays) |
| 8 | 32.5 | 30 | 8 |
| 9 | 23 | 21.5 (+3 stretch) | 6 |
| 10 | 29 | 30 | 7 |
| 11 | 28.5 | 18 | 7 |
| **Total** | **138.5** | **120.5 (+3)** | **34 weeks ≈ end of July 2027** |

**If you must cut:**
- **Never cut** Phase 7, A8.1–A8.3, A8.5 or B8.8. Those are the pilot blockers.
- **Cut first:** B9.6, A11.4, A11.7, B11.4, A10.8. Then move B10.7 and B10.8 to Phase 12.
- **If Phase 7 slips past 8 weeks,** pilot on the friendly store with M1 only, and run Phase 8 against that store's feedback.

## Sources for the new research in this roadmap

- **Windows code signing:**
  - [Microsoft: code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
  - [Microsoft: SmartScreen reputation](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)
  - [DigiCert: EV-signed apps still show SmartScreen warnings](https://knowledge.digicert.com/alerts/ev-signed-application-showing-microsoft-defender-smartscreen-warnings)
  - [Artifact Signing overview](https://learn.microsoft.com/en-us/azure/artifact-signing/overview)
  - [Microsoft Q&A: Artifact Signing country availability](https://learn.microsoft.com/en-us/answers/questions/5834570/when-will-azure-artifact-signing-support-australia)
- **Tauri:**
  - [capabilities and remote URLs](https://v2.tauri.app/security/capabilities/)
  - [capability reference](https://v2.tauri.app/reference/acl/capability/)
  - [Windows installer and WebView2 install modes](https://v2.tauri.app/distribute/windows-installer/)
  - [WebdriverIO Tauri platform support](https://webdriver.io/ko/docs/desktop-testing/tauri/platform-support)
- **Windows versions in India:** [StatCounter, desktop Windows versions](https://gs.statcounter.com/windows-version-market-share/desktop/india)
- **TallyPrime XML integration:**
  - [XML integration](https://help.tallysolutions.com/xml-integration/)
  - [TallyPrime as a server](https://help.tallysolutions.com/tallyprime-as-server/)
  - [integration prerequisites](https://help.tallysolutions.com/pre-requisites-for-integrations/)
- **IMS APIs:**
  - [Deloitte note on IMS](https://www2.deloitte.com/content/dam/Deloitte/in/Documents/tax/in-tax-gbt-introduction-of-invoice-management-system-noexp.pdf)
  - [GSP developer list post on IMS APIs](https://groups.google.com/g/taxpro-gsp/c/6a0Ejnlwvko)
  - [GSTN IMS FAQ (Maharashtra GST)](https://www.mahagst.gov.in/public/uploads/gstnadvisory/1760533445_274%20Frequently%20Asked%20Questions%20on%20IMS.pdf)
- **GSP vendors:**
  - [ClearTax e-invoicing GSP API](https://docs.cleartax.in/cleartax-docs/e-invoicing-gsp-api/e-invoicing-gsp-api-reference)
  - [ClearTax e-way bill GSP API](https://docs.cleartax.in/cleartax-docs/e-waybill-gsp-api/e-waybill-gsp-api-reference)
  - [Masters India on API integration modes](https://www.mastersindia.co/blog/e-invoicing-api-integration-modes/)
  - [Adaequare GSP](https://www.softwaresuggest.com/adaequare-gsp)
  - [Quicko GSP](https://help.quicko.com/portal/en/kb/articles/quicko-gsp-for-platforms-and-developers)
- **ABDM:**
  - [sandbox guidelines](https://abdm.gov.in:8081/uploads/sandbox_guidelines_b39bcce23e.pdf)
  - [HIP/HIU guidelines](https://abdm.gov.in:8081/uploads/HIP_HIU_Guidelines_f85df336ec.pdf)
  - [certification process (secondary)](https://nirmitee.io/blog/abdm-certification-process-sandbox-to-production-guide/)
- **Tax law:**
  - [TDS on purchase of goods (Income Tax Dept)](https://www.incometaxindia.gov.in/w/tds-on-purchase-of-goods)
  - [TCS on goods removed from 1 Apr 2025 (FAQ)](https://taxguru.in/income-tax/tcs-sale-goods-removed-april-1-2025-faqs.html)
  - [Income-tax Act, 2025 in force from 1 Apr 2026 (press release)](https://www.incometaxindia.gov.in/documents/d/guest/press-release-income-tax-act-2025-comes-into-force-from-01-april-2026-pdf)
  - [tax portal TDS compliance FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tds-compliance)
  - [ClearTax: TDS and TCS changes from April 2026](https://cleartax.in/s/tds-and-tcs-changes-from-april-2026)
- **Everything else** (Marg features, regulation, keyboard map) is sourced in the two research files.
