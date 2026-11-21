import { tool as createAiSdkTool, type Tool } from "ai";
import { can, type AuthCtx } from "@/server/rbac";
import type { MediFlowAiTool } from "./types";
import { logAiToolCall } from "./actions-service";
import { ALL_AI_TOOLS } from "./tools";

/**
 * Returns the dictionary of tools authorized for the user's active session.
 * Tools requiring permissions the user lacks are filtered out, so the model
 * is never prompted with tools the user cannot use.
 */
export function getAvailableAiTools(
  ctx: AuthCtx,
  tools: MediFlowAiTool[] = ALL_AI_TOOLS
): Record<string, Tool> {
  const registeredTools: Record<string, Tool> = {};

  for (const t of tools) {
    if (!can(ctx, t.permission)) {
      continue;
    }

    registeredTools[t.name] = createAiSdkTool({
      description: t.description,
      inputSchema: t.inputSchema,
      execute: async (args: unknown) => {
        const start = Date.now();
        let result: unknown;
        let status = "done";

        try {
          result = await t.execute(ctx, args as never);
          if (result && typeof result === "object" && (result as { type?: string }).type === "PROPOSAL") {
            status = "pending_confirmation";
          }
          return result;
        } catch (err: unknown) {
          status = "error";
          result = { error: err instanceof Error ? err.message : String(err) };
          return result;
        } finally {
          const isProposal =
            result &&
            typeof result === "object" &&
            (result as { type?: string; proposalId?: string }).type === "PROPOSAL" &&
            Boolean((result as { proposalId?: string }).proposalId);
          if (!isProposal) {
            const latencyMs = Date.now() - start;
            // Asynchronously log execution telemetry to ai_actions
            logAiToolCall({
              tenantId: ctx.tenantId,
              storeId: ctx.storeId,
              userId: ctx.userId,
              tool: t.name,
              input: JSON.stringify(args || {}),
              arguments: (args as Record<string, unknown>) || {},
              result,
              latencyMs,
              safetyLevel: t.isWriteAction ? 2 : 1,
              status,
            }).catch((logErr) => {
              console.error(`[AI Registry] Failed to log tool execution for ${t.name}:`, logErr);
            });
          }
        }
      },
    });
  }

  return registeredTools;
}
