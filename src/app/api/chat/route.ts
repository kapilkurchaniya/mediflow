import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { streamText, convertToModelMessages, isStepCount } from "ai";
import { getAuthCtx, can } from "@/server/rbac";
import { checkAiRateLimit } from "@/server/ai/rate-limiter";
import { getAvailableAiTools } from "@/server/ai/registry";

export const maxDuration = 60;

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

// Model fallback chain: each entry is tried up to MAX_RETRIES times
const MODEL_CHAIN = [
  { provider: "google" as const, id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
  { provider: "google" as const, id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { provider: "groq" as const, id: "openai/gpt-oss-20b", label: "Groq GPT-OSS 20B" },
];
const MAX_RETRIES = 3;

function getModel(entry: (typeof MODEL_CHAIN)[number]) {
  if (entry.provider === "google") return google(entry.id);
  if (entry.provider === "groq") return groq(entry.id);
  throw new Error("Unknown AI provider");
}

const SYSTEM_PROMPT = `You are MediFlow, an intelligent AI copilot for pharmacy management.
You have REAL-TIME access to the store's database and can execute analytical and operational chores.
Never make up numbers or guess values.

Capabilities:
- Sales Data: Summaries & details using get_sales_summary and get_sales_details.
- Stock Details & Inventory: Stock counts, expiries, MRPs using get_stock_details, check_inventory, get_stock_report.
- Purchase Data: Summaries using get_purchase_summary.
- Clinical Safety: Interactions using check_interactions.
- POS Integration: Add items to current bill via add_to_bill.
- Autonomous Operational Chores:
  - Add new medicines to catalogue via add_medicine (generates proposal for human confirmation).
  - Draft Purchase Orders for low-stock items via draft_purchase_order (generates proposal).
  - Inter-branch expiry redistribution via expiry_redistribution (generates proposal).
  - Explain GSTR-2B discrepancies via explain_gst_mismatch.

Rules:
1. Always use tools to fetch live data — NEVER fabricate numbers.
2. Data Isolation: Scoped strictly to the authenticated store and tenant.
3. Write Safety: Mutating tools return a PROPOSAL that requires human confirmation before execution.
4. Currency: Financial values are in Indian Rupees (₹).
5. Tables: Include proper newline breaks between rows in Markdown tables.`;

export async function POST(req: Request) {
  const ctx = await getAuthCtx().catch(() => null);
  if (!ctx || !ctx.tenantId || !ctx.storeId) {
    return new Response(JSON.stringify({ error: "Unauthorized: Active store session required." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!can(ctx, "ai.use")) {
    return new Response(JSON.stringify({ error: "Forbidden: AI assistant access requires 'ai.use' permission." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enforce sliding-window rate limit
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
      }
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
    const modelMessages = await convertToModelMessages(messages);
    const authorizedTools = getAvailableAiTools(ctx);

    const streamOptions = {
      messages: modelMessages,
      stopWhen: isStepCount(5),
      system: SYSTEM_PROMPT,
      tools: authorizedTools,
    };

    let lastError: Error | null = null;

    for (const modelEntry of MODEL_CHAIN) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = streamText({
            ...streamOptions,
            model: getModel(modelEntry),
          });
          return result.toUIMessageStreamResponse();
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        error: "All AI models are currently unavailable. Please try again later.",
        details: lastError?.message,
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(err instanceof Error ? err.stack || err.message : String(err), { status: 500 });
  }
}
