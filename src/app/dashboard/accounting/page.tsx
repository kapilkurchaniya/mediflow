import { getTrialBalance, getJournalLines } from "@/app/actions/accounting";
import { BookOpen, IndianRupee, FileText } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

export const metadata = {
  title: "Accounting - MediFlow",
};

export default async function AccountingPage() {
  const trialBalance = await getTrialBalance();
  const journalLines = await getJournalLines();

  const totalDebit = trialBalance.reduce((sum, row) => sum + row.totalDebit, 0);
  const totalCredit = trialBalance.reduce((sum, row) => sum + row.totalCredit, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Accounting Ledger</h1>
          <p className="text-slate-500 mt-1">Double-entry Trial Balance and recent journal entries.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trial Balance */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center">
              <BookOpen className="h-5 w-5 mr-2 text-brand-600" />
              Trial Balance
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {trialBalance.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <FileText className="h-10 w-10 mb-4 opacity-20" />
                <p>No account balances found.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="py-3 font-medium">Account</th>
                    <th className="py-3 font-medium text-right text-green-600">Debit (Dr)</th>
                    <th className="py-3 font-medium text-right text-red-600">Credit (Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {trialBalance.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="py-3">
                        <div className="font-medium text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-400 capitalize">{row.type} • {row.code}</div>
                      </td>
                      <td className="py-3 text-right font-medium text-slate-700">
                        {row.balance > 0 ? `₹${(Math.abs(row.balance) / 100).toFixed(2)}` : "-"}
                      </td>
                      <td className="py-3 text-right font-medium text-slate-700">
                        {row.balance < 0 ? `₹${(Math.abs(row.balance) / 100).toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 font-bold text-slate-900">
                  <tr>
                    <td className="py-4">Total</td>
                    <td className="py-4 text-right">₹{(totalDebit / 100).toFixed(2)}</td>
                    <td className="py-4 text-right">₹{(totalCredit / 100).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

        {/* Daybook / Recent Journals */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 flex items-center">
              <FileText className="h-5 w-5 mr-2 text-indigo-600" />
              Recent Journal Lines (Daybook)
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {journalLines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <p>No journal entries posted yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {journalLines.map(({ line, entry, account }) => (
                  <div key={line.id} className="p-3 border border-slate-100 rounded-xl hover:border-slate-200 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-sm font-semibold text-slate-900">{account.name}</div>
                      <div className="text-xs text-slate-500">{format(new Date(entry.entryDate), "dd MMM")}</div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-slate-500 truncate max-w-[200px]" title={entry.narration}>
                        {entry.narration} ({entry.entryNo})
                      </div>
                      <div className={`text-sm font-bold ${line.debit! > 0 ? "text-green-600" : "text-red-600"}`}>
                        {line.debit! > 0 ? `+ ₹${(line.debit! / 100).toFixed(2)}` : `- ₹${(line.credit! / 100).toFixed(2)}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
