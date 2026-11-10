/**
 * MediFlow AI Assistant - User & Tenant Rate Limiter
 * 
 * Enforces sliding-window rate limits per user to protect LLM token quotas,
 * prevent automated abuse, and guarantee fair resource allocation across tenants.
 * 
 * Policy:
 * - 60 requests per user per hour (hourly window).
 * - Max burst of 15 requests per user per minute (short-term window).
 */

export interface RateLimitStatus {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  reason?: string;
}

interface UserRequestTimestamps {
  timestamps: number[];
  lastCleaned: number;
}

const HOURLY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const HOURLY_MAX_REQUESTS = 60;
const BURST_WINDOW_MS = 60 * 1000; // 1 minute
const BURST_MAX_REQUESTS = 15;

// In-memory sliding window bucket store
const rateLimitStore = new Map<string, UserRequestTimestamps>();

/**
 * Checks if the caller exceeds the sliding-window AI request thresholds.
 */
export function checkAiRateLimit(
  tenantId: string,
  userId: string,
  now: number = Date.now()
): RateLimitStatus {
  const key = `${tenantId}:${userId}`;
  let bucket = rateLimitStore.get(key);

  if (!bucket) {
    bucket = { timestamps: [], lastCleaned: now };
    rateLimitStore.set(key, bucket);
  }

  // Filter timestamps within the hourly window
  const hourlyCutoff = now - HOURLY_WINDOW_MS;
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > hourlyCutoff);
  bucket.lastCleaned = now;

  // 1. Check Burst Limit (last 1 minute)
  const burstCutoff = now - BURST_WINDOW_MS;
  const burstCount = bucket.timestamps.filter((ts) => ts > burstCutoff).length;

  if (burstCount >= BURST_MAX_REQUESTS) {
    const oldestInBurst = bucket.timestamps.find((ts) => ts > burstCutoff) || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestInBurst + BURST_WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: retryAfterSeconds,
      reason: "Burst rate limit exceeded. Please wait a moment before sending more queries.",
    };
  }

  // 2. Check Hourly Limit
  if (bucket.timestamps.length >= HOURLY_MAX_REQUESTS) {
    const oldestInHour = bucket.timestamps[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestInHour + HOURLY_WINDOW_MS - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: retryAfterSeconds,
      reason: "Hourly AI query limit reached (60 queries/hr). Please try again later.",
    };
  }

  // Record timestamp
  bucket.timestamps.push(now);

  const remaining = HOURLY_MAX_REQUESTS - bucket.timestamps.length;
  const oldest = bucket.timestamps[0] || now;
  const resetInSeconds = Math.max(1, Math.ceil((oldest + HOURLY_WINDOW_MS - now) / 1000));

  return {
    allowed: true,
    remaining,
    resetInSeconds,
  };
}

/**
 * Clears rate limiting state for a user (primarily for test fixtures).
 */
export function resetAiRateLimit(tenantId?: string, userId?: string): void {
  if (tenantId && userId) {
    rateLimitStore.delete(`${tenantId}:${userId}`);
  } else {
    rateLimitStore.clear();
  }
}

