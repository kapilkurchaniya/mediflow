/**
 * Offline Indian Pharmacy Reference Drug Catalog & CDSCO Banned FDC Watchlist.
 *
 * Provides instant, zero-cost enrichment for high-velocity Indian pharmacy brands
 * (composition, manufacturer, therapeutic category, statutory schedule H/H1/X/G,
 * HSN, GST 2.0 rate, and standard retail strip sizing) and flags CDSCO-prohibited
 * Fixed Dose Combinations (FDCs) before they reach the POS counter.
 */

import type { DrugSchedule } from "@/lib/schedule";
import type { LooseUnit, PackUnit } from "@/lib/packaging";

export interface IndianDrugReference {
  match: string[];
  manufacturer: string;
  category: string;
  genericName: string;
  schedule: DrugSchedule;
  hsn: string;
  gstRateBp: number;
  mrpPaise: number;
  unitsPerPack: number;
  packUnit: PackUnit;
  looseUnit: LooseUnit;
}

export interface BannedFdcMatch {
  isBanned: boolean;
  notificationRef?: string;
  reason?: string;
  matchedPattern?: string;
}

export const INDIAN_DRUG_REFERENCE_CATALOG: IndianDrugReference[] = [
  // Antibiotics (Schedule H / H1)
  { match: ["augmentin 625", "augmentin", "moxikind-cv", "clavam 625"], manufacturer: "GlaxoSmithKline", category: "Antibiotic", genericName: "Amoxycillin 500mg + Clavulanic Acid 125mg", schedule: "H1", hsn: "300410", gstRateBp: 500, mrpPaise: 22350, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["azithral", "azee 500", "azithromycin"], manufacturer: "Alembic Pharmaceuticals", category: "Antibiotic", genericName: "Azithromycin 500mg", schedule: "H", hsn: "300420", gstRateBp: 500, mrpPaise: 13200, unitsPerPack: 5, packUnit: "strip", looseUnit: "tablet" },
  { match: ["taxim-o", "zifi 200", "cefixime"], manufacturer: "Alkem Laboratories", category: "Antibiotic", genericName: "Cefixime 200mg", schedule: "H1", hsn: "300420", gstRateBp: 500, mrpPaise: 10900, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["monocept", "ceftriaxone"], manufacturer: "Aristo Pharmaceuticals", category: "Antibiotic", genericName: "Ceftriaxone 1g", schedule: "H1", hsn: "300420", gstRateBp: 500, mrpPaise: 6800, unitsPerPack: 1, packUnit: "vial", looseUnit: "piece" },
  { match: ["ciplox", "ciprofloxacin"], manufacturer: "Cipla", category: "Antibiotic", genericName: "Ciprofloxacin 500mg", schedule: "H", hsn: "300420", gstRateBp: 500, mrpPaise: 4600, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["levoflox", "levomac", "levofloxacin"], manufacturer: "Cipla", category: "Antibiotic", genericName: "Levofloxacin 500mg", schedule: "H1", hsn: "300420", gstRateBp: 500, mrpPaise: 9800, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["amoxicillin", "mox 500"], manufacturer: "Sun Pharma", category: "Antibiotic", genericName: "Amoxycillin 500mg", schedule: "H", hsn: "300410", gstRateBp: 500, mrpPaise: 8000, unitsPerPack: 10, packUnit: "strip", looseUnit: "capsule" },
  { match: ["doxy-1", "doxycycline"], manufacturer: "USV", category: "Antibiotic", genericName: "Doxycycline 100mg", schedule: "H", hsn: "300420", gstRateBp: 500, mrpPaise: 9400, unitsPerPack: 10, packUnit: "strip", looseUnit: "capsule" },

  // Cardiovascular & BP
  { match: ["amlong", "amlokind", "amlodipine"], manufacturer: "Micro Labs", category: "Cardiovascular & BP", genericName: "Amlodipine", schedule: "H", hsn: "30049072", gstRateBp: 500, mrpPaise: 3500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["telma", "telsartan", "telmisartan"], manufacturer: "Glenmark Pharmaceuticals", category: "Cardiovascular & BP", genericName: "Telmisartan 40mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 21000, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["olmezest", "olmesar", "olmesartan"], manufacturer: "Sun Pharma", category: "Cardiovascular & BP", genericName: "Olmesartan Medoxomil", schedule: "H", hsn: "30049079", gstRateBp: 500, mrpPaise: 28120, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["starpress", "metolar", "betaloc", "metoprolol"], manufacturer: "Lupin", category: "Cardiovascular & BP", genericName: "Metoprolol Succinate", schedule: "H", hsn: "30049074", gstRateBp: 500, mrpPaise: 9500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["atorva", "lipitor", "storvas", "atorvastatin"], manufacturer: "Zydus Cadila", category: "Cardiovascular & BP", genericName: "Atorvastatin 10mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 10500, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["rosuvas", "rozavel", "rosuvastatin"], manufacturer: "Sun Pharma", category: "Cardiovascular & BP", genericName: "Rosuvastatin 10mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 19800, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["ecosprin 75", "ecosprin"], manufacturer: "USV", category: "Cardiovascular & BP", genericName: "Aspirin 75mg", schedule: "none", hsn: "30049099", gstRateBp: 500, mrpPaise: 540, unitsPerPack: 14, packUnit: "strip", looseUnit: "tablet" },
  { match: ["clopitab", "deplatt", "clopidogrel"], manufacturer: "Lupin", category: "Cardiovascular & BP", genericName: "Clopidogrel 75mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 12500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["sartel"], manufacturer: "Intas Pharmaceuticals", category: "Cardiovascular & BP", genericName: "Telmisartan + Amlodipine", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 24700, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },

  // Antidiabetics
  { match: ["glycomet-gp", "glycomet gp", "amaryl m", "gemer"], manufacturer: "USV", category: "Antidiabetic", genericName: "Glimepiride + Metformin", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 13210, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["glycomet", "gluconorm", "metformin"], manufacturer: "USV", category: "Antidiabetic", genericName: "Metformin 500mg", schedule: "G", hsn: "30049099", gstRateBp: 500, mrpPaise: 5500, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["zoryl m", "zoryl-m"], manufacturer: "Intas Pharmaceuticals", category: "Antidiabetic", genericName: "Glimepiride + Metformin", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 22400, unitsPerPack: 20, packUnit: "strip", looseUnit: "tablet" },
  { match: ["onglyza", "saxagliptin"], manufacturer: "AstraZeneca", category: "Antidiabetic", genericName: "Saxagliptin 5mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 44560, unitsPerPack: 14, packUnit: "strip", looseUnit: "tablet" },
  { match: ["vildaprime", "galvus", "jalra", "vildagliptin"], manufacturer: "Primus", category: "Antidiabetic", genericName: "Vildagliptin 50mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 13305, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["vozuca", "volibo", "voglibose"], manufacturer: "Dr. Reddy's", category: "Antidiabetic", genericName: "Voglibose 0.3mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 15660, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["sitara", "januvia", "istavel", "sitagliptin"], manufacturer: "Intas Pharmaceuticals", category: "Antidiabetic", genericName: "Sitagliptin 100mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 19800, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["forxiga", "udapa", "dapagliflozin"], manufacturer: "AstraZeneca", category: "Antidiabetic", genericName: "Dapagliflozin 10mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 17500, unitsPerPack: 14, packUnit: "strip", looseUnit: "tablet" },

  // Gastrointestinal
  { match: ["pan-d", "pand", "pantocid dsr", "pantocid dcr"], manufacturer: "Alkem Laboratories", category: "Gastrointestinal", genericName: "Pantoprazole 40mg + Domperidone 30mg SR", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 19900, unitsPerPack: 15, packUnit: "strip", looseUnit: "capsule" },
  { match: ["pan 40", "pan-40", "pantocid 40", "pantoprazole"], manufacturer: "Alkem Laboratories", category: "Gastrointestinal", genericName: "Pantoprazole 40mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 15500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["razo-d", "razo d", "rabekind dsr"], manufacturer: "Dr. Reddy's", category: "Gastrointestinal", genericName: "Rabeprazole 20mg + Domperidone 30mg SR", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 21500, unitsPerPack: 15, packUnit: "strip", looseUnit: "capsule" },
  { match: ["omez", "omeprazole"], manufacturer: "Dr. Reddy's", category: "Gastrointestinal", genericName: "Omeprazole 20mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 6200, unitsPerPack: 20, packUnit: "strip", looseUnit: "capsule" },
  { match: ["digene"], manufacturer: "Abbott", category: "Gastrointestinal", genericName: "Dried Aluminium Hydroxide + Magnesium Hydroxide + Simethicone", schedule: "none", hsn: "30049099", gstRateBp: 500, mrpPaise: 2400, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },

  // Analgesic, Antipyretic, NSAIDs
  { match: ["dolo 650", "dolo-650", "calpol", "crocin", "paracetamol"], manufacturer: "Micro Labs", category: "Analgesic & Antipyretic", genericName: "Paracetamol 650mg", schedule: "none", hsn: "30049099", gstRateBp: 500, mrpPaise: 3500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["zerodol-p", "zerodol p", "hifenac-p"], manufacturer: "Ipca Laboratories", category: "Analgesic & Antipyretic", genericName: "Aceclofenac 100mg + Paracetamol 325mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 6600, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["zerodol-sp", "zerodol sp"], manufacturer: "Ipca Laboratories", category: "Analgesic & Antipyretic", genericName: "Aceclofenac 100mg + Paracetamol 325mg + Serratiopeptidase 15mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 12200, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["combiflam"], manufacturer: "Sanofi India", category: "Analgesic & Antipyretic", genericName: "Ibuprofen 400mg + Paracetamol 325mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 4600, unitsPerPack: 20, packUnit: "strip", looseUnit: "tablet" },
  { match: ["ultracet", "tramadol"], manufacturer: "Janssen", category: "Analgesic & Antipyretic", genericName: "Tramadol 37.5mg + Paracetamol 325mg", schedule: "H1", hsn: "30049099", gstRateBp: 500, mrpPaise: 24500, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },

  // Antihistamine, Respiratory & Asthma
  { match: ["allegra", "fexofenadine"], manufacturer: "Sanofi India", category: "Antihistamine & Allergy", genericName: "Fexofenadine 120mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 24200, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["montair-lc", "montair lc", "montek lc"], manufacturer: "Cipla", category: "Respiratory & Asthma", genericName: "Montelukast 10mg + Levocetirizine 5mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 21300, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["cetirizine", "okacet", "cetzine"], manufacturer: "Cipla", category: "Antihistamine & Allergy", genericName: "Cetirizine 10mg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 2100, unitsPerPack: 10, packUnit: "strip", looseUnit: "tablet" },
  { match: ["asthalin", "salbutamol"], manufacturer: "Cipla", category: "Respiratory & Asthma", genericName: "Salbutamol 100mcg", schedule: "H", hsn: "30049099", gstRateBp: 500, mrpPaise: 15200, unitsPerPack: 1, packUnit: "pack", looseUnit: "piece" },

  // Neurology / Psychotropics (Schedule H1 / X)
  { match: ["alprax", "restyl", "alprazolam"], manufacturer: "Torrent Pharmaceuticals", category: "Neurology & CNS", genericName: "Alprazolam 0.25mg", schedule: "H1", hsn: "30049099", gstRateBp: 500, mrpPaise: 3200, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["clonotril", "petril", "clonazepam"], manufacturer: "Torrent Pharmaceuticals", category: "Neurology & CNS", genericName: "Clonazepam 0.5mg", schedule: "H1", hsn: "30049099", gstRateBp: 500, mrpPaise: 5200, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["zolfresh", "zolpidem"], manufacturer: "Abbott", category: "Neurology & CNS", genericName: "Zolpidem 10mg", schedule: "H1", hsn: "30049099", gstRateBp: 500, mrpPaise: 11200, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },

  // Thyroid & Vitamins
  { match: ["thyronorm", "eltroxin", "levothyroxine"], manufacturer: "Abbott", category: "Cardiovascular & BP", genericName: "Levothyroxine Sodium", schedule: "H", hsn: "300439", gstRateBp: 500, mrpPaise: 17500, unitsPerPack: 1, packUnit: "bottle", looseUnit: "piece" },
  { match: ["shelcal", "calcium"], manufacturer: "Torrent Pharmaceuticals", category: "Vitamins & Supplements", genericName: "Calcium 500mg + Vitamin D3 250 IU", schedule: "none", hsn: "30049099", gstRateBp: 500, mrpPaise: 13800, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
  { match: ["neurobion forte", "becosules"], manufacturer: "Procter & Gamble", category: "Vitamins & Supplements", genericName: "Vitamin B-Complex + B12", schedule: "none", hsn: "300450", gstRateBp: 500, mrpPaise: 4200, unitsPerPack: 30, packUnit: "strip", looseUnit: "tablet" },
  { match: ["limcee"], manufacturer: "Abbott", category: "Vitamins & Supplements", genericName: "Ascorbic Acid (Vitamin C) 500mg", schedule: "none", hsn: "300450", gstRateBp: 500, mrpPaise: 2400, unitsPerPack: 15, packUnit: "strip", looseUnit: "tablet" },
];

interface BannedFdcRule {
  id: string;
  notificationRef: string;
  reason: string;
  /** All tokens in at least one group must appear in combined (name + genericName) */
  tokenGroups: string[][];
}

/**
 * Subset of high-impact CDSCO Gazette-notified prohibited Fixed Dose Combinations (2018 / 2023 / 2024).
 */
const CDSCO_BANNED_FDC_RULES: BannedFdcRule[] = [
  {
    id: "nimesulide-paracetamol-dt",
    notificationRef: "MoHFW G.S.R. 2023 / CDSCO FDC Ban",
    reason: "Nimesulide + Paracetamol dispersible tablets are prohibited due to hepatotoxicity risk.",
    tokenGroups: [
      ["nimesulide", "paracetamol", "dispersible"],
      ["nimesulide", "paracetamol", "dt"],
      ["nimesulide", "diclofenac"],
    ],
  },
  {
    id: "aceclofenac-paracetamol-rabeprazole",
    notificationRef: "MoHFW S.O. 2024 (156 FDC Ban)",
    reason: "Fixed dose combination of Aceclofenac + Paracetamol + Rabeprazole is prohibited by CDSCO.",
    tokenGroups: [["aceclofenac", "paracetamol", "rabeprazole"]],
  },
  {
    id: "mefenamic-paracetamol-injection",
    notificationRef: "MoHFW S.O. 2024 (156 FDC Ban)",
    reason: "Mefenamic Acid + Paracetamol injection FDC is prohibited by CDSCO.",
    tokenGroups: [["mefenamic", "paracetamol", "inj"]],
  },
  {
    id: "amoxycillin-dicloxacillin",
    notificationRef: "MoHFW S.O. 2018 / 2023 FDC Ban",
    reason: "Amoxycillin + Dicloxacillin FDC is prohibited by CDSCO (irrational antibiotic combination).",
    tokenGroups: [
      ["amoxycillin", "dicloxacillin"],
      ["amoxicillin", "dicloxacillin"],
    ],
  },
  {
    id: "cefixime-linezolid",
    notificationRef: "MoHFW FDC Ban",
    reason: "Cefixime + Linezolid FDC is prohibited by CDSCO due to antimicrobial resistance risk.",
    tokenGroups: [["cefixime", "linezolid"]],
  },
  {
    id: "chlorpheniramine-phenylephrine-pediatric",
    notificationRef: "CDSCO Advisory Dec 2023 (Pediatric <4y restriction)",
    reason: "Chlorpheniramine Maleate + Phenylephrine HCl FDC is restricted/prohibited for children under 4 years.",
    tokenGroups: [
      ["chlorpheniramine", "phenylephrine", "drops"],
      ["chlorpheniramine", "phenylephrine", "pediatric"],
      ["chlorpheniramine", "phenylephrine", "paediatric"],
    ],
  },
  {
    id: "paracetamol-tramadol-taurine-caffeine",
    notificationRef: "MoHFW S.O. 2024 (156 FDC Ban)",
    reason: "Paracetamol + Tramadol + Taurine + Caffeine FDC is prohibited by CDSCO.",
    tokenGroups: [["paracetamol", "tramadol", "caffeine"]],
  },
];

export function lookupIndianDrugReference(medicineName: string): IndianDrugReference | null {
  const lower = (medicineName || "").trim().toLowerCase();
  if (!lower) return null;

  // Prefer longest matching alias first so "glycomet-gp" wins over "glycomet"
  let best: IndianDrugReference | null = null;
  let bestLen = 0;

  for (const entry of INDIAN_DRUG_REFERENCE_CATALOG) {
    for (const alias of entry.match) {
      if (lower.includes(alias) && alias.length > bestLen) {
        best = entry;
        bestLen = alias.length;
      }
    }
  }
  return best;
}

export function checkCdscoBannedFdc(
  medicineName: string,
  genericName?: string | null
): BannedFdcMatch {
  const haystack = `${medicineName || ""} ${genericName || ""}`.toLowerCase();
  if (!haystack.trim()) return { isBanned: false };

  for (const rule of CDSCO_BANNED_FDC_RULES) {
    for (const group of rule.tokenGroups) {
      if (group.every((tok) => haystack.includes(tok))) {
        return {
          isBanned: true,
          notificationRef: rule.notificationRef,
          reason: rule.reason,
          matchedPattern: group.join(" + "),
        };
      }
    }
  }

  return { isBanned: false };
}
