/**
 * src/server/logging/redact.ts
 *
 * Strict PII and credential redaction configuration for Pino logging.
 * Enforces zero leakage of patient data, prescriptions, phone numbers,
 * bank accounts, Aadhaar, payment payloads, and authorization credentials.
 */

export const PINO_REDACT_PATHS = [
  // Authentication & Secrets
  "password",
  "*.password",
  "token",
  "*.token",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "clientSecret",
  "*.clientSecret",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "pin",
  "*.pin",
  "otp",
  "*.otp",

  // HTTP Headers & Cookies
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "headers.authorization",
  "headers.cookie",
  'headers["set-cookie"]',
  'headers["x-api-key"]',
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',

  // Patient & Customer PII
  "phone",
  "*.phone",
  "phoneNumber",
  "*.phoneNumber",
  "mobile",
  "*.mobile",
  "mobileNumber",
  "*.mobileNumber",
  "email",
  "*.email",
  "aadhaar",
  "*.aadhaar",
  "pan",
  "*.pan",
  "patientName",
  "*.patientName",
  "patient_name",
  "*.patient_name",
  "customerName",
  "*.customerName",
  "customer_name",
  "*.customer_name",
  "recipientName",
  "*.recipientName",
  "recipientPhone",
  "*.recipientPhone",

  // Medical & Health Data
  "prescription",
  "*.prescription",
  "diagnosis",
  "*.diagnosis",
  "medicalHistory",
  "*.medicalHistory",

  // Financial & Banking Data
  "accountNumber",
  "*.accountNumber",
  "bankAccount",
  "*.bankAccount",
  "upiId",
  "*.upiId",
  "vpa",
  "*.vpa",
  "rawBody",
  "requestBody",
  "responseBody",
];

export const CENSOR_VALUE = "[REDACTED]";

const SENSITIVE_KEY_REGEX =
  /^(password|token|secret|api_?key|auth.*|cookie|phone.*|mobile.*|email|aadhaar|pan|pin|otp|patient.*|prescription|diagnosis|medical.*|bank.*|account_?no.*|upi.*|vpa|raw_?body)$/i;

/**
 * Recursively scrubs an object, replacing sensitive values with [REDACTED].
 * Useful for deep-scrubbing objects before custom telemetry dispatch.
 */
export function scrubSensitiveData<T>(input: T, seen = new WeakSet()): T {
  if (input === null || typeof input !== "object") {
    return input;
  }

  if (seen.has(input as object)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.map((item) => scrubSensitiveData(item, seen)) as unknown as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      output[key] = CENSOR_VALUE;
    } else if (typeof value === "object" && value !== null) {
      output[key] = scrubSensitiveData(value, seen);
    } else {
      output[key] = value;
    }
  }

  return output as T;
}
