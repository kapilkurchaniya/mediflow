import { ImportEntity, ImportSource } from "../types";
import {
  MARG_MEDICINE_MAPPINGS,
  MARG_BATCH_MAPPINGS,
  MARG_PARTY_MAPPINGS,
} from "./marg";
import {
  GOFRUGAL_MEDICINE_MAPPINGS,
  GOFRUGAL_BATCH_MAPPINGS,
  GOFRUGAL_PARTY_MAPPINGS,
} from "./gofrugal";
import {
  GENERIC_MEDICINE_MAPPINGS,
  GENERIC_BATCH_MAPPINGS,
  GENERIC_PARTY_MAPPINGS,
} from "./generic";

export interface PresetMappingResult {
  detectedSource: ImportSource;
  confidence: number; // 0 to 1
  mapping: Record<string, string>; // CSV Header -> Target Field
  unmappedHeaders: string[];
}

function getDictionary(source: ImportSource, entity: ImportEntity): Record<string, string[]> {
  if (source === "marg") {
    if (entity === "medicines") return MARG_MEDICINE_MAPPINGS;
    if (entity === "batches") return MARG_BATCH_MAPPINGS;
    return MARG_PARTY_MAPPINGS;
  }
  if (source === "gofrugal") {
    if (entity === "medicines") return GOFRUGAL_MEDICINE_MAPPINGS;
    if (entity === "batches") return GOFRUGAL_BATCH_MAPPINGS;
    return GOFRUGAL_PARTY_MAPPINGS;
  }
  // Generic
  if (entity === "medicines") return GENERIC_MEDICINE_MAPPINGS;
  if (entity === "batches") return GENERIC_BATCH_MAPPINGS;
  return GENERIC_PARTY_MAPPINGS;
}

/**
 * Computes header mapping for a specific preset dictionary.
 */
export function buildMappingFromDictionary(
  headers: string[],
  dictionary: Record<string, string[]>
): { mapping: Record<string, string>; matchedCount: number; unmapped: string[] } {
  const mapping: Record<string, string> = {};
  const unmapped: string[] = [];
  let matchedCount = 0;

  const headerNormalizedMap = new Map<string, string>();
  for (const h of headers) {
    headerNormalizedMap.set(h.trim().toUpperCase(), h);
  }

  for (const [targetField, synonyms] of Object.entries(dictionary)) {
    for (const syn of synonyms) {
      const synNorm = syn.trim().toUpperCase();
      const actualHeader = headerNormalizedMap.get(synNorm);
      if (actualHeader && !mapping[actualHeader]) {
        mapping[actualHeader] = targetField;
        matchedCount++;
        break;
      }
    }
  }

  for (const h of headers) {
    if (!mapping[h]) {
      unmapped.push(h);
    }
  }

  return { mapping, matchedCount, unmapped };
}

/**
 * Auto-detects the source format (Marg, GoFrugal, Generic) and produces
 * the optimal field mapping based on the provided CSV headers.
 */
export function detectPresetAndMapping(
  headers: string[],
  entity: ImportEntity
): PresetMappingResult {
  if (headers.length === 0) {
    return {
      detectedSource: "generic",
      confidence: 0,
      mapping: {},
      unmappedHeaders: [],
    };
  }

  const sources: ImportSource[] = ["marg", "gofrugal", "generic"];
  let bestSource: ImportSource = "generic";
  let bestMatchedCount = -1;
  let bestResult = {
    mapping: {} as Record<string, string>,
    matchedCount: 0,
    unmapped: headers,
  };

  for (const source of sources) {
    const dict = getDictionary(source, entity);
    const result = buildMappingFromDictionary(headers, dict);
    if (result.matchedCount > bestMatchedCount) {
      bestMatchedCount = result.matchedCount;
      bestSource = source;
      bestResult = result;
    }
  }

  const confidence = headers.length > 0 ? Math.min(1, bestMatchedCount / Math.min(headers.length, 8)) : 0;

  return {
    detectedSource: bestSource,
    confidence: Number(confidence.toFixed(2)),
    mapping: bestResult.mapping,
    unmappedHeaders: bestResult.unmapped,
  };
}

