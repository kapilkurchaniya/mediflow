import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfiguredModelChain, getGeminiApiKey, getGroqApiKey } from "@/server/ai/models";

describe("AI Model Chain Configuration", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.AI_PRIMARY_MODEL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns empty chain when no keys are configured", () => {
    expect(getConfiguredModelChain()).toEqual([]);
  });

  it("trims GEMINI_API_KEY and falls back to GOOGLE_GENERATIVE_AI_API_KEY", () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "  AIzaTestKey  ";
    expect(getGeminiApiKey()).toBe("AIzaTestKey");

    process.env.GEMINI_API_KEY = "  AQ.PrimaryKey  ";
    expect(getGeminiApiKey()).toBe("AQ.PrimaryKey");
  });

  it("builds Gemini 2.5 Flash primary + Groq fallbacks when both keys are set", () => {
    process.env.GEMINI_API_KEY = "test-gem";
    process.env.GROQ_API_KEY = "  test-groq  ";

    expect(getGroqApiKey()).toBe("test-groq");
    expect(getConfiguredModelChain()).toEqual([
      { provider: "google", id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { provider: "groq", id: "openai/gpt-oss-120b", label: "Groq GPT-OSS 120B" },
      { provider: "groq", id: "openai/gpt-oss-20b", label: "Groq GPT-OSS 20B" },
    ]);
  });

  it("skips unconfigured providers", () => {
    process.env.GROQ_API_KEY = "only-groq";
    expect(getConfiguredModelChain().map((m) => m.provider)).toEqual(["groq", "groq"]);
  });
});

