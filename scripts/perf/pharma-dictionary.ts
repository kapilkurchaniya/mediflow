/**
 * Realistic Indian pharmaceutical dictionary for performance testing.
 */

export const MOLECULES = [
  "Paracetamol",
  "Amoxicillin + Potassium Clavulanate",
  "Azithromycin",
  "Telmisartan",
  "Telmisartan + Amlodipine",
  "Metformin Hydrochloride",
  "Metformin + Glimepiride",
  "Pantoprazole Sodium",
  "Pantoprazole + Domperidone",
  "Omeprazole",
  "Cetirizine Hydrochloride",
  "Levocetirizine + Montelukast",
  "Atorvastatin Calcium",
  "Rosuvastatin",
  "Cefixime Trihydrate",
  "Ciprofloxacin",
  "Ibuprofen + Paracetamol",
  "Diclofenac Sodium",
  "Cholecalciferol (Vitamin D3)",
  "B-Complex with Vitamin C",
  "Aceclofenac + Paracetamol",
  "Ofloxacin + Ornidazole",
  "Rabeprazole + Levosulpiride",
  "Montelukast Sodium",
  "Guanfacine",
] as const;

export const BRAND_STEMS = [
  "Dolo",
  "Augmentin",
  "Azee",
  "Telma",
  "Telmikem",
  "Glycomet",
  "Amaryl",
  "Pan",
  "Pantocid",
  "Omez",
  "Cetzine",
  "Montair-LC",
  "Atorva",
  "Rozavel",
  "Taxim-O",
  "Ciplox",
  "Combiflam",
  "Voveran",
  "Shelcal",
  "Becosules",
  "Zerodol-P",
  "Zenflox-OZ",
  "Razo-L",
  "Montek",
  "Calpol",
] as const;

export const STRENGTHS = ["500mg", "650mg", "250mg", "100mg", "40mg", "20mg", "10mg", "5mg", "500/125mg", "50/500mg"] as const;

export const DOSAGE_FORMS = [
  { form: "tablet", packUnit: "strip", looseUnit: "tablet", unitsPerPack: 10 },
  { form: "tablet", packUnit: "strip", looseUnit: "tablet", unitsPerPack: 15 },
  { form: "capsule", packUnit: "strip", looseUnit: "capsule", unitsPerPack: 10 },
  { form: "syrup", packUnit: "bottle", looseUnit: "ml", unitsPerPack: 100 },
  { form: "suspension", packUnit: "bottle", looseUnit: "ml", unitsPerPack: 60 },
  { form: "injection", packUnit: "vial", looseUnit: "vial", unitsPerPack: 1 },
  { form: "ointment", packUnit: "tube", looseUnit: "gm", unitsPerPack: 30 },
] as const;

export const SCHEDULES = ["none", "none", "none", "H", "H", "H1", "G", "narcotic"] as const;

export const HSN_CODES = ["30049099", "30042010", "30041010", "30049039", "30045010"] as const;
