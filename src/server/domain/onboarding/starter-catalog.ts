/**
 * Curated Starter Catalogue of Essential Indian Pharmaceuticals.
 * Compliant with Indian HSN 3004 and Drugs & Cosmetics Act Schedules.
 */

export interface StarterMedicineItem {
  name: string;
  genericName: string;
  manufacturer: string;
  hsnCode: string;
  gstRateBp: number;
  schedule: "H" | "H1" | "X" | "OTC";
  packSize: number;
  unit: string;
  mrpPaise: number;
  purchasePricePaise: number;
}

export const ESSENTIAL_STARTER_MEDICINES: StarterMedicineItem[] = [
  {
    name: "Dolo 650 Tablet",
    genericName: "Paracetamol 650mg",
    manufacturer: "Micro Labs Ltd",
    hsnCode: "30049060",
    gstRateBp: 500,
    schedule: "OTC",
    packSize: 15,
    unit: "strip",
    mrpPaise: 3350,
    purchasePricePaise: 2400,
  },
  {
    name: "Augmentin 625 Duo Tablet",
    genericName: "Amoxicillin 500mg + Clavulanic Acid 125mg",
    manufacturer: "GlaxoSmithKline Pharmaceuticals Ltd",
    hsnCode: "30041030",
    gstRateBp: 500,
    schedule: "H1",
    packSize: 10,
    unit: "strip",
    mrpPaise: 20400,
    purchasePricePaise: 15800,
  },
  {
    name: "Pan 40 Tablet",
    genericName: "Pantoprazole 40mg",
    manufacturer: "Alkem Laboratories Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "H",
    packSize: 15,
    unit: "strip",
    mrpPaise: 15500,
    purchasePricePaise: 11200,
  },
  {
    name: "Pan-D Capsule",
    genericName: "Pantoprazole 40mg + Domperidone 30mg",
    manufacturer: "Alkem Laboratories Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "H",
    packSize: 15,
    unit: "strip",
    mrpPaise: 19900,
    purchasePricePaise: 14500,
  },
  {
    name: "Azithral 500 Tablet",
    genericName: "Azithromycin 500mg",
    manufacturer: "Alembic Pharmaceuticals Ltd",
    hsnCode: "30042099",
    gstRateBp: 500,
    schedule: "H1",
    packSize: 5,
    unit: "strip",
    mrpPaise: 13200,
    purchasePricePaise: 9600,
  },
  {
    name: "Glycomet 500 Tablet",
    genericName: "Metformin Hydrochloride 500mg",
    manufacturer: "USV Pvt Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "H",
    packSize: 20,
    unit: "strip",
    mrpPaise: 4600,
    purchasePricePaise: 3300,
  },
  {
    name: "Telma 40 Tablet",
    genericName: "Telmisartan 40mg",
    manufacturer: "Glenmark Pharmaceuticals Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "H",
    packSize: 30,
    unit: "strip",
    mrpPaise: 22800,
    purchasePricePaise: 16500,
  },
  {
    name: "Montair-LC Tablet",
    genericName: "Montelukast 10mg + Levocetirizine 5mg",
    manufacturer: "Cipla Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "H",
    packSize: 10,
    unit: "strip",
    mrpPaise: 20500,
    purchasePricePaise: 14800,
  },
  {
    name: "Cetirizine 10mg Tablet",
    genericName: "Cetirizine Hydrochloride 10mg",
    manufacturer: "Dr. Reddy's Laboratories Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "OTC",
    packSize: 10,
    unit: "strip",
    mrpPaise: 2100,
    purchasePricePaise: 1400,
  },
  {
    name: "Atorva 10 Tablet",
    genericName: "Atorvastatin 10mg",
    manufacturer: "Zydus Healthcare Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "H",
    packSize: 15,
    unit: "strip",
    mrpPaise: 9800,
    purchasePricePaise: 7100,
  },
  {
    name: "Shelcal 500 Tablet",
    genericName: "Calcium 500mg + Vitamin D3 250 IU",
    manufacturer: "Torrent Pharmaceuticals Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "OTC",
    packSize: 15,
    unit: "strip",
    mrpPaise: 14200,
    purchasePricePaise: 10500,
  },
  {
    name: "Becosules Capsule",
    genericName: "Vitamin B-Complex with Vitamin C",
    manufacturer: "Pfizer Ltd",
    hsnCode: "30049099",
    gstRateBp: 500,
    schedule: "OTC",
    packSize: 20,
    unit: "strip",
    mrpPaise: 5200,
    purchasePricePaise: 3800,
  },
];

