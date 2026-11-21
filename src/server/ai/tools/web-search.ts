import { z } from "zod";
import type { MediFlowAiTool } from "../types";

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export const webSearchTool: MediFlowAiTool<{
  query: string;
  maxResults?: number;
}> = {
  name: "web_search",
  description:
    "Search the live internet via Tavily for up-to-date information such as CDSCO drug alerts, GST notifications, medicine compositions/monographs, manufacturer details, or current medical/regulatory updates.",
  permission: "ai.use",
  isWriteAction: false,
  inputSchema: z.object({
    query: z.string().min(2).describe("Search query to look up on the internet"),
    maxResults: z.number().int().min(1).max(8).optional().describe("Maximum web results to return (default 5)"),
  }),
  execute: async (_ctx, { query, maxResults = 5 }) => {
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (!apiKey) {
      return {
        error: "Internet search is not configured. Add TAVILY_API_KEY to enable live web search.",
      };
    }

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: query.trim(),
        search_depth: "basic",
        include_answer: true,
        max_results: maxResults,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        error: `Tavily search failed (${res.status}): ${errText.slice(0, 200) || "Unknown error"}`,
      };
    }

    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };

    const results: WebSearchResultItem[] = (data.results ?? []).slice(0, maxResults).map((r) => ({
      title: r.title || "Source",
      url: r.url || "",
      snippet: (r.content || "").slice(0, 400),
    }));

    return {
      query: query.trim(),
      answer: data.answer || "",
      results,
    };
  },
};

