# Partner Action Guide: Resolving Whole-Repo Lint Debt (Task A0.6 / B0.5)

**To:** Kapil (`kapilkurchaniya` / Lane B Owner)  
**From:** Lane A  
**Subject:** How to clear the remaining 72 lint errors to unblock and mark **Task A0.6** as 100% complete (`[x]`) in `ROADMAP.md`.

---

## 1. Why Task A0.6 is Currently Unmarked (`[ ]`)

In **Phase 0**, Task A0.6 is:
> `#### A0.6 Lint debt → make lint blocking ⏱ 1 day (split with Lane B)`

- **Lane A's share is 100% finished:** Every file owned by Lane A is completely lint error-free, and we established the ratchet script `scripts/lint-strict.mjs` (`npm run lint:strict`) which already blocks CI on all clean paths.
- **Why A0.6 is still `[ ]`:** The root command `npm run lint` (`eslint`) still detects **exactly 72 errors** located in files owned by **Lane B** (AI Assistant, Chat API, Compliance, Customer Groups, Orders, Reports, and WhatsApp).
- Because these 72 errors exist, `.github/workflows/ci.yml` still has `continue-on-error: true` on the whole-repo lint step.
- Once you resolve these 72 errors, `npm run lint` will report **0 errors**, we will delete the ratchet script, make whole-repo lint blocking in CI, and mark **`[x] A0.6`** in `ROADMAP.md`!

---

## 2. Breakdown of the 72 Errors by File

All 72 errors are straightforward TypeScript typing and ESLint rule violations:

### A. AI Assistant & Chat API (52 errors)
1. **`src/app/api/chat/route.ts` (32 errors):**
   - Line 1: Remove `@ts-nocheck`.
   - Replace `@ts-ignore` with `@ts-expect-error` (or proper types).
   - Replace `any` parameters with explicit types (e.g. `Record<string, unknown>`, `unknown`, or the actual Drizzle/SDK types).
2. **`src/app/components/AIAssistant.tsx` (20 errors):**
   - Replace explicit `any` on event handlers, messages, and state callbacks with proper types.

### B. Dashboard Pages & Clients (14 errors)
3. **`src/app/dashboard/compliance/` (7 errors):**
   - `doctors/page.tsx` (Line 15): Replace `any` in page props/data.
   - `narcotics/page.tsx` (Line 22): Replace `any`.
   - `page.tsx` (Line 19): Replace `any`.
   - `prescriptions/page.tsx` (Line 18): Replace `any`.
   - `prescriptions/PrescriptionsView.tsx` (Lines 120, 122): Replace `any`.
   - `schedule-h/page.tsx` (Line 22): Replace `any`.
   - `schedule-h1/page.tsx` (Line 22): Replace `any`.
4. **`src/app/dashboard/customers/groups/CustomerGroupsClient.tsx` (4 errors):**
   - Lines 50, 51, 245, 295: Replace `any` on state and customer records with the schema type (`schema.customers.$inferSelect`).
5. **`src/app/dashboard/orders/` (3 errors):**
   - `OrdersClient.tsx` (Lines 30, 150): Replace `any`.
   - `orders/[id]/page.tsx` (Line 104): Replace `any`.

### C. Server Domain Services (6 errors)
6. **`src/server/domain/compliance.ts` (Line 555):** Replace `any`.
7. **`src/server/domain/gst.ts` (Line 1178):** Replace `any`.
8. **`src/server/domain/whatsapp.ts` (Line 217):** Replace `any`.
9. **`src/server/domain/reports.ts` (Lines 393, 396):**
   - `digitalSales` and `creditorPayments` are never reassigned: change `let` to `const` (`prefer-const`).

---

## 3. How to Fix and Verify

1. Run ESLint targeting only the failing paths:
   ```bash
   npx eslint --quiet src/app/api/chat src/app/components/AIAssistant.tsx src/app/dashboard/customers src/app/dashboard/orders src/app/dashboard/compliance src/server/domain/compliance.ts src/server/domain/gst.ts src/server/domain/reports.ts src/server/domain/whatsapp.ts
   ```
2. Auto-fix simple formatting issues:
   ```bash
   npx eslint --fix src/server/domain/reports.ts
   ```
3. Once the 72 errors are fixed, run the whole-repo lint:
   ```bash
   npm run lint
   ```
   *(It should output 0 errors)*.
4. When `npm run lint` is clean:
   - In `.github/workflows/ci.yml`, change the lint step to blocking.
   - Delete `scripts/lint-strict.mjs`.
   - Tick **`[x] A0.6`** in `ROADMAP.md`!
