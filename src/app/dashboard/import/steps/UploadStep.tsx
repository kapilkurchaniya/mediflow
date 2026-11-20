"use client";

import React, { useState } from "react";
import Papa from "papaparse";
import { FileText, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import { ImportEntity, ImportSource } from "@/server/domain/import/types";
import { detectPresetAction, createImportJobAction, uploadJobChunkAction } from "@/app/actions/import";
import { CsvDropzone } from "../_components/CsvDropzone";

interface UploadStepProps {
  entity: ImportEntity;
  storeId?: string;
  onJobReady: (params: {
    jobId: string;
    fileName: string;
    source: ImportSource;
    headers: string[];
    sampleRows: Record<string, string>[];
    suggestedMapping: Record<string, string>;
    totalRows: number;
  }) => void;
  onBack: () => void;
}

export function UploadStep({ entity, storeId, onJobReady, onBack }: UploadStepProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [detectedSource, setDetectedSource] = useState<ImportSource>("generic");
  const [detectedConfidence, setDetectedConfidence] = useState(0);
  const [suggestedMapping, setSuggestedMapping] = useState<Record<string, string>>({});

  const handleFileChange = (selectedFile: File) => {
    setErrorMessage("");
    setFile(selectedFile);
    setIsParsing(true);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: "greedy",
      complete: async (results) => {
        setIsParsing(false);
        const rawHeaders = (results.meta.fields || []).map((h) => h.trim()).filter(Boolean);
        const rows = (results.data as Record<string, string>[])
          .map((r) => {
            const trimmed: Record<string, string> = {};
            for (const [k, v] of Object.entries(r)) {
              const cleanKey = k.trim();
              if (cleanKey) trimmed[cleanKey] = v;
            }
            return trimmed;
          })
          .filter((r) =>
            Object.values(r).some((v) => v !== null && v !== undefined && String(v).trim().length > 0)
          );

        if (rawHeaders.length === 0 || rows.length === 0) {
          setErrorMessage("The uploaded file contains no data rows or valid header columns.");
          return;
        }

        setParsedHeaders(rawHeaders);
        setParsedRows(rows);

        // Auto-detect preset
        try {
          const detection = await detectPresetAction({ headers: rawHeaders, entity });
          setDetectedSource(detection.detectedSource);
          setDetectedConfidence(detection.confidence);
          setSuggestedMapping(detection.mapping);
        } catch (err: unknown) {
          console.error("Preset detection error:", err);
          setDetectedSource("generic");
        }
      },
      error: (err) => {
        setIsParsing(false);
        setErrorMessage(`CSV parsing error: ${err.message}`);
      },
    });
  };

  const handleStartStaging = async () => {
    if (!file || parsedRows.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage("");

    try {
      // 1. Create import staging job
      const createRes = await createImportJobAction({
        entity,
        source: detectedSource,
        fileName: file.name,
        storeId,
        mapping: suggestedMapping,
      });

      if (!createRes.success || !createRes.job) {
        throw new Error("Failed to initialize import staging job.");
      }

      const jobId = createRes.job.id;
      const CHUNK_SIZE = 1000;
      const totalChunks = Math.ceil(parsedRows.length / CHUNK_SIZE);

      // 2. Upload in 1,000-row chunks
      for (let i = 0; i < totalChunks; i++) {
        const chunk = parsedRows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await uploadJobChunkAction({ jobId, rows: chunk });
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      // 3. Inform parent wizard that staging is complete
      onJobReady({
        jobId,
        fileName: file.name,
        source: detectedSource,
        headers: parsedHeaders,
        sampleRows: parsedRows.slice(0, 5),
        suggestedMapping,
        totalRows: parsedRows.length,
      });
    } catch (err: unknown) {
      console.error("Staging error:", err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-xl font-bold text-ink-900 tracking-tight">Upload Data File</h2>
        <p className="text-sm text-ink-500 mt-1">
          Upload your exported CSV or TSV file. MediFlow automatically identifies column formats and accounting presets.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Upload Error</div>
            <div>{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Dropzone */}
      <CsvDropzone
        onFileSelected={handleFileChange}
        isLoading={isParsing}
        selectedFileName={file?.name ?? null}
        title="Drop your CSV or TSV file here"
        subtitle="Supports Marg CSV, GoFrugal CSV, and standard Tab-delimited files up to 50 MB"
      />
      {file && (
        <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-ink-900">{file.name}</h4>
                <p className="text-xs text-ink-500">
                  {(file.size / 1024).toFixed(1)} KB · {parsedRows.length.toLocaleString()} rows detected
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => {
                setFile(null);
                setParsedRows([]);
                setParsedHeaders([]);
              }}
              className="text-xs text-ink-500 hover:text-red-600 font-medium"
            >
              Choose another file
            </button>
          </div>

          {/* Preset Detection Badge */}
          {parsedHeaders.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-ink-700">
                  Detected Preset:{" "}
                  <strong className="text-ink-900 uppercase">
                    {detectedSource === "marg"
                      ? "Marg ERP 9+ Format"
                      : detectedSource === "gofrugal"
                      ? "GoFrugal Pharma Format"
                      : "Generic CSV Format"}
                  </strong>
                </span>
              </div>
              <span className="text-ink-500">
                Confidence: <strong className="text-emerald-700">{Math.round(detectedConfidence * 100)}%</strong>
              </span>
            </div>
          )}

          {/* Sample Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-ink-600 uppercase tracking-wider">File Preview (First 5 Rows)</div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-56">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-ink-700 font-medium border-b border-slate-200 sticky top-0">
                    <tr>
                      {parsedHeaders.slice(0, 7).map((h) => (
                        <th key={h} className="px-3 py-2 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        {parsedHeaders.slice(0, 7).map((h) => (
                          <td key={h} className="px-3 py-1.5 text-ink-600 whitespace-nowrap max-w-xs truncate">
                            {row[h] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload Progress Bar */}
          {isUploading && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-medium text-ink-700">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
                  Staging rows in database ({uploadProgress}%)...
                </span>
                <span>{parsedRows.length.toLocaleString()} rows</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-brand-600 transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          disabled={isUploading}
          onClick={onBack}
          className="btn btn-secondary px-5 py-2.5 rounded-xl font-medium flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <button
          type="button"
          disabled={!file || parsedRows.length === 0 || isParsing || isUploading}
          onClick={handleStartStaging}
          className="btn btn-primary px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Staging...
            </>
          ) : (
            "Next: Map Columns →"
          )}
        </button>
      </div>
    </div>
  );
}
