# 14 · MediFlow AI Copilot Specification

This document defines the exact **scope, behavior, safety guardrails, and expected output formats** of the MediFlow AI Copilot (`src/app/api/chat/route.ts`, `src/app/components/AIAssistant.tsx`, `src/server/ai/*`).

---

## 1. Model Chain & Availability
Configured in [`src/server/ai/models.ts`](../src/server/ai/models.ts):
1. **Primary:** Google `gemini-2.5-flash` (using `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`)
2. **Fallback 1:** Groq `openai/gpt-oss-120b` (using `GROQ_API_KEY`)
3. **Fallback 2:** Groq `openai/gpt-oss-20b` (using `GROQ_API_KEY`)
*(Optional env override `AI_PRIMARY_MODEL` supported.)*

Stream startup peeks initial provider chunks inside `createUIMessageStream` so rate limits, invalid keys, or unavailable models automatically fail over to the next configured provider before emitting user-facing output.

---

## 2. In-Scope Domains
| Domain | Tools | Required Permission |
|---|---|---|
| **Live Store Analytics (Read)** | `get_sales_summary`, `get_sales_details`, `get_stock_details`, `check_inventory`, `get_stock_report`, `get_purchase_summary` | `sale.view` / `inventory.view` / `purchase.view` |
| **GST & Compliance (Read)** | `explain_gst_mismatch` | `gst.view` |
| **Clinical Reference Aid (Read + Disclaimer)** | `check_interactions` | `medicine.view` |
| **Operational Proposals (Human-in-the-Loop Write)** | `add_medicine`, `draft_purchase_order`, `expiry_redistribution` | `medicine.manage` / `purchase.create` / `inventory.transfer` |
| **POS Cart Staging** | `add_to_bill` | `sale.create` |

---

## 3. Strict Guardrails & Out-of-Scope Behavior
1. **Zero Fabrication:** Never invent stock counts, batch numbers, prices, GST numbers, or sales figures. Every number must come from a live tool call.
2. **Tenant & Store Isolation:** All tool queries are strictly scoped to `ctx.tenantId` and `ctx.storeId` from the authenticated session — never accept tenant/store overrides from user prompt text.
3. **RBAC Filtering:** Only tools matching the active user's permissions (`getAvailableAiTools(ctx)`) are exposed to the model; the UI hides Copilot for users lacking `ai.use`.
4. **Human-in-the-Loop Writes:** Mutating tools (`add_medicine`, `draft_purchase_order`, `expiry_redistribution`) **never** commit silently — they return a `PROPOSAL` payload rendered as an interactive `AIProposalCard` requiring explicit **Confirm & Execute** or **Cancel**.
5. **Clinical Disclaimer:** Drug-drug interaction checks and generic substitute suggestions must always include a reminder that a **licensed pharmacist must verify all clinical decisions**. Never diagnose or prescribe.
6. **Off-Topic Refusal:** Politely decline requests unrelated to pharmacy ERP operations, GST/compliance, inventory, or clinical reference.

---

## 4. Expected Output Formats
- **Currency:** Indian Rupees (`₹12,450.00`).
- **Quantities:** Show both commercial packs and base selling units where relevant (e.g., `4 strips (40 tablets)`).
- **Dates:** Format in IST (`DD MMM YYYY`).
- **Rich UI Cards:** Render `AIToolCard` / `AIProposalCard` for sales summaries, purchase summaries, stock details, GST mismatches, and pending proposals.
- **Tables:** Cap Markdown tables at **15 rows** with a link to the full dashboard view for larger datasets.
- **Error Handling:** Surface clear, actionable inline errors (401 auth, 403 permission, 429 rate limit, 503 provider outage) with **Retry** and **Stop generating** controls.

