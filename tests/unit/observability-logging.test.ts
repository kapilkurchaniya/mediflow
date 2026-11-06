import { describe, it, expect } from "vitest";
import { scrubSensitiveData, CENSOR_VALUE } from "@/server/logging/redact";
import {
  createRequestId,
  runWithRequestContext,
  getRequestContext,
  runWithJobContext,
} from "@/server/logging/context";
import { normalizeError, captureException } from "@/server/observability/error-reporter";

describe("Observability & Logging Unit Suite (Phase 6.1)", () => {
  describe("Redaction & PII Protection", () => {
    it("scrubs top-level sensitive fields", () => {
      const payload = {
        username: "pharmacist_1",
        password: "superSecretPassword123!",
        token: "jwt_bearer_token_abc",
        apiKey: "ak_live_99887766",
        phone: "+919876543210",
        aadhaar: "1234-5678-9012",
        prescription: "Tab Amoxicillin 500mg TDS",
        bankAccount: "987654321098",
        upiId: "merchant@okhdfcbank",
        vpa: "customer@upi",
      };

      const scrubbed = scrubSensitiveData(payload);

      expect(scrubbed.username).toBe("pharmacist_1");
      expect(scrubbed.password).toBe(CENSOR_VALUE);
      expect(scrubbed.token).toBe(CENSOR_VALUE);
      expect(scrubbed.apiKey).toBe(CENSOR_VALUE);
      expect(scrubbed.phone).toBe(CENSOR_VALUE);
      expect(scrubbed.aadhaar).toBe(CENSOR_VALUE);
      expect(scrubbed.prescription).toBe(CENSOR_VALUE);
      expect(scrubbed.bankAccount).toBe(CENSOR_VALUE);
      expect(scrubbed.upiId).toBe(CENSOR_VALUE);
      expect(scrubbed.vpa).toBe(CENSOR_VALUE);
    });

    it("scrubs nested sensitive fields within arrays and objects", () => {
      const nested = {
        orderId: "ORD-1234",
        customer: {
          name: "John Doe",
          phoneNumber: "9876543210",
          patient_name: "Jane Doe",
          medicalHistory: "Asthma",
        },
        allocations: [
          { saleId: "SALE-1", token: "tok_secret" },
          { saleId: "SALE-2", rawBody: "{\"pin\": 1234}" },
        ],
      };

      const scrubbed = scrubSensitiveData(nested);

      expect(scrubbed.orderId).toBe("ORD-1234");
      expect(scrubbed.customer.phoneNumber).toBe(CENSOR_VALUE);
      expect(scrubbed.customer.patient_name).toBe(CENSOR_VALUE);
      expect(scrubbed.customer.medicalHistory).toBe(CENSOR_VALUE);
      expect(scrubbed.allocations[0].token).toBe(CENSOR_VALUE);
      expect(scrubbed.allocations[1].rawBody).toBe(CENSOR_VALUE);
    });

    it("handles circular references gracefully without stack overflow", () => {
      const circularObj: Record<string, unknown> = { name: "Test" };
      circularObj.self = circularObj;

      const scrubbed = scrubSensitiveData(circularObj);
      expect(scrubbed.name).toBe("Test");
      expect(scrubbed.self).toBe("[CIRCULAR]");
    });
  });

  describe("AsyncLocalStorage Request & Job Context", () => {
    it("generates and validates request IDs", () => {
      const generated = createRequestId();
      expect(generated).toBeDefined();
      expect(generated.length).toBeGreaterThan(10);

      const custom = createRequestId("req-custom-trace-12345");
      expect(custom).toBe("req-custom-trace-12345");

      // Invalid characters or too short fallback to UUID
      const invalid = createRequestId("bad!");
      expect(invalid).not.toBe("bad!");
    });

    it("isolates context across concurrent asynchronous executions", async () => {
      const taskA = async () => {
        return runWithRequestContext({ requestId: "req-A", tenantId: "tenant-A" }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          const ctx = getRequestContext();
          return ctx?.requestId;
        });
      };

      const taskB = async () => {
        return runWithRequestContext({ requestId: "req-B", tenantId: "tenant-B" }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          const ctx = getRequestContext();
          return ctx?.requestId;
        });
      };

      const [resA, resB] = await Promise.all([taskA(), taskB()]);
      expect(resA).toBe("req-A");
      expect(resB).toBe("req-B");
    });

    it("establishes isolated background job context", async () => {
      await runWithJobContext("outbox_worker", async () => {
        const ctx = getRequestContext();
        expect(ctx).toBeDefined();
        expect(ctx?.requestId).toMatch(/^job_outbox_worker_/);
        expect(ctx?.action).toBe("outbox_worker");
      });
    });
  });

  describe("Error Normalization & Fail-Safe Reporting", () => {
    it("classifies error types into normalized codes", () => {
      const dbTimeout = new Error("canceling statement due to statement timeout");
      const normalizedTimeout = normalizeError(dbTimeout);
      expect(normalizedTimeout.code).toBe("DATABASE_TIMEOUT");

      const pgConn = new Error("connect ECONNREFUSED postgres://user:secret@localhost:5432/mediflow");
      const normalizedConn = normalizeError(pgConn);
      expect(normalizedConn.code).toBe("DATABASE_ERROR");
      expect(normalizedConn.message).not.toContain("secret");
      expect(normalizedConn.message).toContain("[REDACTED]");

      const authErr = new Error("JWT expired: unauthorized access");
      expect(normalizeError(authErr).code).toBe("UNAUTHORIZED");

      const forbiddenErr = new Error("Permission denied: forbidden role");
      expect(normalizeError(forbiddenErr).code).toBe("FORBIDDEN");
    });

    it("captures exception without throwing or interrupting caller", () => {
      expect(() => {
        captureException(new Error("Test failure"), {
          route: "/api/test",
          metadata: { phone: "9876543210", action: "test_action" },
        });
      }).not.toThrow();

      expect(() => {
        captureException("A string thrown unexpectedly");
      }).not.toThrow();

      expect(() => {
        captureException(null);
      }).not.toThrow();
    });
  });
});
