import type { ScenarioRunner } from "./types";
import { runVID1_1 } from "./VID-1.1";
import { runVID1_2 } from "./VID-1.2";
import { runVID1_3 } from "./VID-1.3";
import { runVID1_4 } from "./VID-1.4";
import { runVID1_5 } from "./VID-1.5";
import { runVID2_1 } from "./VID-2.1";
import { runVID2_2 } from "./VID-2.2";
import { runVID2_3 } from "./VID-2.3";
import { runVID2_4 } from "./VID-2.4";
import { runVID2_5 } from "./VID-2.5";
import { runVID2_6 } from "./VID-2.6";
import { runVID2_7 } from "./VID-2.7";
import { runVID2_8 } from "./VID-2.8";
import { runVID2_9 } from "./VID-2.9";
import { runVID2_10 } from "./VID-2.10";
import { runVID2_11 } from "./VID-2.11";
import { runVID2_12 } from "./VID-2.12";
import { runVID2_13 } from "./VID-2.13";
import { runVID2_14 } from "./VID-2.14";
import { runVID2_15 } from "./VID-2.15";
import { runVID2_16 } from "./VID-2.16";
import { runVID2_17 } from "./VID-2.17";
import { runVID2_18 } from "./VID-2.18";
import { runVID3_1 } from "./VID-3.1";
import { runVID3_2 } from "./VID-3.2";
import { runVID3_3 } from "./VID-3.3";
import { runVID3_4 } from "./VID-3.4";
import { runVID3_5 } from "./VID-3.5";
import { runVID3_6 } from "./VID-3.6";
import { runVID4_1 } from "./VID-4.1";
import { runVID4_2 } from "./VID-4.2";
import { runVID4_3 } from "./VID-4.3";
import { runVID4_4 } from "./VID-4.4";
import { runVID4_5 } from "./VID-4.5";
import { runVID4_6 } from "./VID-4.6";
import { runVID4_7 } from "./VID-4.7";
import { runVID4_8 } from "./VID-4.8";
import { runVID5_1 } from "./VID-5.1";
import { runVID5_2 } from "./VID-5.2";
import { runVID5_3 } from "./VID-5.3";
import { runVID5_4 } from "./VID-5.4";
import { runVID5_5 } from "./VID-5.5";
import { runVID5_6 } from "./VID-5.6";
import { runVID5_7 } from "./VID-5.7";
import { runVID6_1 } from "./VID-6.1";
import { runVID6_2 } from "./VID-6.2";
import { runVID6_3 } from "./VID-6.3";
import { runVID6_4 } from "./VID-6.4";
import { runVID6_5 } from "./VID-6.5";
import { runVID7_1 } from "./VID-7.1";
import { runVID7_2 } from "./VID-7.2";
import { runVID7_3 } from "./VID-7.3";
import { runVID7_4 } from "./VID-7.4";
import { runVID7_5 } from "./VID-7.5";
import { runVID8_1 } from "./VID-8.1";
import { runVID8_2 } from "./VID-8.2";
import { runVID8_3 } from "./VID-8.3";
import { runVID8_4 } from "./VID-8.4";
import { runVID8_5 } from "./VID-8.5";

