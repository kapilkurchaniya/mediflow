"use server";

import { generateAICompletion, searchTavily } from "@/server/ai";
import { getCurrentSession } from "@/server/auth";
import { parsePackaging, type LooseUnit, type PackUnit } from "@/lib/packaging";
import { normalizeDrugSchedule, scheduleRequiresRx, type DrugSchedule } from "@/lib/schedule";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp } from "@/lib/regulatory";

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
  source: string; // which model or search provided it
}

interface MasterDictEntry {
  match: string[];
  manufacturer: string;
  category: string;
  genericName: string;
  schedule: DrugSchedule;
  hsn: string;
  gstRateBp: number;
  mrp: number;
  unitsPerPack: number;
  packUnit: PackUnit;
  looseUnit: LooseUnit;
}

const PHARMA_MASTER_DICT: MasterDictEntry[] = [
  { match: ["augmentin"], manufacturer: "GlaxoSmithKline", category: "Antibiotic", genericName: "Amoxycillin 500mg + Clavulanic Acid 125mg", schedule: "H1", hsn: "300410", gstRateBp: 500, mrp: 22350, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["pan-d", "pand"], manufacturer: "Alkem Laboratories", category: "Gastrointestinal", genericName: "Pantoprazole 40mg + Domperidone 30mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 19900, unitsPerPack: 15, packUnit: "strip", looseUnit: "capsule" },
  { match: ["pantoprazole", "pantocid"], manufacturer: "Sun Pharma", category: "Gastrointestinal", genericName: "Pantoprazole 40mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 9500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["azithral", "azithromycin"], manufacturer: "Alembic Pharmaceuticals", category: "Antibiotic", genericName: "Azithromycin 500mg", schedule: "H", hsn: "300420", gstRateBp: 500, mrp: 13200, unitsPerPack: 5, packUnit: "strip", looseUnit: "tablet" },
  { match: ["amoxicillin"], manufacturer: "Cipla", category: "Antibiotic", genericName: "Amoxycillin 500mg", schedule: "H", hsn: "300410", gstRateBp: 500, mrp: 8000, unitsPerPack: 10, packUnit: "strip", looseUnit: "capsule" },
  { match: ["glycomet-gp", "glycomet gp"], manufacturer: "USV", category: "Antidiabetic", genericName: "Glimepiride + Metformin", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 13210, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["glycomet", "metformin"], manufacturer: "USV", category: "Antidiabetic", genericName: "Metformin 500mg", schedule: "G", hsn: "30049099", gstRateBp: 500, mrp: 5500, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["amlong", "amlodipine"], manufacturer: "Micro Labs", category: "Cardiovascular & BP", genericName: "Amlodipine", schedule: "H", hsn: "30049072", gstRateBp: 500, mrp: 3500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["olmezest"], manufacturer: "Sun Pharma", category: "Cardiovascular & BP", genericName: "Olmesartan Medoxomil", schedule: "H", hsn: "30049079", gstRateBp: 500, mrp: 28120, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["onglyza"], manufacturer: "AstraZeneca", category: "Antidiabetic", genericName: "Saxagliptin 5mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 44560, unitsPerPack: 14, packUnit: "strip", looseUnit: "tablet" },
  { match: ["starpress"], manufacturer: "Lupin", category: "Cardiovascular & BP", genericName: "Metoprolol Succinate", schedule: "H", hsn: "30049074", gstRateBp: 500, mrp: 9500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["vildaprime"], manufacturer: "Primus", category: "Antidiabetic", genericName: "Vildagliptin 50mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 13305, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["vozuca"], manufacturer: "Dr. Reddy's", category: "Antidiabetic", genericName: "Voglibose 0.3mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 15660, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["atorvastatin", "atorva"], manufacturer: "Sun Pharma", category: "Cardiovascular & BP", genericName: "Atorvastatin 10mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 10500, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["telma", "telmisartan"], manufacturer: "Glenmark Pharmaceuticals", category: "Cardiovascular & BP", genericName: "Telmisartan 40mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 21000, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["allegra", "fexofenadine"], manufacturer: "Sanofi India", category: "Antihistamine & Allergy", genericName: "Fexofenadine 120mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrp: 24200, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["dolo", "paracetamol", "calpol"], manufacturer: "Micro Labs", category: "Analgesic & Antipyretic", genericName: "Paracetamol 650mg", schedule: "none", hsn: "30049099", gstRateBp: 500, mrp: 3500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
];

export async function enrichMedicineDetails(req: EnrichMedicineRequest): Promise<EnrichMedicineResponse | null> {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  const lower = (req.medicineName || "").toLowerCase();

  // Instant Pharmacopeia Master Dictionary lookup
  const dictHit = PHARMA_MASTER_DICT.find((entry) => entry.match.some((k) => lower.includes(k)));
  if (dictHit) {
    return {
      manufacturer: dictHit.manufacturer,
      category: dictHit.category,
      genericName: dictHit.genericName,
      schedule: dictHit.schedule,
      rxRequired: scheduleRequiresRx(dictHit.schedule),
      hsn: dictHit.hsn,
      gstRateBp: dictHit.gstRateBp,
      mrp: dictHit.mrp,
      unitsPerPack: dictHit.unitsPerPack,
      packUnit: dictHit.packUnit,
      looseUnit: dictHit.looseUnit,
      source: "Pharma Master Dictionary",
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

    return {
      manufacturer: data.manufacturer || "Unknown",
      category: data.category || "OTC & Wellness",
      genericName: typeof data.genericName === "string" ? data.genericName.trim() : "",
      schedule,
      rxRequired: scheduleRequiresRx(schedule),
      hsn: typeof data.hsn === "string" && data.hsn.trim() ? data.hsn.trim() : "30049099",
      gstRateBp,
      mrp: data.mrp ? Math.round(parseFloat(data.mrp) * 100) : 0,
      unitsPerPack: sanitized.unitsPerPack,
      packUnit: sanitized.packUnit,
      looseUnit: sanitized.looseUnit,
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
