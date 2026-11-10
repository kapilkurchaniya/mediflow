import { db, schema, type DbOrTx } from "@/server/db";
import { and, desc, eq } from "drizzle-orm";
import type { AiProposalStatus, ToolProposal } from "./types";

export interface LogToolCallParams {
  tenantId: string;
  storeId?: string | null;
  userId: string;
  tool: string;
  input: string;
  arguments?: Record<string, unknown> | null;
  result?: unknown;
  model?: string;
  latencyMs?: number;
  safetyLevel?: number;
  status?: string;
}

export interface CreateProposalParams<TPayload> {
  tenantId: string;
  storeId?: string | null;
  userId: string;
  tool: string;
  intent: string;
  summary: string;
  arguments: Record<string, unknown>;
  payload: TPayload;
  safetyLevel?: number;
}

/**
 * Logs a standard AI tool execution into the ai_actions telemetry table.
 */
export async function logAiToolCall(
  params: LogToolCallParams,
  database: DbOrTx = db
): Promise<string> {
  const [record] = await database
    .insert(schema.aiActions)
    .values({
      tenantId: params.tenantId,
      storeId: params.storeId || null,
      userId: params.userId,
      channel: "chat",
      input: params.input,
      tool: params.tool,
      arguments: params.arguments || {},
      result: (params.result as Record<string, unknown>) || {},
      safetyLevel: params.safetyLevel ?? 1,
      status: params.status || "done",
      model: params.model || null,
      latencyMs: params.latencyMs || null,
    })
    .returning({ id: schema.aiActions.id });

  return record.id;
}

/**
 * Creates a two-phase Human-in-the-Loop write proposal in ai_actions.
 */
export async function createAiProposal<TPayload>(
  params: CreateProposalParams<TPayload>,
  database: DbOrTx = db
): Promise<ToolProposal<TPayload>> {
  const [record] = await database
    .insert(schema.aiActions)
    .values({
      tenantId: params.tenantId,
      storeId: params.storeId || null,
      userId: params.userId,
      channel: "chat",
      input: params.summary,
      intent: params.intent,
      tool: params.tool,
      arguments: params.arguments,
      result: { summary: params.summary, payload: params.payload },
      safetyLevel: params.safetyLevel ?? 2,
      status: "pending_confirmation",
    })
    .returning();

  return {
    type: "PROPOSAL",
    actionId: record.id,
    intent: params.intent,
    tool: params.tool,
    summary: params.summary,
    payload: params.payload,
    status: "pending_confirmation",
    createdAt: record.createdAt?.toISOString() || new Date().toISOString(),
  };
}

/**
 * Fetches an AI action ensuring strict tenant isolation.
 */
export async function getAiAction(
  actionId: string,
  tenantId: string,
  database: DbOrTx = db
) {
  return database.query.aiActions.findFirst({
    where: and(eq(schema.aiActions.id, actionId), eq(schema.aiActions.tenantId, tenantId)),
  });
}

/**
 * Updates the state of an AI proposal (confirmed, cancelled, rejected).
 */
export async function updateAiActionStatus(
  actionId: string,
  tenantId: string,
  status: AiProposalStatus,
  approvedBy?: string | null,
  resultUpdate?: Record<string, unknown>,
  database: DbOrTx = db
) {
  const [updated] = await database
    .update(schema.aiActions)
    .set({
      status,
      approvedBy: approvedBy || null,
      ...(resultUpdate ? { result: resultUpdate } : {}),
    })
    .where(and(eq(schema.aiActions.id, actionId), eq(schema.aiActions.tenantId, tenantId)))
    .returning();

  return updated;
}

