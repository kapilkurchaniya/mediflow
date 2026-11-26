const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const STATE_CODE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

export interface GstinLookupResult {
  valid: boolean;
  gstin: string;
  stateCode: string;
  stateName: string | null;
  pan: string;
  legalName: string | null;
  tradeName: string | null;
  status: "Active" | "Simulated" | "Invalid";
  source: "gsp_live" | "structural_validator";
}

export function validateGstinStructure(gstin: string): {
  valid: boolean;
  normalized: string;
  stateCode: string;
  stateName: string | null;
  pan: string;
} {
  const normalized = gstin.trim().toUpperCase();
  const valid = GSTIN_REGEX.test(normalized);
  const stateCode = normalized.slice(0, 2);
  const pan = normalized.slice(2, 12);
  return {
    valid,
    normalized,
    stateCode,
    stateName: STATE_CODE_NAMES[stateCode] ?? null,
    pan,
  };
}

/**
 * GSP GSTIN Taxpayer Lookup adapter (G1).
 * Calls live GSP endpoint if `GSP_GSTIN_LOOKUP_URL` & `GSP_API_KEY` are configured;
 * otherwise validates GSTIN format & extracts state/PAN cleanly.
 */
export async function lookupGstinTaxpayer(gstin: string): Promise<GstinLookupResult> {
  const check = validateGstinStructure(gstin);
  if (!check.valid) {
    return {
      valid: false,
      gstin: check.normalized,
      stateCode: check.stateCode,
      stateName: check.stateName,
      pan: check.pan,
      legalName: null,
      tradeName: null,
      status: "Invalid",
      source: "structural_validator",
    };
  }

  const gspUrl = process.env.GSP_GSTIN_LOOKUP_URL;
  const gspKey = process.env.GSP_API_KEY;
  if (gspUrl && gspKey) {
    const res = await fetch(`${gspUrl}?gstin=${encodeURIComponent(check.normalized)}`, {
      headers: { Authorization: `Bearer ${gspKey}` },
    });
    if (res.ok) {
      const payload = (await res.json()) as { lgnm?: string; tradeNam?: string; sts?: string };
      return {
        valid: true,
        gstin: check.normalized,
        stateCode: check.stateCode,
        stateName: check.stateName,
        pan: check.pan,
        legalName: payload.lgnm ?? null,
        tradeName: payload.tradeNam ?? null,
        status: payload.sts === "Active" ? "Active" : "Simulated",
        source: "gsp_live",
      };
    }
  }

  return {
    valid: true,
    gstin: check.normalized,
    stateCode: check.stateCode,
    stateName: check.stateName,
    pan: check.pan,
    legalName: null,
    tradeName: null,
    status: "Simulated",
    source: "structural_validator",
  };
}
