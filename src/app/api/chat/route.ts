import {
  streamText,
  convertToModelMessages,
  isStepCount,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageChunk,
} from "ai";
import { getAuthCtx, can } from "@/server/rbac";
import { checkAiRateLimit } from "@/server/ai/rate-limiter";
import { getAvailableAiTools } from "@/server/ai/registry";
import { getConfiguredModelChain, resolveLanguageModel } from "@/server/ai/models";
import { logWarn, logError } from "@/server/logging/logger";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are MediFlow, an intelligent AI copilot for Indian pharmacy management.
You have REAL-TIME access to the active store's database and can execute analytical and operational chores.
Never make up numbers, batch numbers, prices, or stock levels.

Capabilities:
- Sales Data: Summaries & details using get_sales_summary and get_sales_details.
- Stock Details & Inventory: Stock counts, expiries, MRPs using get_stock_details, check_inventory, get_stock_report.
- Purchase Data: Summaries using get_purchase_summary.
- Clinical Reference Aid: Drug interactions using check_interactions (ALWAYS include a clear disclaimer that a licensed pharmacist must verify clinical decisions; never diagnose or prescribe).
- POS Integration: Stage items into the active POS cart via add_to_bill.
- Autonomous Operational Chores (Human-in-the-Loop):
  - Add new medicines to catalogue via add_medicine (generates a PROPOSAL for human confirmation).
  - Draft Purchase Orders for low-stock items via draft_purchase_order (generates a PROPOSAL).
  - Inter-branch expiry redistribution via expiry_redistribution (generates a PROPOSAL).
  - Explain GSTR-2B discrepancies via explain_gst_mismatch.

Rules & Guardrails:
1. Tool-Only Data: Always call tools to fetch live data — NEVER fabricate numbers.
2. Data Isolation: Scoped strictly to the authenticated store and tenant; refuse cross-tenant requests.
3. Write Safety: Mutating tools return a PROPOSAL requiring explicit human confirmation before execution.
4. Formatting: Display currency in Indian Rupees (₹), quantities with both packs and loose units where relevant, and dates in IST (DD MMM YYYY).
5. Tables: Include proper newline breaks between rows in Markdown tables and cap tables at 15 rows (direct users to the dashboard page for full lists).
6. Scope: Politely decline off-topic requests unrelated to pharmacy operations, inventory, billing, accounting, GST, or clinical reference.`;

function isCommitChunk(chunk: UIMessageChunk): boolean {
  return (
    chunk.type === "text-start" ||
    chunk.type === "text-delta" ||
    chunk.type === "tool-input-start" ||
    chunk.type === "tool-input-available" ||
    chunk.type === "tool-output-available"
  );
}

export async function POST(req: Request) {
  const ctx = await getAuthCtx().catch(() => null);
  if (!ctx || !ctx.tenantId || !ctx.storeId) {
    return new Response(JSON.stringify({ error: "Unauthorized: Active store session required." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!can(ctx, "ai.use")) {
    return new Response(
      JSON.stringify({ error: "Forbidden: AI assistant access requires 'ai.use' permission." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const activeChain = getConfiguredModelChain();
  if (activeChain.length === 0) {
    return new Response(
      JSON.stringify({
        error: "AI assistant is not configured. Add GEMINI_API_KEY or GROQ_API_KEY to .env.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const rateLimit = checkAiRateLimit(ctx.tenantId, ctx.userId);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: rateLimit.reason || "AI rate limit exceeded. Please try again later.",
        retryAfter: rateLimit.resetInSeconds,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimit.resetInSeconds),
        },
      },
    );
  }

  const body = await req.json();
  let messages = body.messages;

  if (!messages) {
    if (body.role && (body.parts || body.content)) {
      messages = [body];
    } else if (Array.isArray(body)) {
      messages = body;
    } else {
      messages = [];
    }
  } else if (!Array.isArray(messages)) {
    messages = [messages];
  }

  try {
    const authorizedTools = getAvailableAiTools(ctx);
    const modelMessages = await convertToModelMessages(messages, {
      ignoreIncompleteToolCalls: true,
      tools: authorizedTools,
    });

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        let lastErrorMessage = "AI provider returned no response.";

        for (const modelEntry of activeChain) {
          let reader: ReadableStreamDefaultReader<UIMessageChunk> | null = null;
          try {
            const result = streamText({
              model: resolveLanguageModel(modelEntry),
              messages: modelMessages,
              stopWhen: isStepCount(5),
              system: SYSTEM_PROMPT,
              tools: authorizedTools,
            });

            const uiStream = result.toUIMessageStream({ sendReasoning: false });
            reader = uiStream.getReader();

            const buffered: UIMessageChunk[] = [];
            let committed = false;
            let failed = false;

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              if (value.type === "error") {
                lastErrorMessage = value.errorText || `${modelEntry.label} failed`;
                logWarn(
                  { action: "ai_chat_fallback", route: "/api/chat", tenantId: ctx.tenantId },
                  `[AI Chat] Model ${modelEntry.id} stream error (${lastErrorMessage}), trying fallback`,
                );
                failed = true;
                break;
              }

              if (!committed) {
                buffered.push(value);
                if (isCommitChunk(value)) {
                  committed = true;
                  for (const b of buffered) {
                    writer.write(b);
                  }
                  buffered.length = 0;
                }
              } else {
                writer.write(value);
              }
            }

            if (failed) {
              await reader.cancel().catch(() => {});
              continue;
            }

            // Stream completed cleanly (even if only finish/start chunks were buffered)
            if (buffered.length > 0) {
              for (const b of buffered) {
                writer.write(b);
              }
            }
            return;
          } catch (err: unknown) {
            lastErrorMessage = err instanceof Error ? err.message : String(err);
            logWarn(
              { action: "ai_chat_fallback", route: "/api/chat", tenantId: ctx.tenantId },
              `[AI Chat] Model ${modelEntry.id} threw (${lastErrorMessage}), trying fallback`,
            );
            if (reader) {
              await reader.cancel().catch(() => {});
            }
          }
        }

        writer.write({
          type: "error",
          errorText: `All AI models are currently unavailable (${lastErrorMessage}). Please try again.`,
        });
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err: unknown) {
    logError({ action: "ai_chat", route: "/api/chat", tenantId: ctx.tenantId }, "[AI Chat] Unhandled chat route error", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Failed to process AI chat request.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
