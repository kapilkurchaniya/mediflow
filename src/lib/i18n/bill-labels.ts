export type BillLanguage = "en" | "hi" | "mr" | "gu" | "ta" | "bn";

export interface BillLabelSet {
  taxInvoice: string;
  invoiceNo: string;
  date: string;
  patient: string;
  doctor: string;
  item: string;
  batch: string;
  expiry: string;
  qty: string;
  mrp: string;
  rate: string;
  gst: string;
  total: string;
  thankYou: string;
}

const DICTIONARY: Record<BillLanguage, BillLabelSet> = {
  en: {
    taxInvoice: "TAX INVOICE",
    invoiceNo: "Invoice No",
    date: "Date",
    patient: "Patient",
    doctor: "Doctor",
    item: "Medicine",
    batch: "Batch",
    expiry: "Exp",
    qty: "Qty",
    mrp: "MRP",
    rate: "Rate",
    gst: "GST",
    total: "Total",
    thankYou: "Thank you. Get well soon!",
  },
  hi: {
    taxInvoice: "टैक्स इनवॉइस (रसीद)",
    invoiceNo: "बिल नंबर",
    date: "दिनांक",
    patient: "रोगी",
    doctor: "डॉक्टर",
    item: "दवाई का नाम",
    batch: "बैच",
    expiry: "समाप्ति",
    qty: "मात्रा",
    mrp: "अधिकतम मूल्य",
    rate: "दर",
    gst: "जीएसटी",
    total: "कुल राशि",
    thankYou: "धन्यवाद! शीघ्र स्वस्थ हों।",
  },
  mr: {
    taxInvoice: "कर पावती",
    invoiceNo: "बिल क्रमांक",
    date: "दिनांक",
    patient: "रुग्ण",
    doctor: "डॉक्टर",
    item: "औषध",
    batch: "बॅच",
    expiry: "मुदत",
    qty: "प्रमाण",
    mrp: "एमआरपी",
    rate: "दर",
    gst: "जीएसटी",
    total: "एकूण",
    thankYou: "धन्यवाद! लवकर बरे व्हा.",
  },
  gu: {
    taxInvoice: "ટેક્સ ઇન્વોઇસ",
    invoiceNo: "બિલ નં.",
    date: "તારીખ",
    patient: "દર્દી",
    doctor: "ડૉક્ટર",
    item: "દવા",
    batch: "બેચ",
    expiry: "એક્સપાયરી",
    qty: "જથ્થો",
    mrp: "એમઆરપી",
    rate: "ભાવ",
    gst: "જીએસટી",
    total: "કુલ રકમ",
    thankYou: "આભાર! જલ્દી સાજા થાઓ.",
  },
  ta: {
    taxInvoice: "வரி ரசீது",
    invoiceNo: "ரசீது எண்",
    date: "தேதி",
    patient: "நோயாளி",
    doctor: "மருத்துவர்",
    item: "மருந்து",
    batch: "பேட்ச்",
    expiry: "காலாவதி",
    qty: "அளவு",
    mrp: "எம்.ஆர்.பி",
    rate: "விலை",
    gst: "ஜி.எஸ்.டி",
    total: "மொத்தம்",
    thankYou: "நன்றி! விரைவில் குணமடையுங்கள்.",
  },
  bn: {
    taxInvoice: "ট্যাক্স ইনভয়েস",
    invoiceNo: "বিল নং",
    date: "তারিখ",
    patient: "রোগী",
    doctor: "ডাক্তার",
    item: "ওষুধ",
    batch: "ব্যাচ",
    expiry: "মেয়াদ",
    qty: "পরিমাণ",
    mrp: "এমআরপি",
    rate: "দর",
    gst: "জিএসটি",
    total: "মোট",
    thankYou: "ধন্যবাদ! দ্রুত সুস্থ হয়ে উঠুন।",
  },
};

export function getBillLabels(lang?: BillLanguage | null): BillLabelSet {
  return DICTIONARY[lang ?? "en"] ?? DICTIONARY.en;
}
