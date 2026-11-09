import http from "k6/http";
import { check, sleep } from "k6";

/**
 * k6 Load Test for POS Search & Sale Checkouts (Phase 6.2).
 * Simulates concurrent store cashiers ringing up sales.
 *
 * Execution Profiles:
 *   k6 run -e PROFILE=smoke tests/load/k6-pos-sale.js   (5 VUs, 30s)
 *   k6 run -e PROFILE=target tests/load/k6-pos-sale.js  (20 VUs, 2m)
 *   k6 run -e PROFILE=stress tests/load/k6-pos-sale.js  (35 VUs, 2m)
 */

const PROFILE = __ENV.PROFILE || "target";
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const DEVICE_TOKEN = __ENV.DEVICE_TOKEN || "mf_dev_testloadtoken1234567890";

const profiles = {
  smoke: {
    vus: 5,
    duration: "30s",
  },
  target: {
    vus: 20,
    duration: "2m",
  },
  stress: {
    vus: 35,
    duration: "2m",
  },
};

export const options = {
  vus: profiles[PROFILE]?.vus || 20,
  duration: profiles[PROFILE]?.duration || "2m",
  thresholds: {
    "http_req_duration{endpoint:search}": ["p(95)<150"],
    "http_req_duration{endpoint:sale}": ["p(95)<400"],
    http_req_failed: ["rate<0.01"],
  },
};

const SEARCH_TERMS = ["dolo", "paracetamol", "amox", "azithromycin", "pantop", "calpol"];

export default function () {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${DEVICE_TOKEN}`,
  };

  // 1. Step 1: Search Medicines at POS
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const searchRes = http.get(`${BASE_URL}/api/pos/search?q=${term}`, {
    headers,
    tags: { endpoint: "search" },
  });

  check(searchRes, {
    "search status is 200": (r) => r.status === 200,
    "search response has items": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.success === true && Array.isArray(body.items);
      } catch {
        return false;
      }
    },
  });

  // Short cashier dwell time (scanning/selecting item)
  sleep(Math.random() * 0.2 + 0.1);

  // Parse candidate items
  let medicineId = null;
  let batchId = null;

  try {
    const data = JSON.parse(searchRes.body);
    if (data.items && data.items.length > 0) {
      const candidate = data.items.find((item) => item.batches && item.batches.length > 0) || data.items[0];
      medicineId = candidate.medicine.id;
      if (candidate.batches && candidate.batches.length > 0) {
        batchId = candidate.batches[0].id;
      }
    }
  } catch {}

  // 2. Step 2: Commit Sale Checkout
  const clientSaleId = `00000000-0000-4000-8000-${String(Date.now()).padStart(12, "0").slice(-12)}`;
  const salePayload = JSON.stringify({
    clientSaleId,
    lines: [
      batchId
        ? { batchId, medicineId, qty: 1, discountBp: 0 }
        : { medicineId, qty: 1, discountBp: 0, autoFefo: true },
    ],
    billDiscountPaise: 0,
    payments: [{ method: "cash", amount: 10000 }],
    redeemPoints: 0,
  });

  const saleRes = http.post(`${BASE_URL}/api/pos/sale`, salePayload, {
    headers,
    tags: { endpoint: "sale" },
  });

  check(saleRes, {
    "sale status is 200 or 400 (stock exhausted)": (r) => r.status === 200 || r.status === 400,
  });

  // Cashier gap between customers
  sleep(Math.random() * 0.5 + 0.2);
}
