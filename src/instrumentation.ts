import { type Instrumentation } from "next";
import { captureException } from "@/server/observability/error-reporter";
import { logInfo } from "@/server/logging/logger";

/**
 * Next.js server instrumentation registration hook.
 * Runs once per server boot before handling requests.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    logInfo(
      {
        action: "server_boot",
        nodeVersion: process.version,
        env: process.env.NODE_ENV,
        runtime: process.env.NEXT_RUNTIME,
      },
      "Next.js server instrumentation registered",
    );
  }
}

/**
 * Next.js 15+ onRequestError server hook.
 * Triggered automatically when unhandled exceptions occur during
 * server component rendering, server actions, or API route handling.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const reqObj = request as { path?: string; method?: string; headers?: Record<string, string> };
  const ctxObj = context as { routerKind?: string; routeType?: string };

  captureException(err, {
    route: reqObj?.path || "unknown",
    metadata: {
      method: reqObj?.method,
      routerKind: ctxObj?.routerKind,
      routeType: ctxObj?.routeType,
    },
  });
};
