import Papa from "papaparse";

/**
 * Converts the first non-empty worksheet of an .xlsx / .xls workbook into CSV text
 * so it can run through MediFlow's existing distributor-invoice CSV parser.
 */
export async function xlsxFileToCsvText(file: File): Promise<string> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets.find((ws) => ws.rowCount > 0) ?? workbook.worksheets[0];
  if (!sheet) {
    throw new Error("The Excel workbook has no readable worksheets.");
  }

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = rawValues.map((cell) => {
      if (cell === null || cell === undefined) return "";
      if (typeof cell === "object") {
        if ("text" in cell && typeof cell.text === "string") return cell.text;
        if ("result" in cell && cell.result !== undefined && cell.result !== null) {
          return String(cell.result);
        }
        if (cell instanceof Date) return cell.toISOString().slice(0, 10);
      }
      return String(cell).trim();
    });
    if (cells.some((c) => c !== "")) {
      rows.push(cells);
    }
  });

  if (rows.length === 0) {
    throw new Error("No rows found in the Excel worksheet.");
  }

  return Papa.unparse(rows);
}
