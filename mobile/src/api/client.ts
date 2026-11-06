/** MediFlow Mobile Typed REST API Client (Lane A: A5.7.8) */
export interface MobileClientConfig {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  setTokens?: (access: string, refresh: string) => Promise<void>;
  onSessionRevoked?: () => void;
}

export class MobileApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private onRevoked?: () => void;

  constructor(config: MobileClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.onRevoked = config.onSessionRevoked;
  }

  setSession(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    let res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });

    // Handle 401 token refresh retry
    if (res.status === 401 && this.refreshToken && !path.includes("/auth/")) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        headers["Authorization"] = `Bearer ${this.accessToken}`;
        res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
      } else {
        if (this.onRevoked) this.onRevoked();
        throw new Error("SESSION_REVOKED");
      }
    }

    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.message || data.error || `HTTP ${res.status}`);
    }
    return data.data !== undefined ? data.data : data;
  }

  async login(payload: {
    email: string;
    password: string;
    deviceUuid: string;
    deviceName: string;
    platform: "ios" | "android";
    pushToken?: string;
  }) {
    const data = await this.request<any>("/api/v1/mobile/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    this.setSession(data.accessToken, data.refreshToken);
    return data;
  }

  async refreshTokens(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/mobile/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.data?.accessToken) {
        this.setSession(data.data.accessToken, data.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async getDashboard(params?: { storeId?: string; date?: string }) {
    const q = new URLSearchParams();
    if (params?.storeId) q.set("storeId", params.storeId);
    if (params?.date) q.set("date", params.date);
    return this.request<any>(`/api/v1/mobile/dashboard?${q.toString()}`);
  }

  async lookupStock(params: { q?: string; barcode?: string; storeId?: string; limit?: number }) {
    const q = new URLSearchParams();
    if (params.q) q.set("q", params.q);
    if (params.barcode) q.set("barcode", params.barcode);
    if (params.storeId) q.set("storeId", params.storeId);
    if (params.limit) q.set("limit", String(params.limit));
    return this.request<any>(`/api/v1/mobile/stock?${q.toString()}`);
  }

  async listPendingApprovals(storeId?: string) {
    const q = storeId ? `?storeId=${storeId}` : "";
    return this.request<any[]>(`/api/v1/mobile/approvals${q}`);
  }

  async issueApprovalChallenge(requestId: string) {
    return this.request<{ challengeId: string; challengeToken: string; expiresAt: string }>(
      "/api/v1/mobile/approvals/challenge",
      {
        method: "POST",
        body: JSON.stringify({ requestId }),
      },
    );
  }

  async decideApproval(payload: {
    requestId: string;
    challengeId: string;
    challengeToken: string;
    decision: "approved" | "rejected";
    decisionReason?: string;
    idempotencyKey: string;
  }) {
    return this.request<any>("/api/v1/mobile/approvals/decide", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async listAssignedDeliveries(storeId?: string) {
    const q = storeId ? `?storeId=${storeId}` : "";
    return this.request<any[]>(`/api/v1/mobile/delivery/assigned${q}`);
  }

  async transitionDelivery(payload: { deliveryOrderId: string; toStatus: "in_transit" | "delivered" | "failed"; notes?: string }) {
    return this.request<any>("/api/v1/mobile/delivery/transition", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async createUpiIntent(deliveryOrderId: string) {
    return this.request<{ intent: any; qrPayload: string; amountPaise: number }>(
      "/api/v1/mobile/delivery/upi-intent",
      {
        method: "POST",
        body: JSON.stringify({ deliveryOrderId }),
      },
    );
  }

  async initiateProofUpload(payload: {
    deliveryOrderId: string;
    proofType: "delivery_photo" | "recipient_signature";
    fileType: "image/jpeg" | "image/png" | "application/pdf";
    idempotencyKey: string;
  }) {
    return this.request<any>("/api/v1/mobile/delivery/proof/initiate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async completeProofUpload(payload: { proofId: string; fileBase64: string; fileType: "image/jpeg" | "image/png" | "application/pdf" }) {
    return this.request<any>("/api/v1/mobile/delivery/proof/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}
