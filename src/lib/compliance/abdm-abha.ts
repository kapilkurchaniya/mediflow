/**
 * ABDM (ABHA / HFR / DHIS) interoperability helpers (H4).
 */
const ABHA_NUMBER_REGEX = /^\d{2}-\d{4}-\d{4}-\d{4}$/;
const ABHA_ADDRESS_REGEX = /^[a-z0-9._-]{4,50}@(abdm|sbx)$/i;

export function validateAbhaIdentifier(value: string): {
  valid: boolean;
  kind: "abha_number" | "abha_address" | "invalid";
  normalized: string;
} {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 14) {
    const formatted = `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10, 14)}`;
    return {
      valid: ABHA_NUMBER_REGEX.test(formatted),
      kind: "abha_number",
      normalized: formatted,
    };
  }
  if (ABHA_ADDRESS_REGEX.test(trimmed)) {
    return { valid: true, kind: "abha_address", normalized: trimmed.toLowerCase() };
  }
  return { valid: false, kind: "invalid", normalized: trimmed };
}

export interface AbdmMedicationDispenseInput {
  hfrFacilityId: string;
  patientAbhaAddress: string;
  invoiceNo: string;
  dispensedAtIso: string;
  doctorName?: string;
  items: Array<{
    medicineName: string;
    genericName?: string | null;
    qty: number;
    batchNo: string;
    expiryDate: string;
  }>;
}

export function buildAbdmCareContextBundle(input: AbdmMedicationDispenseInput) {
  const abhaCheck = validateAbhaIdentifier(input.patientAbhaAddress);
  if (!abhaCheck.valid) {
    throw new Error("Invalid ABHA Number or ABHA Address.");
  }

  return {
    resourceType: "Bundle",
    type: "document",
    timestamp: input.dispensedAtIso,
    identifier: {
      system: "https://healthid.abdm.gov.in",
      value: input.invoiceNo,
    },
    entry: input.items.map((item, idx) => ({
      fullUrl: `urn:uuid:${input.invoiceNo}-${idx + 1}`,
      resource: {
        resourceType: "MedicationDispense",
        status: "completed",
        subject: { reference: abhaCheck.normalized },
        performer: [{ actor: { display: input.hfrFacilityId } }],
        medicationCodeableConcept: {
          text: item.genericName ? `${item.medicineName} (${item.genericName})` : item.medicineName,
        },
        quantity: { value: item.qty, unit: "unit" },
        lotNumber: item.batchNo,
        expirationDate: item.expiryDate,
        note: input.doctorName ? [{ text: `Prescribed by ${input.doctorName}` }] : undefined,
      },
    })),
  };
}
