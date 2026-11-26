import { NextRequest, NextResponse } from "next/server";
import { detectDistributorFormat } from "@/server/domain/import/distributor-invoice";

/**
 * Inbound Email-Bill Ingestion Webhook (C1).
 * Accepts forwarded distributor CSV / JSON attachment payloads authenticated via `x-inbound-secret`,
 * detects the distributor format, parses invoice rows, and returns structured items ready for GRN review.
 */
export async function POST(req: NextRequest) {
  const expectedSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const providedSecret = req.headers.get("x-inbound-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized inbound webhook request" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      from?: string;
      subject?: string;
      filename?: string;
      csvText?: string;
    };

    if (!body.csvText?.trim()) {
      return NextResponse.json({ error: "Missing csvText attachment payload" }, { status: 400 });
    }

    const lines = body.csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const headers = lines[0]?.split(",").map((h) => h.trim().replace(/^"|"$/g, "")) ?? [];
    const format = detectDistributorFormat(headers);

    return NextResponse.json({
      success: true,
      sender: body.from ?? null,
      subject: body.subject ?? null,
      filename: body.filename ?? "email-bill.csv",
      detectedSource: format.source,
      lineCount: Math.max(0, lines.length - 1),
      headers,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse inbound email bill" },
      { status: 400 },
    );
  }
}
