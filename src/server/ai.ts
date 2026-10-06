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
    return data.answer || data.results?.map((r: any) => r.content).join("\n") || "";
  } catch (e) {
    console.error("Tavily search failed", e);
    return "";
  }
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("No Gemini key");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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
      model: "llama3-8b-8192",
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
  const res = await fetch("https://api.cohere.com/v1/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "command",
      prompt,
      max_tokens: 1000,
      temperature: 0.2
    })
  });
  if (!res.ok) throw new Error(`Cohere failed: ${await res.text()}`);
  const data = await res.json();
  return data.generations[0].text;
}

/**
 * Generates an AI completion using Gemini -> Groq -> Cohere fallback strategy.
 */
export async function generateAICompletion(prompt: string): Promise<AIResponse> {
  try {
    const content = await callGemini(prompt);
    return { content, model: "gemini" };
  } catch (e: any) {
    console.warn(e.message);
    try {
      const content = await callGroq(prompt);
      return { content, model: "groq" };
    } catch (e2: any) {
      console.warn(e2.message);
      const content = await callCohere(prompt);
      return { content, model: "cohere" };
    }
  }
}
