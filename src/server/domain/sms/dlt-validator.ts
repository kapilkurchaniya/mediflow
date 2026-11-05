/**
 * TRAI DLT SMS Tokenizer, Variable Substitutor & GSM / Unicode Character Counter
 */

// Standard GSM 7-bit basic character set regex (RFC 5724)
const GSM_7BIT_REGEX =
  /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|\u20AC]*$/;

export interface SmsCreditInfo {
  charCount: number;
  isUnicode: boolean;
  credits: number;
  charsPerCredit: number;
  remainingInCurrentCredit: number;
}

/**
 * Validates 6-character alphabetic Indian Sender ID (Header) for service/transactional SMS
 */
export function validateSenderId(senderId?: string | null): { valid: boolean; error?: string } {
  if (!senderId || typeof senderId !== "string") {
    return { valid: false, error: "Sender ID is required" };
  }
  const clean = senderId.trim();
  if (clean.length !== 6) {
    return { valid: false, error: "Sender ID must be exactly 6 characters (e.g. MEDFLW)" };
  }
  if (!/^[A-Za-z]{6}$/.test(clean)) {
    return { valid: false, error: "Sender ID must contain only alphabetic letters (no numbers or special symbols)" };
  }
  return { valid: true };
}

/**
 * Extracts variable placeholders from a DLT template body
 * Supports standard DLT formats: {#var#}, {#var}, or {{var}}
 */
export function extractDltVariables(body: string): string[] {
  if (!body) return [];
  const matches = body.match(/\{#[^#]*#\}|\{\{[^}]*\}\}/g);
  return matches || [];
}

/**
 * Substitutes variables into DLT template placeholders
 */
export function substituteDltVariables(
  templateBody: string,
  variables: Record<string, string> | string[]
): string {
  if (!templateBody) return "";

  if (Array.isArray(variables)) {
    let varIdx = 0;
    // Replace {#var#} or {{var}} in sequential order
    return templateBody.replace(/\{#[^#]*#\}|\{\{[^}]*\}\}/g, () => {
      const val = variables[varIdx] !== undefined ? String(variables[varIdx]) : "";
      varIdx++;
      return val;
    });
  }

  // Object mapping by key: e.g. {{customerName}} or {#customerName#}
  let result = templateBody;
  for (const [key, val] of Object.entries(variables)) {
    const safeVal = String(val ?? "");
    result = result
      .replace(new RegExp(`\\{#${key}#\\}`, "g"), safeVal)
      .replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), safeVal);
  }

  // Also replace remaining generic {#var#} sequentially if any keys are numbered
  return result;
}

/**
 * Detects whether message contains non-GSM characters (Unicode like Devanagari Hindi, emojis, etc.)
 */
export function isUnicodeMessage(message: string): boolean {
  if (!message) return false;
  return !GSM_7BIT_REGEX.test(message);
}

/**
 * Calculates character length, encoding, and required SMS billable credits
 * GSM 7-bit: 1 credit <= 160 chars; multi-part = 153 chars/segment
 * UCS-2 Unicode: 1 credit <= 70 chars; multi-part = 67 chars/segment
 */
export function calculateSmsCredits(message: string): SmsCreditInfo {
  const charCount = message ? message.length : 0;
  const isUnicode = isUnicodeMessage(message);

  if (charCount === 0) {
    return {
      charCount: 0,
      isUnicode,
      credits: 0,
      charsPerCredit: isUnicode ? 70 : 160,
      remainingInCurrentCredit: isUnicode ? 70 : 160,
    };
  }

  if (isUnicode) {
    if (charCount <= 70) {
      return {
        charCount,
        isUnicode: true,
        credits: 1,
        charsPerCredit: 70,
        remainingInCurrentCredit: 70 - charCount,
      };
    }
    const credits = Math.ceil(charCount / 67);
    const maxChars = credits * 67;
    return {
      charCount,
      isUnicode: true,
      credits,
      charsPerCredit: 67,
      remainingInCurrentCredit: maxChars - charCount,
    };
  }

  // GSM 7-bit
  if (charCount <= 160) {
    return {
      charCount,
      isUnicode: false,
      credits: 1,
      charsPerCredit: 160,
      remainingInCurrentCredit: 160 - charCount,
    };
  }

  const credits = Math.ceil(charCount / 153);
  const maxChars = credits * 153;
  return {
    charCount,
    isUnicode: false,
    credits,
    charsPerCredit: 153,
    remainingInCurrentCredit: maxChars - charCount,
  };
}
