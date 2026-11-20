import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

export interface AiModelEntry {
  provider: "google" | "groq";
  id: string;
  label: string;
}

export function getGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ""
  );
}

export function getGroqApiKey(): string {
  return process.env.GROQ_API_KEY?.trim() || "";
}

export function getConfiguredModelChain(): AiModelEntry[] {
  const geminiKey = getGeminiApiKey();
  const groqKey = getGroqApiKey();
  const primaryOverride = process.env.AI_PRIMARY_MODEL?.trim();

  const chain: AiModelEntry[] = [];

  if (geminiKey) {
    if (primaryOverride && primaryOverride !== "gemini-2.5-flash") {
      chain.push({ provider: "google", id: primaryOverride, label: primaryOverride });
    }
    chain.push({ provider: "google", id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" });
  }

  if (groqKey) {
    chain.push({ provider: "groq", id: "openai/gpt-oss-120b", label: "Groq GPT-OSS 120B" });
    chain.push({ provider: "groq", id: "openai/gpt-oss-20b", label: "Groq GPT-OSS 20B" });
  }

  return chain;
}

export function resolveLanguageModel(entry: AiModelEntry): LanguageModel {
  if (entry.provider === "google") {
    const google = createGoogleGenerativeAI({ apiKey: getGeminiApiKey() });
    return google(entry.id);
  }
  const groq = createGroq({ apiKey: getGroqApiKey() });
  return groq(entry.id);
}

