/**
 * Parser for Indian Doctor QR Codes:
 * - ABDM Healthcare Professionals Registry (HPR / HP-ID) JSON & URL QR codes
 * - NMC / State Medical Council Registration QR payloads
 * - Standard vCard (`BEGIN:VCARD`) doctor visiting card QR codes
 */

export interface ParsedDoctorQr {
  name?: string;
  regNo?: string;
  hprId?: string;
  qualification?: string;
  specialization?: string;
  hospital?: string;
  phone?: string;
  email?: string;
  address?: string;
  source: "abdm_hpr" | "nmc_qr" | "vcard" | "generic";
}

function cleanStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

function parseVcard(raw: string): ParsedDoctorQr {
  const lines = raw.split(/\r?\n/);
  const result: ParsedDoctorQr = { source: "vcard" };
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).toUpperCase().split(";")[0];
    const val = line.slice(idx + 1).trim();
    if (!val) continue;
    if (key === "FN") result.name = val;
    else if (key === "ORG") result.hospital = val.replace(/;/g, ", ");
    else if (key === "TITLE") result.specialization = val;
    else if (key === "TEL") result.phone = val;
    else if (key === "EMAIL") result.email = val;
    else if (key === "ADR") result.address = val.split(";").filter(Boolean).join(", ");
    else if (key === "NOTE") {
      const regMatch = val.match(/(?:reg\.?\s*(?:no\.?)?|mci|nmc|hpr)\s*[:#-]?\s*([A-Z0-9/@._-]{4,})/i);
      if (regMatch) result.regNo = regMatch[1];
    }
  }
  return result;
}

export function parseDoctorQrPayload(raw: string): ParsedDoctorQr | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  // 1. vCard format
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    const parsed = parseVcard(trimmed);
    return parsed.name || parsed.regNo || parsed.phone ? parsed : null;
  }

  // 2. JSON payload (ABDM HPR / digital credential QR)
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const hprId = cleanStr(obj.hprId ?? obj.hpr_id ?? obj.hpId ?? obj.id);
      const regNo = cleanStr(
        obj.registrationNumber ?? obj.regNo ?? obj.reg_no ?? obj.nmcRegNo ?? obj.mciNo ?? hprId
      );
      const name = cleanStr(obj.name ?? obj.fullName ?? obj.doctorName ?? obj.doctor_name);
      const qualification = cleanStr(obj.qualification ?? obj.degree ?? obj.qualifications);
      const specialization = cleanStr(obj.specialization ?? obj.specialty ?? obj.speciality);
      const hospital = cleanStr(obj.facilityName ?? obj.hospital ?? obj.clinic ?? obj.organization);
      const phone = cleanStr(obj.mobile ?? obj.phone ?? obj.contactNumber);
      const email = cleanStr(obj.email);
      const address = cleanStr(obj.address);

      if (name || regNo || hprId) {
        return {
          name,
          regNo,
          hprId,
          qualification,
          specialization,
          hospital,
          phone,
          email,
          address,
          source: hprId || String(obj.hprId || "").includes("@hpr") ? "abdm_hpr" : "nmc_qr",
        };
      }
    } catch {
      // Fall through to URL/text heuristics
    }
  }

  // 3. URL payload (e.g. https://hpr.abdm.gov.in/... or https://www.nmc.org.in/...)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const host = url.hostname.toLowerCase();
      const p = url.searchParams;
      const hprId = cleanStr(p.get("hprId") ?? p.get("hpid") ?? p.get("id"));
      const regNo = cleanStr(
        p.get("regNo") ?? p.get("registrationNumber") ?? p.get("reg") ?? p.get("mci") ?? hprId
      );
      const name = cleanStr(p.get("name") ?? p.get("doctorName"));
      const qualification = cleanStr(p.get("qualification") ?? p.get("degree"));
      const specialization = cleanStr(p.get("specialization") ?? p.get("specialty"));
      const hospital = cleanStr(p.get("facility") ?? p.get("hospital"));
      const phone = cleanStr(p.get("phone") ?? p.get("mobile"));

      // Extract last meaningful path segment if HPR ID / regNo sits in path
      const pathSegs = url.pathname.split("/").filter(Boolean);
      const tail = pathSegs[pathSegs.length - 1];
      const inferredId =
        !regNo && tail && /^[A-Za-z0-9@._-]{5,}$/.test(tail) && !["verify", "profile", "doctor"].includes(tail.toLowerCase())
          ? tail
          : undefined;

      const isHpr = host.includes("abdm.gov.in") || host.includes("hpr");
      const isNmc = host.includes("nmc.org.in");

      if (name || regNo || hprId || inferredId) {
        return {
          name,
          regNo: regNo ?? inferredId,
          hprId: hprId ?? (isHpr ? inferredId : undefined),
          qualification,
          specialization,
          hospital,
          phone,
          source: isHpr ? "abdm_hpr" : isNmc ? "nmc_qr" : "generic",
        };
      }
    } catch {
      // Fall through to plain text
    }
  }

  // 4. Plain-text HP-ID (e.g. dr.sharma@hpr / 12-3456-7890-1234) or key-value lines
  const hprHandle = trimmed.match(/([a-zA-Z0-9._-]+@hpr(?:\.abdm)?)/i);
  const regMatch = trimmed.match(/(?:reg\.?\s*(?:no\.?)?|mci|nmc|kmc|mmc|dmc)\s*[:#-]?\s*([A-Z0-9/-]{4,})/i);
  const nameMatch = trimmed.match(/(?:dr\.?\s+[A-Z][a-zA-Z.\s]{2,40})/i);

  if (hprHandle || regMatch || nameMatch) {
    return {
      name: nameMatch?.[0]?.trim(),
      regNo: regMatch?.[1]?.trim() ?? hprHandle?.[1]?.trim(),
      hprId: hprHandle?.[1]?.trim(),
      source: hprHandle ? "abdm_hpr" : "generic",
    };
  }

  return null;
}
