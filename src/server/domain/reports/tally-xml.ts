export interface TallyAccountInput {
  code: string;
  name: string;
  type: string; // asset | liability | equity | income | expense
  systemKey?: string | null;
}

export interface TallyVoucherLineInput {
  accountName: string;
  debitPaise: number;
  creditPaise: number;
}

export interface TallyVoucherInput {
  entryNo: string;
  entryDate: string; // YYYY-MM-DD
  narration: string;
  refType?: string | null;
  lines: TallyVoucherLineInput[];
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatTallyDate(isoDate: string): string {
  return isoDate.slice(0, 10).replace(/-/g, "");
}

export function formatTallyAmount(paise: number): string {
  return (paise / 100).toFixed(2);
}

export function mapAccountToTallyGroup(account: TallyAccountInput): string {
  const key = account.systemKey ?? "";
  if (key === "cash") return "Cash-in-Hand";
  if (key === "bank") return "Bank Accounts";
  if (key === "debtors") return "Sundry Debtors";
  if (key === "creditors") return "Sundry Creditors";
  if (key === "inventory") return "Stock-in-Hand";
  if (key.includes("cgst") || key.includes("sgst") || key.includes("igst")) return "Duties & Taxes";
  if (key === "sales") return "Sales Accounts";
  if (key === "purchases") return "Purchase Accounts";

  switch (account.type) {
    case "asset":
      return "Current Assets";
    case "liability":
      return "Current Liabilities";
    case "equity":
      return "Capital Account";
    case "income":
      return "Indirect Incomes";
    case "expense":
    default:
      return "Indirect Expenses";
  }
}

export function mapRefTypeToTallyVoucherType(refType?: string | null): string {
  switch (refType) {
    case "sale":
      return "Sales";
    case "purchase":
      return "Purchase";
    case "receipt":
    case "payment_in":
      return "Receipt";
    case "payment":
    case "payment_out":
    case "expense":
      return "Payment";
    case "contra":
      return "Contra";
    case "debit_note":
    case "purchase_return":
      return "Debit Note";
    case "credit_note":
    case "sale_return":
      return "Credit Note";
    case "journal_voucher":
    default:
      return "Journal";
  }
}

export function generateTallyMastersXml(companyName: string, accounts: TallyAccountInput[]): string {
  const safeCompany = escapeXml(companyName || "MediFlow Pharmacy");
  const messages = accounts
    .map((acc) => {
      const name = escapeXml(acc.name);
      const parent = escapeXml(mapAccountToTallyGroup(acc));
      return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <LEDGER NAME="${name}" ACTION="Create">
          <NAME.LIST>
            <NAME>${name}</NAME>
          </NAME.LIST>
          <PARENT>${parent}</PARENT>
          <ISBILLWISEON>No</ISBILLWISEON>
          <AFFECTSSTOCK>No</AFFECTSSTOCK>
        </LEDGER>
      </TALLYMESSAGE>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${safeCompany}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${messages}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

export function generateTallyDayBookXml(companyName: string, vouchers: TallyVoucherInput[]): string {
  const safeCompany = escapeXml(companyName || "MediFlow Pharmacy");
  const messages = vouchers
    .map((v) => {
      const vchType = escapeXml(mapRefTypeToTallyVoucherType(v.refType));
      const tallyDate = formatTallyDate(v.entryDate);
      const safeNarration = escapeXml(v.narration || "");
      const safeNo = escapeXml(v.entryNo);

      const ledgerEntries = v.lines
        .map((line) => {
          const isDebit = line.debitPaise > 0;
          const amountPaise = isDebit ? line.debitPaise : line.creditPaise;
          // In Tally XML: Debit is negative (-amount) with ISDEEMEDPOSITIVE=Yes; Credit is positive (+amount) with ISDEEMEDPOSITIVE=No
          const signedAmount = isDebit ? `-${formatTallyAmount(amountPaise)}` : formatTallyAmount(amountPaise);
          const deemedPositive = isDebit ? "Yes" : "No";
          return `          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(line.accountName)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>${deemedPositive}</ISDEEMEDPOSITIVE>
            <AMOUNT>${signedAmount}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>`;
        })
        .join("\n");

      return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="${vchType}" ACTION="Create">
          <DATE>${tallyDate}</DATE>
          <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${safeNo}</VOUCHERNUMBER>
          <NARRATION>${safeNarration}</NARRATION>
${ledgerEntries}
        </VOUCHER>
      </TALLYMESSAGE>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${safeCompany}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
${messages}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
