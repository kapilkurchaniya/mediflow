import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");

// Parse .env manually
const env = {};
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const results = [];

// ─── 1. Gemini ───
async function testGemini() {
  const key = env.GEMINI_API_KEY;
  if (!key) return { name: "Gemini", status: "❌ MISSING", detail: "No GEMINI_API_KEY in .env" };
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Say hello in one word." }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return { name: "Gemini (gemini-3.8-flash)", status: "✅ UP", detail: `Response: "${text.trim()}"` };
    }
    const err = await res.text();
    return { name: "Gemini (gemini-3.8-flash)", status: `❌ FAILED (${res.status})`, detail: err.slice(0, 200) };
  } catch (e) {
    return { name: "Gemini (gemini-3.8-flash)", status: "❌ ERROR", detail: e.message };
  }
}

// ─── 2. Groq ───
async function testGroq() {
  const key = env.GROQ_API_KEY;
  if (!key) return { name: "Groq", status: "❌ MISSING", detail: "No GROQ_API_KEY in .env" };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      return { name: "Groq (gpt-oss-20b)", status: "✅ UP", detail: `Response: "${text.trim()}"` };
    }
    const err = await res.text();
    return { name: "Groq (gpt-oss-20b)", status: `❌ FAILED (${res.status})`, detail: err.slice(0, 200) };
  } catch (e) {
    return { name: "Groq (gpt-oss-20b)", status: "❌ ERROR", detail: e.message };
  }
}

// ─── 3. Cohere ───
async function testCohere() {
  const key = env.COHERE_API_KEY;
  if (!key) return { name: "Cohere", status: "❌ MISSING", detail: "No COHERE_API_KEY in .env" };
  try {
    const res = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "command-a-03-2025",
        messages: [{ role: "user", content: "Say hello in one word." }],
        max_tokens: 10,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const text = data.message?.content?.[0]?.text || data.text || "";
      return { name: "Cohere (command-a)", status: "✅ UP", detail: `Response: "${text.trim()}"` };
    }
    const err = await res.text();
    return { name: "Cohere (command-a)", status: `❌ FAILED (${res.status})`, detail: err.slice(0, 200) };
  } catch (e) {
    return { name: "Cohere (command-a)", status: "❌ ERROR", detail: e.message };
  }
}

// ─── 4. HuggingFace ───
async function testHuggingFace() {
  const key = env.HUGGINGFACE_API_KEY;
  if (!key) return { name: "HuggingFace", status: "❌ MISSING", detail: "No HUGGINGFACE_API_KEY in .env" };
  try {
    // Just validate the token by hitting the whoami endpoint
    const res = await fetch("https://huggingface.co/api/whoami", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) {
      const data = await res.json();
      return { name: "HuggingFace", status: "✅ UP", detail: `User: ${data.name || data.user || "valid"}` };
    }
    return { name: "HuggingFace", status: `❌ FAILED (${res.status})`, detail: "Invalid or expired token" };
  } catch (e) {
    return { name: "HuggingFace", status: "❌ ERROR", detail: e.message };
  }
}

// ─── 5. Tavily ───
async function testTavily() {
  const key = env.TAVILY_API_KEY;
  if (!key) return { name: "Tavily", status: "❌ MISSING", detail: "No TAVILY_API_KEY in .env" };
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: "test",
        search_depth: "basic",
        max_results: 1,
      }),
    });
    if (res.ok) {
      return { name: "Tavily", status: "✅ UP", detail: "Search API responding" };
    }
    const err = await res.text();
    return { name: "Tavily", status: `❌ FAILED (${res.status})`, detail: err.slice(0, 200) };
  } catch (e) {
    return { name: "Tavily", status: "❌ ERROR", detail: e.message };
  }
}

// ─── Run All ───
console.log("\n🔑 Testing API Keys for MediFlow...\n");
console.log("─".repeat(60));

const tests = [testGemini, testGroq, testCohere, testHuggingFace, testTavily];
const allResults = await Promise.all(tests.map((t) => t()));

for (const r of allResults) {
  console.log(`\n  ${r.status}  ${r.name}`);
  console.log(`       ${r.detail}`);
}

console.log("\n" + "─".repeat(60));
const upCount = allResults.filter((r) => r.status.includes("✅")).length;
const downCount = allResults.length - upCount;
console.log(`\n  Summary: ${upCount} UP / ${downCount} DOWN out of ${allResults.length} services\n`);
