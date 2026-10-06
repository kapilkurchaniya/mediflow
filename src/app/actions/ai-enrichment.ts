"use server";

import { generateAICompletion, searchTavily } from "@/server/ai";
import { getCurrentSession } from "@/server/auth";

export interface EnrichMedicineRequest {
  medicineName: string;
}

export interface EnrichMedicineResponse {
  manufacturer: string;
  category: string;
  mrp: number; // in paise
  description?: string;
  source: string; // which model or search provided it
}

export async function enrichMedicineDetails(req: EnrichMedicineRequest): Promise<EnrichMedicineResponse | null> {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  try {
    // 1. Perform a quick Tavily search to get real-world context for this medicine
    const searchQuery = `${req.medicineName} price manufacturer (site:1mg.com OR site:pharmeasy.in OR site:apollopharmacy.in OR site:netmeds.com)`;
    const searchContext = await searchTavily(searchQuery);

    // 2. Ask the LLM to extract structured JSON based on the search context
    const prompt = `
You are an expert pharmacy data extractor. 
I have a medicine named: "${req.medicineName}"

Here is some real-time internet context about it (may contain noise):
${searchContext ? searchContext.slice(0, 1500) : "No internet context found."}

Return a valid JSON object with the following fields:
- "manufacturer": string (company name, e.g. "Cipla", "Sun Pharma". Use "Unknown" if not found)
- "category": string (e.g. "Analgesic", "Antibiotic", "Syrup". Use "General" if not found)
- "mrp": number (estimated maximum retail price in Indian Rupees as an integer/float, e.g. 50.5. If unknown, use 0)

Do NOT include any markdown formatting like \`\`\`json. Return ONLY the raw JSON object.
`;

    const aiRes = await generateAICompletion(prompt);
    
    // Clean up response if it contains markdown (models sometimes ignore instructions)
    let rawJson = aiRes.content.trim();
    if (rawJson.startsWith("\`\`\`json")) {
        rawJson = rawJson.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    } else if (rawJson.startsWith("\`\`\`")) {
        rawJson = rawJson.replace(/\`\`\`/g, "").trim();
    }

    const data = JSON.parse(rawJson);
    
    return {
      manufacturer: data.manufacturer || "Unknown",
      category: data.category || "General",
      mrp: data.mrp ? Math.round(parseFloat(data.mrp) * 100) : 0, // Convert to paise
      source: aiRes.model
    };

  } catch (error) {
    console.error("Failed to enrich medicine:", error);
    return null;
  }
}
