export type ShortcutProfile = "mediflow" | "marg";
export type ShortcutScope = "global" | "pos" | "vouchers" | "grn";

export interface KeyBindingSpec {
  id: string;
  scope: ShortcutScope;
  label: string;
  mediflowKey: string;
  margKey: string;
}

export const KEYMAP_REGISTRY: KeyBindingSpec[] = [
  { id: "palette", scope: "global", label: "Command Palette", mediflowKey: "Ctrl+K", margKey: "Ctrl+K" },
  { id: "calculator", scope: "global", label: "Calculator", mediflowKey: "F12", margKey: "F12" },
  { id: "shortcuts", scope: "global", label: "Shortcut Sheet", mediflowKey: "Ctrl+F1", margKey: "Alt+F1" },
  { id: "pos.search", scope: "pos", label: "Focus Search", mediflowKey: "F3 / /", margKey: "Insert / F3" },
  { id: "pos.new_bill", scope: "pos", label: "New / Park+New Bill", mediflowKey: "F2", margKey: "F2 (Park+New)" },
  { id: "pos.customer", scope: "pos", label: "Customer Picker", mediflowKey: "F5", margKey: "F5" },
  { id: "pos.hold", scope: "pos", label: "Hold / Recall", mediflowKey: "F6 / F7", margKey: "F6 / F7" },
  { id: "pos.payment", scope: "pos", label: "Payment / UPI QR", mediflowKey: "F8 (U=QR)", margKey: "F8 (U=QR)" },
  { id: "pos.save", scope: "pos", label: "Complete Sale", mediflowKey: "F10 / Ctrl+Enter", margKey: "End / Ctrl+W" },
  { id: "pos.undo", scope: "pos", label: "Undo Cart Line", mediflowKey: "Ctrl+Z", margKey: "Alt+Backspace" },
  { id: "pos.profit", scope: "pos", label: "Bill Profit", mediflowKey: "Alt+F10", margKey: "Alt+F10" },
  { id: "vch.journal", scope: "vouchers", label: "Journal", mediflowKey: "F4", margKey: "F4" },
  { id: "vch.debit", scope: "vouchers", label: "Debit Note", mediflowKey: "F5", margKey: "F5" },
  { id: "vch.credit", scope: "vouchers", label: "Credit Note", mediflowKey: "F6", margKey: "F6" },
  { id: "vch.contra", scope: "vouchers", label: "Contra", mediflowKey: "F7", margKey: "F7" },
];

export function getBindingsForScope(scope: ShortcutScope, profile: ShortcutProfile = "mediflow") {
  return KEYMAP_REGISTRY.filter((b) => b.scope === scope).map((b) => ({
    id: b.id,
    label: b.label,
    keyLabel: profile === "marg" ? b.margKey : b.mediflowKey,
  }));
}

export function detectKeymapConflicts(
  bindings: Array<{ scope: ShortcutScope; key: string; id: string }>,
): Array<{ scope: ShortcutScope; key: string; ids: string[] }> {
  const seen = new Map<string, string[]>();
  for (const b of bindings) {
    const k = `${b.scope}::${b.key.toLowerCase().trim()}`;
    const arr = seen.get(k) ?? [];
    arr.push(b.id);
    seen.set(k, arr);
  }
  const conflicts: Array<{ scope: ShortcutScope; key: string; ids: string[] }> = [];
  for (const [k, ids] of seen.entries()) {
    if (ids.length > 1) {
      const [scope, key] = k.split("::") as [ShortcutScope, string];
      conflicts.push({ scope, key, ids });
    }
  }
  return conflicts;
}
