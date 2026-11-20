import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, generateText } from "ai";
import type { z } from "zod";
import { getGeminiApiKey } from "@/server/ai/models";

export const OCR_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const SUPPORTED_OCR_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function detectOcrMimeType(file: File, bytes: Buffer): string | null {
  // Check magic bytes first for reliable verification
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  const declared = file.type?.toLowerCase();
  if (declared && SUPPORTED_OCR_MIME_TYPES.has(declared)) {
    return declared;
  }
  return null;
}

export async function readAndValidateOcrFile(formData: FormData, fieldName = "file"): Promise<{
  bytes: Buffer;
  mimeType: string;
  fileName: string;
}> {
  const entry = formData.get(fieldName);
  if (!(entry instanceof File)) {
    throw new Error("No file uploaded.");
  }
  if (entry.size === 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (entry.size > OCR_MAX_BYTES) {
    throw new Error("File exceeds the 10 MB OCR size limit.");
  }

  const arrayBuffer = await entry.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const mimeType = detectOcrMimeType(entry, bytes);

  if (!mimeType) {
    throw new Error("Unsupported file format. Upload a PDF, JPG, PNG, or WebP image.");
  }

  return { bytes, mimeType, fileName: entry.name || "document" };
}

function getOcrModel() {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in .env. Please add it to use OCR.");
  }
  const google = createGoogleGenerativeAI({ apiKey });
  return google("gemini-2.5-flash");
}

export async function runStructuredOcr<TSchema extends z.ZodTypeAny>(params: {
  bytes: Buffer;
  mimeType: string;
  prompt: string;
  schema: TSchema;
}): Promise<z.infer<TSchema>> {
  const model = getOcrModel();
  const contentPart =
    params.mimeType === "application/pdf"
      ? { type: "file" as const, data: params.bytes, mediaType: "application/pdf" as const }
      : { type: "image" as const, image: params.bytes, mediaType: params.mimeType };

  const { object } = await generateObject({
    model,
    schema: params.schema,
    messages: [
      {
        role: "user",
        content: [contentPart, { type: "text", text: params.prompt }],
      },
    ],
  });

  return object as z.infer<TSchema>;
}

export async function runTextOcr(params: {
  bytes: Buffer;
  mimeType: string;
  prompt: string;
}): Promise<string> {
  const model = getOcrModel();
  const contentPart =
    params.mimeType === "application/pdf"
      ? { type: "file" as const, data: params.bytes, mediaType: "application/pdf" as const }
      : { type: "image" as const, image: params.bytes, mediaType: params.mimeType };

  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content: [contentPart, { type: "text", text: params.prompt }],
      },
    ],
  });

  return text;
}
