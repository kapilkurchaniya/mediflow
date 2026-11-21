export interface AIResponse {
  content: string;
  model: string;
}

export async function searchTavily(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return "";

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
      }),
    });
    
    if (!res.ok) {
        console.error("Tavily error:", await res.text());
        return "";
    }
    
    const data = await res.json();
    return data.answer || data.results?.map((r: { content: string }) => r.content).join("\n") || "";
  } catch (e) {
    console.error("Tavily search failed", e);
    return "";
  }
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("No Gemini key");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  if (!res.ok) throw new Error(`Gemini failed: ${await res.text()}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

async function callGroq(prompt: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("No Groq key");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });
  if (!res.ok) throw new Error(`Groq failed: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callCohere(prompt: string): Promise<string> {
  const apiKey = process.env.COHERE_API_KEY?.trim();
  if (!apiKey) throw new Error("No Cohere key");
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "command-a-03-2025",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.2
    })
  });
  if (!res.ok) throw new Error(`Cohere failed: ${await res.text()}`);
  const data = await res.json();
  return data.message?.content?.[0]?.text || data.text || "";
}

const PROVIDERS: { name: string; fn: (p: string) => Promise<string> }[] = [
  { name: "cohere", fn: callCohere },
  { name: "gemini", fn: callGemini },
  { name: "groq", fn: callGroq },
];

const MAX_RETRIES = 3;

/**
 * Generates an AI completion using Gemini -> Groq -> Cohere fallback strategy.
 * Each provider is attempted up to MAX_RETRIES times before falling to the next.
 */
export async function generateAICompletion(prompt: string): Promise<AIResponse> {
  let lastError: Error | null = null;

  for (const provider of PROVIDERS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[AI] Trying ${provider.name} (attempt ${attempt}/${MAX_RETRIES})`);
        const content = await provider.fn(prompt);
        return { content, model: provider.name };
      } catch (e: unknown) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(`[AI] ${provider.name} attempt ${attempt} failed: ${lastError.message}`);
        // If the upstream service is temporarily overloaded (503 / 429), fail over to the next provider immediately
        if (lastError.message.includes("503") || lastError.message.includes("high demand") || lastError.message.includes("429")) {
          console.warn(`[AI] ${provider.name} unavailable (overloaded), falling over immediately`);
          break;
        }
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    console.warn(`[AI] All ${MAX_RETRIES} attempts exhausted for ${provider.name}`);
  }

  throw lastError || new Error("All AI providers failed");
}
