"use client";

import { useState } from "react";
import { Edit2, X, Check, Loader2, AlertCircle, Info } from "lucide-react";
import { updateMedicine } from "@/app/actions/inventory";
import { useRouter } from "next/navigation";

export interface EditableMedicineData {
  id: string;
  name: string;
  genericName: string | null;
  manufacturerId: string | null;
  categoryId: string | null;
  packSize: string | null;
  unitsPerPack: number;
  packUnit: string;
  looseUnit: string;
  barcode: string | null;
  hsn: string | null;
  gstRateBp: number;
  mrp: number;
  salePrice: number;
  purchasePrice: number;
  rxRequired: boolean;
  schedule: string;
  isActive: boolean;
}

interface EditMedicineButtonProps {
  medicine: EditableMedicineData;
  categories: Array<{ id: string; name: string }>;
  manufacturers: Array<{ id: string; name: string }>;
  canAdjustStock?: boolean;
}

export function EditMedicineButton({
  medicine,
  categories,
  manufacturers,
  canAdjustStock = false,
}: EditMedicineButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(medicine.name);
  const [genericName, setGenericName] = useState(medicine.genericName || "");
  const [categoryId, setCategoryId] = useState(medicine.categoryId || "");
  const [manufacturerId, setManufacturerId] = useState(medicine.manufacturerId || "");
  const [barcode, setBarcode] = useState(medicine.barcode || "");
  const [hsn, setHsn] = useState(medicine.hsn || "");
  const [gstRatePct, setGstRatePct] = useState(String((medicine.gstRateBp || 500) / 100));
  const [mrp, setMrp] = useState(((medicine.mrp || 0) / 100).toFixed(2));
  const [salePrice, setSalePrice] = useState(((medicine.salePrice || medicine.mrp || 0) / 100).toFixed(2));
  const [purchasePrice, setPurchasePrice] = useState(((medicine.purchasePrice || 0) / 100).toFixed(2));
  const [packUnit, setPackUnit] = useState(medicine.packUnit || "strip");
  const [unitsPerPack, setUnitsPerPack] = useState(String(medicine.unitsPerPack || 1));
  const [looseUnit, setLooseUnit] = useState(medicine.looseUnit || "tablet");
  const [packSize, setPackSize] = useState(medicine.packSize || "");
  const [schedule, setSchedule] = useState(medicine.schedule || "none");
  const [rxRequired, setRxRequired] = useState(medicine.rxRequired);
  const [isActive, setIsActive] = useState(medicine.isActive);
  const [convertExistingBatches, setConvertExistingBatches] = useState(false);

  const parsedUpp = parseInt(unitsPerPack, 10) || 1;
  const uppChanged = parsedUpp !== medicine.unitsPerPack && parsedUpp >= 1;

  const handleOpen = () => {
    setName(medicine.name);
    setGenericName(medicine.genericName || "");
    setCategoryId(medicine.categoryId || "");
    setManufacturerId(medicine.manufacturerId || "");
    setBarcode(medicine.barcode || "");
    setHsn(medicine.hsn || "");
    setGstRatePct(String((medicine.gstRateBp || 500) / 100));
    setMrp(((medicine.mrp || 0) / 100).toFixed(2));
    setSalePrice(((medicine.salePrice || medicine.mrp || 0) / 100).toFixed(2));
    setPurchasePrice(((medicine.purchasePrice || 0) / 100).toFixed(2));
    setPackUnit(medicine.packUnit || "strip");
    setUnitsPerPack(String(medicine.unitsPerPack || 1));
    setLooseUnit(medicine.looseUnit || "tablet");
    setPackSize(medicine.packSize || "");
    setSchedule(medicine.schedule || "none");
    setRxRequired(medicine.rxRequired);
    setIsActive(medicine.isActive);
    setConvertExistingBatches(false);
    setError(null);
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const fd = new FormData();
    fd.append("medicineId", medicine.id);
    fd.append("name", name);
    fd.append("genericName", genericName);
    fd.append("categoryId", categoryId);
    fd.append("manufacturerId", manufacturerId);
    fd.append("barcode", barcode);
    fd.append("hsn", hsn);
    fd.append("gstRatePct", gstRatePct);
    fd.append("mrp", mrp);
    fd.append("salePrice", salePrice);
    fd.append("purchasePrice", purchasePrice);
    fd.append("packUnit", packUnit);
    fd.append("unitsPerPack", unitsPerPack);
    fd.append("looseUnit", looseUnit);
    fd.append("packSize", packSize);
    fd.append("schedule", schedule);
    if (rxRequired) fd.append("rxRequired", "on");
    if (isActive) fd.append("isActive", "on");
    if (uppChanged && convertExistingBatches) fd.append("convertExistingBatches", "on");

    try {
      const res = await updateMedicine(fd);
      if (res.error) {
        setError(res.error);
        setIsSubmitting(false);
      } else {
        setIsOpen(false);
        setIsSubmitting(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update medicine");
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="p-1.5 rounded text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
        title="Edit medicine details & strip/loose packaging"
        data-tooltip-title="Edit Medicine"
        data-tooltip="Edit name, composition, strip size (units per pack), MRP, GST & schedule"
        aria-label={`Edit ${medicine.name}`}
      >
        <Edit2 className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-xl h-full flex flex-col shadow-2xl border-l border-ink-200 text-left">
            <div className="flex items-center justify-between border-b border-ink-150 px-5 py-4 shrink-0">
              <div>
                <h3 className="text-base font-bold text-ink-900">Edit Medicine</h3>
                <p className="text-xs text-ink-500 mt-0.5 truncate max-w-md">{medicine.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {error && (
                  <div className="alert-error text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Identification</h4>
                  <div>
                    <label className="label" htmlFor={`med-name-${medicine.id}`}>Item Name *</label>
                    <input
                      id={`med-name-${medicine.id}`}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor={`med-gen-${medicine.id}`}>Generic Composition</label>
                    <input
                      id={`med-gen-${medicine.id}`}
                      value={genericName}
                      onChange={(e) => setGenericName(e.target.value)}
                      className="input"
                      placeholder="e.g. Paracetamol 650 mg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label" htmlFor={`med-cat-${medicine.id}`}>Category</label>
                      <select
                        id={`med-cat-${medicine.id}`}
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="input"
                      >
                        <option value="">Uncategorised</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor={`med-mfg-${medicine.id}`}>Manufacturer</label>
                      <select
                        id={`med-mfg-${medicine.id}`}
                        value={manufacturerId}
                        onChange={(e) => setManufacturerId(e.target.value)}
                        className="input"
                      >
                        <option value="">Unspecified</option>
                        {manufacturers.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-ink-150">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                    Packaging &amp; Loose Tablet Selling
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label" htmlFor={`med-packunit-${medicine.id}`}>Pack Unit</label>
                      <select
                        id={`med-packunit-${medicine.id}`}
                        value={packUnit}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPackUnit(val);
                          if (val === "strip" && looseUnit === "piece") setLooseUnit("tablet");
                        }}
                        className="input"
                      >
                        <option value="strip">Strip</option>
                        <option value="bottle">Bottle</option>
                        <option value="pack">Pack</option>
                        <option value="box">Box</option>
                        <option value="vial">Vial</option>
                        <option value="tube">Tube</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor={`med-upp-${medicine.id}`}>Units / Pack</label>
                      <input
                        id={`med-upp-${medicine.id}`}
                        type="number"
                        min={1}
                        required
                        value={unitsPerPack}
                        onChange={(e) => setUnitsPerPack(e.target.value)}
                        className="input num"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`med-looseunit-${medicine.id}`}>Loose Unit</label>
                      <select
                        id={`med-looseunit-${medicine.id}`}
                        value={looseUnit}
                        onChange={(e) => setLooseUnit(e.target.value)}
                        className="input"
                      >
                        <option value="tablet">Tablet</option>
                        <option value="capsule">Capsule</option>
                        <option value="piece">Piece</option>
                        <option value="ml">ml</option>
                        <option value="sachet">Sachet</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-[11.5px] text-ink-500">
                    Set <strong>Units / Pack &gt; 1</strong> (e.g. 10 or 15) to enable loose {looseUnit} billing in POS.
                  </p>

                  {uppChanged && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-2 text-xs text-amber-900">
                      <div className="flex items-start gap-2">
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          Strip size changed from <strong>{medicine.unitsPerPack}</strong> to <strong>{parsedUpp}</strong> {looseUnit}s/{packUnit}.
                        </span>
                      </div>
                      {canAdjustStock && (
                        <label className="flex items-start gap-2 cursor-pointer font-medium">
                          <input
                            type="checkbox"
                            checked={convertExistingBatches}
                            onChange={(e) => setConvertExistingBatches(e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>
                            Convert existing batch stock in this branch proportionally (e.g. {medicine.unitsPerPack === 1 ? `50 strips → ${50 * parsedUpp} ${looseUnit}s` : `rescale qty & PTR`})
                          </span>
                        </label>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="label" htmlFor={`med-packsize-${medicine.id}`}>Pack Size Label</label>
                    <input
                      id={`med-packsize-${medicine.id}`}
                      value={packSize}
                      onChange={(e) => setPackSize(e.target.value)}
                      className="input"
                      placeholder="e.g. 15 tablets / 100 ml"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-ink-150">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Pricing &amp; Tax</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label" htmlFor={`med-mrp-${medicine.id}`}>MRP (₹/pack)</label>
                      <input
                        id={`med-mrp-${medicine.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={mrp}
                        onChange={(e) => setMrp(e.target.value)}
                        className="input num"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`med-sale-${medicine.id}`}>Sale Price (₹)</label>
                      <input
                        id={`med-sale-${medicine.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={salePrice}
                        onChange={(e) => setSalePrice(e.target.value)}
                        className="input num"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`med-ptr-${medicine.id}`}>PTR (₹/base)</label>
                      <input
                        id={`med-ptr-${medicine.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        value={purchasePrice}
                        onChange={(e) => setPurchasePrice(e.target.value)}
                        className="input num"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label" htmlFor={`med-gst-${medicine.id}`}>GST Rate</label>
                      <select
                        id={`med-gst-${medicine.id}`}
                        value={gstRatePct}
                        onChange={(e) => setGstRatePct(e.target.value)}
                        className="input"
                      >
                        <option value="0">0% — Exempt</option>
                        <option value="5">5% (GST 2.0)</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor={`med-hsn-${medicine.id}`}>HSN Code</label>
                      <input
                        id={`med-hsn-${medicine.id}`}
                        value={hsn}
                        onChange={(e) => setHsn(e.target.value)}
                        className="input font-mono"
                        placeholder="30049099"
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`med-barcode-${medicine.id}`}>Barcode</label>
                      <input
                        id={`med-barcode-${medicine.id}`}
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        className="input font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-ink-150">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Compliance &amp; Status</h4>
                  <div className="grid grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="label" htmlFor={`med-sched-${medicine.id}`}>Drug Schedule</label>
                      <select
                        id={`med-sched-${medicine.id}`}
                        value={schedule}
                        onChange={(e) => setSchedule(e.target.value)}
                        className="input"
                      >
                        <option value="none">None (OTC)</option>
                        <option value="G">Schedule G</option>
                        <option value="H">Schedule H</option>
                        <option value="H1">Schedule H1</option>
                        <option value="X">Schedule X</option>
                        <option value="narcotic">Narcotic (NDPS)</option>
                      </select>
                    </div>
                    <div className="space-y-2 pt-4">
                      <label className="flex items-center gap-2 text-xs font-medium text-ink-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rxRequired}
                          onChange={(e) => setRxRequired(e.target.checked)}
                        />
                        <span>Prescription (Rx) Required</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs font-medium text-ink-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) => setIsActive(e.target.checked)}
                        />
                        <span>Active in Catalog</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-ink-150 bg-ink-50/70 px-5 py-3.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn btn-ghost btn-sm"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="btn btn-primary btn-sm">
                  {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {isSubmitting ? "Saving…" : "Save Medicine"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