export const scenarioRegistry: Record<string, { runner: ScenarioRunner; preAuthRequired: boolean }> = {
  "VID-1.1": {
    runner: runVID1_1,
    preAuthRequired: false, // VID-1.1 demonstrates the actual login flow!
  },
  "VID-1.2": {
    runner: runVID1_2,
    preAuthRequired: true,  // VID-1.2 starts authenticated on dashboard
  },
  "VID-1.3": {
    runner: runVID1_3,
    preAuthRequired: true,  // VID-1.3 starts authenticated on dashboard
  },
  "VID-1.4": {
    runner: runVID1_4,
    preAuthRequired: true,  // VID-1.4 starts authenticated on settings/users
  },
  "VID-1.5": {
    runner: runVID1_5,
    preAuthRequired: true,  // VID-1.5 starts authenticated on settings
  },
  "VID-2.1": {
    runner: runVID2_1,
    preAuthRequired: true,  // VID-2.1 starts authenticated on POS counter
  },
  "VID-2.2": {
    runner: runVID2_2,
    preAuthRequired: true,  // VID-2.2 starts authenticated on POS counter
  },
  "VID-2.3": {
    runner: runVID2_3,
    preAuthRequired: true,  // VID-2.3 starts authenticated on POS counter
  },
  "VID-2.4": {
    runner: runVID2_4,
    preAuthRequired: true,  // VID-2.4 starts authenticated on POS counter
  },
  "VID-2.5": {
    runner: runVID2_5,
    preAuthRequired: true,  // VID-2.5 starts authenticated on POS counter
  },
  "VID-2.6": {
    runner: runVID2_6,
    preAuthRequired: true,  // VID-2.6 starts authenticated on POS counter
  },
  "VID-2.7": {
    runner: runVID2_7,
    preAuthRequired: true,  // VID-2.7 assumes authenticated cashier
  },
  "VID-2.8": {
    runner: runVID2_8,
    preAuthRequired: true,  // VID-2.8 starts authenticated on POS counter
  },
  "VID-2.9": {
    runner: runVID2_9,
    preAuthRequired: true,  // VID-2.9 starts authenticated on POS counter
  },
  "VID-2.10": {
    runner: runVID2_10,
    preAuthRequired: true,  // VID-2.10 starts authenticated on POS counter
  },
  "VID-2.11": {
    runner: runVID2_11,
    preAuthRequired: true,  // VID-2.11 starts authenticated on POS counter
  },
  "VID-2.12": {
    runner: runVID2_12,
    preAuthRequired: true,  // VID-2.12 starts authenticated on POS counter
  },
  "VID-2.13": {
    runner: runVID2_13,
    preAuthRequired: true,  // VID-2.13 starts authenticated on POS counter
  },
  "VID-2.14": {
    runner: runVID2_14,
    preAuthRequired: true,  // VID-2.14 starts authenticated on sales ledger
  },
  "VID-2.15": {
    runner: runVID2_15,
    preAuthRequired: true,  // VID-2.15 starts authenticated on sales ledger
  },
  "VID-2.16": {
    runner: runVID2_16,
    preAuthRequired: true,  // VID-2.16 starts authenticated on sales ledger
  },
  "VID-2.17": {
    runner: runVID2_17,
    preAuthRequired: true,  // VID-2.17 starts authenticated on cash register
  },
  "VID-2.18": {
    runner: runVID2_18,
    preAuthRequired: true,  // VID-2.18 starts authenticated on POS counter
  },
  "VID-3.1": {
    runner: runVID3_1,
    preAuthRequired: true,  // VID-3.1 starts authenticated on POS counter
  },
  "VID-3.2": {
    runner: runVID3_2,
    preAuthRequired: true,  // VID-3.2 starts authenticated on POS counter
  },
  "VID-3.3": {
    runner: runVID3_3,
    preAuthRequired: true,  // VID-3.3 starts authenticated on compliance/doctors
  },
  "VID-3.4": {
    runner: runVID3_4,
    preAuthRequired: true,  // VID-3.4 starts authenticated on compliance/prescriptions
  },
  "VID-3.5": {
    runner: runVID3_5,
    preAuthRequired: true,  // VID-3.5 starts authenticated on compliance registers
  },
  "VID-3.6": {
    runner: runVID3_6,
    preAuthRequired: true,  // VID-3.6 starts authenticated on compliance print view
  },
  "VID-4.1": {
    runner: runVID4_1,
    preAuthRequired: true,  // VID-4.1 starts authenticated on inventory/new
  },
  "VID-4.2": {
    runner: runVID4_2,
    preAuthRequired: true,  // VID-4.2 starts authenticated on inventory/pos
  },
  "VID-4.3": {
    runner: runVID4_3,
    preAuthRequired: true,  // VID-4.3 starts authenticated on settings/racks
  },
  "VID-4.4": {
    runner: runVID4_4,
    preAuthRequired: true,  // VID-4.4 starts authenticated on inventory/batches
  },
  "VID-4.5": {
    runner: runVID4_5,
    preAuthRequired: true,  // VID-4.5 starts authenticated on inventory/import
  },
  "VID-4.6": {
    runner: runVID4_6,
    preAuthRequired: true,  // VID-4.6 starts authenticated on inventory/import
  },
  "VID-4.7": {
    runner: runVID4_7,
    preAuthRequired: true,  // VID-4.7 starts authenticated on inventory/batches
  },
  "VID-4.8": {
    runner: runVID4_8,
    preAuthRequired: true,  // VID-4.8 starts authenticated on settings/schemes
  },
  "VID-5.1": {
    runner: runVID5_1,
    preAuthRequired: true,  // VID-5.1 starts authenticated on suppliers
  },
  "VID-5.2": {
    runner: runVID5_2,
    preAuthRequired: true,  // VID-5.2 starts authenticated on purchases
  },
  "VID-5.3": {
    runner: runVID5_3,
    preAuthRequired: true,  // VID-5.3 starts authenticated on purchases/new
  },
  "VID-5.4": {
    runner: runVID5_4,
    preAuthRequired: true,  // VID-5.4 starts authenticated on purchases/orders
  },
  "VID-5.5": {
    runner: runVID5_5,
    preAuthRequired: true,  // VID-5.5 starts authenticated on purchases/orders
  },
  "VID-5.6": {
    runner: runVID5_6,
    preAuthRequired: true,  // VID-5.6 starts authenticated on purchases/returns
  },
  "VID-5.7": {
    runner: runVID5_7,
    preAuthRequired: true,  // VID-5.7 starts authenticated on suppliers
  },
  "VID-6.1": {
    runner: runVID6_1,
    preAuthRequired: true,  // VID-6.1 starts authenticated on customers
  },
  "VID-6.2": {
    runner: runVID6_2,
    preAuthRequired: true,  // VID-6.2 starts authenticated on customers/groups
  },
  "VID-6.3": {
    runner: runVID6_3,
    preAuthRequired: true,  // VID-6.3 starts authenticated on settings/loyalty
  },
  "VID-6.4": {
    runner: runVID6_4,
    preAuthRequired: true,  // VID-6.4 starts authenticated on customers
  },
  "VID-6.5": {
    runner: runVID6_5,
    preAuthRequired: true,  // VID-6.5 starts authenticated on settings/medical-reps
  },
  "VID-7.1": {
    runner: runVID7_1,
    preAuthRequired: true,  // VID-7.1 starts authenticated on orders
  },
  "VID-7.2": {
    runner: runVID7_2,
    preAuthRequired: true,  // VID-7.2 starts authenticated on sales/promise-orders
  },
  "VID-7.3": {
    runner: runVID7_3,
    preAuthRequired: true,  // VID-7.3 starts authenticated on reminders
  },
  "VID-7.4": {
    runner: runVID7_4,
    preAuthRequired: true,  // VID-7.4 starts authenticated on settings/whatsapp
  },
  "VID-7.5": {
    runner: runVID7_5,
    preAuthRequired: true,  // VID-7.5 starts authenticated on whatsapp
  },
  "VID-8.1": {
    runner: runVID8_1,
    preAuthRequired: true,  // VID-8.1 starts authenticated on accounting
  },
  "VID-8.2": {
    runner: runVID8_2,
    preAuthRequired: true,  // VID-8.2 starts authenticated on accounting/receipts
  },
  "VID-8.3": {
    runner: runVID8_3,
    preAuthRequired: true,  // VID-8.3 starts authenticated on accounting/trial-balance
  },
  "VID-8.4": {
    runner: runVID8_4,
    preAuthRequired: true,  // VID-8.4 starts authenticated on accounting/outstanding
  },
  "VID-8.5": {
    runner: runVID8_5,
    preAuthRequired: true,  // VID-8.5 starts authenticated on accounting/bank-reconciliation
  },
};
