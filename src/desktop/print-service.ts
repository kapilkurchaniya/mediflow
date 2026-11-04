import { buildEscPosReceipt } from "./escpos";
import { buildEscPDotMatrixInvoice } from "./escp";
import { getHardwareBridge } from "./hardware-bridge";
import type {
  SalePrintData,
  PrintFormat,
  PrintResult,
  ThermalPrintOptions,
  DotMatrixPrintOptions,
} from "./types";

export interface PrintOptions {
  printerName?: string;
  format?: PrintFormat;
  thermalOptions?: ThermalPrintOptions;
  dotMatrixOptions?: DotMatrixPrintOptions;
  kickDrawer?: boolean;
}

/**
 * High-level Print Service orchestrating silent raw printing with sub-second execution SLA.
 */
export class DesktopPrintService {
  private bridge = getHardwareBridge();

  async printSaleReceipt(
    data: SalePrintData,
    options?: PrintOptions,
  ): Promise<PrintResult> {
    const startTime = performance.now();
    const format = options?.format || "thermal-80mm";

    // 1. Resolve Target Printer
    let printerName = options?.printerName;
    if (!printerName) {
      const printers = await this.bridge.listPrinters();
      const matched = printers.find((p) => {
        if (format === "dotmatrix-80col") return p.kind === "dotmatrix";
        return p.kind === "thermal";
      });
      printerName = matched?.name || printers.find((p) => p.isDefault)?.name || "Default Printer";
    }

    try {
      // 2. Format binary payload
      let rawBytes: Uint8Array;
      if (format === "dotmatrix-80col") {
        rawBytes = buildEscPDotMatrixInvoice(data, options?.dotMatrixOptions);
      } else {
        const widthCols = format === "thermal-58mm" ? 32 : 48;
        rawBytes = buildEscPosReceipt(data, {
          widthCols,
          kickDrawer: options?.kickDrawer,
          ...options?.thermalOptions,
        });
      }

      // 3. Dispatch to hardware bridge
      const success = await this.bridge.printRaw(printerName, rawBytes);
      const durationMs = Math.round(performance.now() - startTime);

      if (durationMs > 1000) {
        console.warn(`[DesktopPrintService] Print SLA exceeded 1.0s: took ${durationMs}ms`);
      }

      return {
        success,
        durationMs,
        printerName,
        format,
        bytesSent: rawBytes.length,
      };
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[DesktopPrintService] Failed to print receipt:", err);
      return {
        success: false,
        durationMs,
        printerName,
        format,
        bytesSent: 0,
        error: errorMsg,
      };
    }
  }

  async kickDrawer(printerName?: string): Promise<boolean> {
    return await this.bridge.openCashDrawer({ printerName });
  }

  async testPrint(printerName: string, format: PrintFormat): Promise<PrintResult> {
    const testData: SalePrintData = {
      storeName: "MediFlow POS Test Terminal",
      storeAddress: "Hardware Bridge Direct Spooler Test",
      storeGstin: "27AAAAA0000A1Z5",
      invoiceNo: "TEST-000001",
      completedAt: new Date().toISOString(),
      cashierName: "Diagnostics",
      items: [
        {
          name: "Test Print Diagnostic Line",
          batchNo: "TEST-B1",
          expiryDate: "2099-12-31",
          packQty: 1,
          looseQty: 0,
          unitsPerPack: 1,
          mrpPaise: 100,
          ratePaise: 100,
          discountBp: 0,
          gstRateBp: 0,
          amountPaise: 100,
        },
      ],
      payments: [{ method: "cash", amountPaise: 100 }],
      grossPaise: 100,
      discountPaise: 0,
      taxablePaise: 100,
      cgstPaise: 0,
      sgstPaise: 0,
      igstPaise: 0,
      roundOffPaise: 0,
      totalPaise: 100,
    };

    return await this.printSaleReceipt(testData, { printerName, format });
  }
}

let printServiceInstance: DesktopPrintService | null = null;

export function getPrintService(): DesktopPrintService {
  if (!printServiceInstance) {
    printServiceInstance = new DesktopPrintService();
  }
  return printServiceInstance;
}
