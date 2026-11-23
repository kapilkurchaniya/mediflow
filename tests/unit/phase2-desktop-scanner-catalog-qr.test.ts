import { describe, it, expect, vi, afterEach } from "vitest";
import { lookupIndianDrugReference, checkCdscoBannedFdc } from "@/lib/indian-drug-catalog";
import { parseDoctorQrPayload } from "@/lib/doctor-qr";
import {
  base64ToFile,
  isPhysicalScannerAvailable,
  listPhysicalScanners,
  scanFromPhysicalScanner,
  pollWatchedScans,
} from "@/desktop/scanner-bridge";

describe("Phase 2 — Indian Reference Drug Catalog & CDSCO Banned FDC Watchlist", () => {
  it("resolves brands with longest-alias precedence (Glycomet-GP vs Glycomet)", () => {
    const gp = lookupIndianDrugReference("GLYCOMET-GP 4MG FORTE TAB 10'S");
    expect(gp).not.toBeNull();
    expect(gp?.schedule).toBe("H");
    expect(gp?.genericName).toContain("Glimepiride");

    const plain = lookupIndianDrugReference("Glycomet 500 Tablet");
    expect(plain).not.toBeNull();
    expect(plain?.schedule).toBe("G");

    const amlong = lookupIndianDrugReference("AMLONG 2.5MG TAB");
    expect(amlong?.manufacturer).toBe("Micro Labs");
    expect(amlong?.schedule).toBe("H");
    expect(amlong?.category).toBe("Cardiovascular & BP");
    expect(amlong?.unitsPerPack).toBe(15);
  });

  it("flags CDSCO banned FDC combinations while allowing safe standard drugs", () => {
    const banned1 = checkCdscoBannedFdc(
      "Nimeplus DT",
      "Nimesulide 100mg + Paracetamol 325mg Dispersible Tablet"
    );
    expect(banned1.isBanned).toBe(true);
    expect(banned1.notificationRef).toContain("CDSCO");

    const banned2 = checkCdscoBannedFdc("Aceclo-P-Rab", "Aceclofenac + Paracetamol + Rabeprazole");
    expect(banned2.isBanned).toBe(true);

    const safe = checkCdscoBannedFdc("Dolo 650", "Paracetamol 650mg");
    expect(safe.isBanned).toBe(false);
  });
});

describe("Phase 2 — ABDM HPR / NMC Doctor QR Parser", () => {
  it("parses ABDM HPR JSON QR payloads", () => {
    const payload = JSON.stringify({
      hprId: "dr.abdul.majeed@hpr",
      name: "Dr. Abdul Majeed",
      registrationNumber: "KMC-45821",
      qualification: "MBBS, MD (Medicine)",
      specialization: "General Physician",
      facilityName: "Bangalore Heart Clinic",
      mobile: "9845012345",
    });
    const parsed = parseDoctorQrPayload(payload);
    expect(parsed).not.toBeNull();
    expect(parsed?.source).toBe("abdm_hpr");
    expect(parsed?.name).toBe("Dr. Abdul Majeed");
    expect(parsed?.regNo).toBe("KMC-45821");
    expect(parsed?.hprId).toBe("dr.abdul.majeed@hpr");
    expect(parsed?.hospital).toBe("Bangalore Heart Clinic");
  });

  it("parses ABDM HPR & NMC verification URLs", () => {
    const parsed = parseDoctorQrPayload(
      "https://hpr.abdm.gov.in/verify?hprId=dr.sharma@hpr&name=Dr.+A.+K.+Sharma&regNo=MCI-2015-8849"
    );
    expect(parsed?.source).toBe("abdm_hpr");
    expect(parsed?.name).toBe("Dr. A. K. Sharma");
    expect(parsed?.regNo).toBe("MCI-2015-8849");
    expect(parsed?.hprId).toBe("dr.sharma@hpr");
  });

  it("parses vCard doctor visiting card QR codes", () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Dr. Meera Nair",
      "ORG:Apollo Clinic",
      "TITLE:Cardiologist",
      "TEL:+919876543210",
      "NOTE:Reg No: MMC-99812",
      "END:VCARD",
    ].join("\n");
    const parsed = parseDoctorQrPayload(vcard);
    expect(parsed?.source).toBe("vcard");
    expect(parsed?.name).toBe("Dr. Meera Nair");
    expect(parsed?.hospital).toBe("Apollo Clinic");
    expect(parsed?.regNo).toBe("MMC-99812");
  });
});

describe("Phase 2 — Tauri Desktop Physical Scanner Bridge", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = originalWindow;
    }
  });

  it("converts base64 payload into a valid File object", async () => {
    const file = base64ToFile(Buffer.from("hello-scan").toString("base64"), "bill.png", "image/png");
    expect(file.name).toBe("bill.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(10);
  });

  it("invokes native Tauri IPC commands when running inside MediFlow Desktop", async () => {
    const invokeMock = vi.fn(async (cmd: string) => {
      if (cmd === "list_scanners") {
        return [{ id: "canon-lide-300", name: "Canon LiDE 300", driver: "wia", isDefault: true }];
      }
      if (cmd === "scan_document") {
        return {
          fileName: "mediflow-scan-1.png",
          mimeType: "image/png",
          base64Data: Buffer.from("PNGDATA").toString("base64"),
          scannerName: "Canon LiDE 300",
          source: "native_scanner",
        };
      }
      if (cmd === "poll_watch_folder") {
        return [
          {
            fileName: "rx-001.pdf",
            mimeType: "application/pdf",
            base64Data: Buffer.from("%PDF-1.4").toString("base64"),
            scannerName: "Watch Folder (prescriptions)",
            source: "watch_folder",
          },
        ];
      }
      return null;
    });

    (globalThis as Record<string, unknown>).window = {
      __TAURI_INTERNALS__: { invoke: invokeMock },
    };

    expect(isPhysicalScannerAvailable()).toBe(true);
    const devices = await listPhysicalScanners();
    expect(devices).toHaveLength(1);
    expect(devices[0].name).toBe("Canon LiDE 300");

    const scan = await scanFromPhysicalScanner({ scannerId: "canon-lide-300", dpi: 300 });
    expect(scan.file.name).toBe("mediflow-scan-1.png");
    expect(scan.file.type).toBe("image/png");

    const watched = await pollWatchedScans("prescriptions");
    expect(watched).toHaveLength(1);
    expect(watched[0].file.name).toBe("rx-001.pdf");
    expect(watched[0].file.type).toBe("application/pdf");
  });
});
