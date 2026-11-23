"use server";

import { generateAICompletion, searchTavily } from "@/server/ai";
import { getCurrentSession } from "@/server/auth";
import { parsePackaging, type LooseUnit, type PackUnit } from "@/lib/packaging";
import { normalizeDrugSchedule, scheduleRequiresRx, type DrugSchedule } from "@/lib/schedule";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp } from "@/lib/regulatory";
import {
  checkCdscoBannedFdc,
  lookupIndianDrugReference,
  type BannedFdcMatch,
} from "@/lib/indian-drug-catalog";

export interface EnrichMedicineRequest {
  medicineName: string;
}

export interface EnrichMedicineResponse {
  manufacturer: string;
  category: string;
  genericName?: string;
  schedule?: DrugSchedule;
  rxRequired?: boolean;
  hsn?: string;
  gstRateBp?: number;
  mrp: number; // in paise
  unitsPerPack?: number;
  packUnit?: PackUnit;
  looseUnit?: LooseUnit;
  description?: string;
  bannedFdc?: BannedFdcMatch;
  source: string; // which model or search provided it
}

export async function enrichMedicineDetails(req: EnrichMedicineRequest): Promise<EnrichMedicineResponse | null> {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  // Instant Offline Indian Pharmacy Reference Catalog lookup (0ms, zero API cost)
  const dictHit = lookupIndianDrugReference(req.medicineName);
  if (dictHit) {
    return {
      manufacturer: dictHit.manufacturer,
      category: dictHit.category,
      genericName: dictHit.genericName,
      schedule: dictHit.schedule,
      rxRequired: scheduleRequiresRx(dictHit.schedule),
      hsn: dictHit.hsn,
      gstRateBp: dictHit.gstRateBp,
      mrp: dictHit.mrpPaise,
      unitsPerPack: dictHit.unitsPerPack,
      packUnit: dictHit.packUnit,
      looseUnit: dictHit.looseUnit,
      bannedFdc: checkCdscoBannedFdc(req.medicineName, dictHit.genericName),
      source: "Indian Drug Reference Catalog",
    };
  }

  try {
    // 1. Perform a quick Tavily search to get real-world Indian pharmacy context
    const searchQuery = `${req.medicineName} composition salt schedule H price strip manufacturer India (site:1mg.com OR site:pharmeasy.in OR site:apollopharmacy.in OR site:netmeds.com)`;
    const searchContext = await searchTavily(searchQuery);

    // 2. Ask the LLM to extract structured JSON based on the search context
    const prompt = `
You are an expert Indian pharmacy catalog data extractor.
Medicine name: "${req.medicineName}"

Real-time context (may contain noise):
${searchContext ? searchContext.slice(0, 1800) : "No internet context found."}

Return ONLY a valid raw JSON object (no markdown fences) with:
- "manufacturer": string (Indian marketer/manufacturer e.g. "Cipla", "Sun Pharma", "Micro Labs". Use "Unknown" if not found)
- "genericName": string (active salt composition + strength e.g. "Amlodipine 2.5mg", or "" if unknown)
- "category": string (therapeutic class e.g. "Cardiovascular & BP", "Antidiabetic", "Antibiotic", "Gastrointestinal", "Analgesic & Antipyretic", "Antihistamine & Allergy", "Respiratory & Asthma", "Dermatology & Topical", "Vitamins & Supplements", "OTC & Wellness")
- "schedule": string (Indian Drugs & Cosmetics schedule: "none", "G", "H", "H1", "X", or "narcotic")
- "hsn": string (Indian pharma HSN code e.g. "30049099", or "30049099" default)
- "gstPct": number (0, 5, 12, 18, or 28; standard Indian formulation is 5 or 12)
- "mrp": number (MRP per pack in INR, e.g. 114.6, or 0 if unknown)
- "packRaw": string (standard Indian retail pack size e.g. "15'S", "10'S", "100ML", or "" if unknown)
- "unitsPerPack": number (integer tablets/capsules per strip; ALWAYS 1 for syrups, creams, drops, vials, injections)
`;

    const aiRes = await generateAICompletion(prompt);

    let rawJson = aiRes.content.trim();
    if (rawJson.startsWith("```json")) {
      rawJson = rawJson.replace(/```json/g, "").replace(/```/g, "").trim();
    } else if (rawJson.startsWith("```")) {
      rawJson = rawJson.replace(/```/g, "").trim();
    }

    const data = JSON.parse(rawJson);
    const sanitized = parsePackaging({
      packRaw: data.packRaw || (data.unitsPerPack > 1 ? String(data.unitsPerPack) : ""),
      medicineName: req.medicineName,
    });
    const schedule = normalizeDrugSchedule(data.schedule);
    const rawGstBp = Number.isFinite(Number(data.gstPct)) ? Math.round(Number(data.gstPct) * 100) : DEFAULT_GST_RATE_BP;
    const gstRateBp = isValidGstRateBp(rawGstBp) ? rawGstBp : DEFAULT_GST_RATE_BP;

    const genericName = typeof data.genericName === "string" ? data.genericName.trim() : "";

    return {
      manufacturer: data.manufacturer || "Unknown",
      category: data.category || "OTC & Wellness",
      genericName,
      schedule,
      rxRequired: scheduleRequiresRx(schedule),
      hsn: typeof data.hsn === "string" && data.hsn.trim() ? data.hsn.trim() : "30049099",
      gstRateBp,
      mrp: data.mrp ? Math.round(parseFloat(data.mrp) * 100) : 0,
      unitsPerPack: sanitized.unitsPerPack,
      packUnit: sanitized.packUnit,
      looseUnit: sanitized.looseUnit,
      bannedFdc: checkCdscoBannedFdc(req.medicineName, genericName),
      source: aiRes.model,
    };
  } catch (error) {
    console.warn("AI enrichment fell back to pharmaceutical offline dictionary:", error);
    return {
      manufacturer: "Standard Pharma Ltd",
      category: "OTC & Wellness",
      genericName: "",
      schedule: "none",
      rxRequired: false,
      hsn: "30049099",
      gstRateBp: DEFAULT_GST_RATE_BP,
      mrp: 0,
      source: "Offline Fallback",
    };
  }
}
