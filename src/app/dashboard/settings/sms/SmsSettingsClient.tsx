"use client";

import { useState } from "react";
import { saveSmsConfig, sendTestSms } from "@/app/actions/sms";
import {
  saveSmsTemplateAction,
  toggleSmsTemplateAction,
  deleteSmsTemplateAction,
  testDltSmsDispatchAction,
  type SmsTemplateRecord,
} from "@/app/actions/sms-templates";
import {
  Check,
  AlertCircle,
  Key,
  ShieldCheck,
  Send,
  Plus,
  Edit2,
  Trash2,
  Smartphone,
  FileText,
  X,
  Radio,
  CheckCircle2,
} from "lucide-react";
import { FormSection, Field } from "@/app/components/ui";
import { calculateSmsCredits, validateSenderId, extractDltVariables } from "@/lib/dlt";

interface SmsConfigData {
  provider: string;
  apiKey: string | null;
  senderId: string | null;
  isActive: boolean;
}

interface SmsSettingsClientProps {
  initialConfig: SmsConfigData | null;
  initialTemplates: SmsTemplateRecord[];
}

export function SmsSettingsClient({
  initialConfig,
  initialTemplates,
}: SmsSettingsClientProps) {
  const [activeTab, setActiveTab] = useState<"gateway" | "templates">("gateway");

  // Gateway state
  const [provider, setProvider] = useState(initialConfig?.provider || "msg91");
  const [isActive, setIsActive] = useState(initialConfig?.isActive ?? false);
  const [gatewaySuccess, setGatewaySuccess] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [gatewayPending, setGatewayPending] = useState(false);

  // Test SMS state
  const [testPhone, setTestPhone] = useState("");
  const [testMsg, setTestMsg] = useState("MediFlow Pharmacy test notification.");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testPending, setTestPending] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<SmsTemplateRecord[]>(initialTemplates);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplateRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Live editor state in modal
  const [formName, setFormName] = useState("");
  const [formSenderId, setFormSenderId] = useState("MEDFLW");
  const [formDltId, setFormDltId] = useState("");
  const [formEntityId, setFormEntityId] = useState("");
  const [formCategory, setFormCategory] = useState("service_implicit");
  const [formBody, setFormBody] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  // Test Template Dispatch state
  const [testTmplModal, setTestTmplModal] = useState<SmsTemplateRecord | null>(null);
  const [testTmplPhone, setTestTmplPhone] = useState("");
  const [testTmplVars, setTestTmplVars] = useState<Record<string, string>>({});
  const [testTmplResult, setTestTmplResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [testTmplPending, setTestTmplPending] = useState(false);

  // --- Handlers: Gateway ---
  const handleGatewaySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setGatewayPending(true);
    setGatewaySuccess(false);
    setGatewayError(null);

    const formData = new FormData(e.currentTarget);
    formData.set("provider", provider);
    formData.set("isActive", isActive ? "on" : "off");

    const res = await saveSmsConfig(formData);
    if (res.error) {
      setGatewayError(res.error);
    } else {
      setGatewaySuccess(true);
      setTimeout(() => setGatewaySuccess(false), 3000);
    }
    setGatewayPending(false);
  };

  const handleTestSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone) return;
    setTestPending(true);
    setTestResult(null);

    const res = await sendTestSms(testPhone, testMsg);
    if ("error" in res && res.error) {
      setTestResult(`Failed: ${res.error}`);
    } else if ("provider" in res) {
      setTestResult(`SMS Sent successfully via ${res.provider}! (ID: ${res.messageId})`);
    }
    setTestPending(false);
  };

  // --- Handlers: Templates ---
  const openNewTemplateModal = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormSenderId(initialConfig?.senderId || "MEDFLW");
    setFormDltId("");
    setFormEntityId("");
    setFormCategory("service_implicit");
    setFormBody("");
    setFormDescription("");
    setFormIsActive(true);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditTemplateModal = (tmpl: SmsTemplateRecord) => {
    setEditingTemplate(tmpl);
    setFormName(tmpl.name);
    setFormSenderId(tmpl.senderId);
    setFormDltId(tmpl.dltTemplateId || "");
    setFormEntityId(tmpl.entityId || "");
    setFormCategory(tmpl.category);
    setFormBody(tmpl.body);
    setFormDescription(tmpl.description || "");
    setFormIsActive(tmpl.isActive);
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalPending(true);
    setModalError(null);

    const senderCheck = validateSenderId(formSenderId);
    if (!senderCheck.valid) {
      setModalError(senderCheck.error || "Invalid Sender ID");
      setModalPending(false);
      return;
    }

    const formData = new FormData();
    if (editingTemplate) {
      formData.set("id", editingTemplate.id);
    }
    formData.set("name", formName.trim());
    formData.set("senderId", formSenderId.trim().toUpperCase());
    formData.set("dltTemplateId", formDltId.trim());
    formData.set("entityId", formEntityId.trim());
    formData.set("category", formCategory);
    formData.set("body", formBody.trim());
    formData.set("description", formDescription.trim());
    formData.set("isActive", formIsActive ? "true" : "false");

    const res = await saveSmsTemplateAction(formData);
    if (res.error) {
      setModalError(res.error);
    } else {
      setIsModalOpen(false);
      // Update local state optimistic update
      const extractedVars = extractDltVariables(formBody);
      if (editingTemplate) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editingTemplate.id
              ? {
                  ...t,
                  name: formName.trim(),
                  senderId: formSenderId.trim().toUpperCase(),
                  dltTemplateId: formDltId.trim(),
                  entityId: formEntityId.trim() || null,
                  category: formCategory,
                  body: formBody.trim(),
                  variables: extractedVars,
                  description: formDescription.trim() || null,
                  isActive: formIsActive,
                  updatedAt: new Date(),
                }
              : t
          )
        );
      } else {
        setTemplates((prev) => [
          ...prev,
          {
            id: `temp_${Date.now()}`,
            tenantId: "",
            name: formName.trim(),
            senderId: formSenderId.trim().toUpperCase(),
            dltTemplateId: formDltId.trim(),
            entityId: formEntityId.trim() || null,
            category: formCategory,
            body: formBody.trim(),
            variables: extractedVars,
            description: formDescription.trim() || null,
            isActive: formIsActive,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]);
      }
    }
    setModalPending(false);
  };

  const handleToggleTemplate = async (templateId: string, currentActive: boolean) => {
    const nextActive = !currentActive;
    setTemplates((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, isActive: nextActive } : t))
    );
    await toggleSmsTemplateAction(templateId, nextActive);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this DLT template?")) return;
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    await deleteSmsTemplateAction(templateId);
  };

  const openTestTemplateModal = (tmpl: SmsTemplateRecord) => {
    setTestTmplModal(tmpl);
    setTestTmplPhone(testPhone || "");
    const initialVars: Record<string, string> = {};
    const slots = extractDltVariables(tmpl.body);
    slots.forEach((slot, idx) => {
      initialVars[`var_${idx}`] = "";
    });
    setTestTmplVars(initialVars);
    setTestTmplResult(null);
  };

  const handleDispatchTemplateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTmplModal || !testTmplPhone.trim()) return;
    setTestTmplPending(true);
    setTestTmplResult(null);

    const values = Object.values(testTmplVars);
    const res = await testDltSmsDispatchAction(
      testTmplModal.name,
      testTmplPhone,
      values
    );

    if ("error" in res && res.error) {
      setTestTmplResult({ success: false, message: res.error });
    } else if ("provider" in res && res.success) {
      setTestTmplResult({
        success: true,
        message: `Dispatched via ${res.provider}! (ID: ${res.messageId})`,
      });
    } else {
      setTestTmplResult({ success: false, message: "Unknown dispatch error" });
    }
    setTestTmplPending(false);
  };

  // Live character credit calculation for editor modal
  const creditInfo = calculateSmsCredits(formBody);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Navigation Tabs */}
      <div className="flex border-b border-ink-200 dark:border-ink-800">
        <button
          type="button"
          onClick={() => setActiveTab("gateway")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "gateway"
              ? "border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400"
              : "border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
          }`}
        >
          <Smartphone className="h-4 w-4" />
          SMS Gateway Provider
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "templates"
              ? "border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400"
              : "border-transparent text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          DLT Templates (TRAI Compliance)
          <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
            {templates.length}
          </span>
        </button>
      </div>

      {/* TAB 1: SMS Gateway Provider */}
      {activeTab === "gateway" && (
        <div className="space-y-6">
          <form onSubmit={handleGatewaySubmit} className="card space-y-6">
            <div className="card-body p-6 space-y-6">
              {gatewayError && (
                <div className="alert-error text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {gatewayError}
                </div>
              )}

              {gatewaySuccess && (
                <div className="alert-success text-xs flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0" />
                  SMS gateway settings saved successfully.
                </div>
              )}

              <FormSection
                title="SMS Gateway Provider"
                description="Select and configure your telecom SMS gateway for India (MSG91, TextLocal, Twilio)."
              >
                <Field label="Gateway Provider" htmlFor="provider" required>
                  <select
                    id="provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="input"
                  >
                    <option value="msg91">MSG91 (Recommended for India DLT)</option>
                    <option value="textlocal">TextLocal India</option>
                    <option value="twilio">Twilio Global</option>
                  </select>
                </Field>

                <Field
                  label="Default Approved DLT Sender ID"
                  htmlFor="senderId"
                  required
                  hint="6-alpha approved sender ID (e.g. MEDFLW)"
                >
                  <input
                    id="senderId"
                    name="senderId"
                    defaultValue={initialConfig?.senderId || "MEDFLW"}
                    placeholder="MEDFLW"
                    maxLength={6}
                    className="input font-mono uppercase"
                  />
                </Field>

                <Field
                  label="API Key / Auth Token"
                  htmlFor="apiKey"
                  required
                  className="sm:col-span-2"
                >
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
                    <input
                      id="apiKey"
                      type="password"
                      name="apiKey"
                      defaultValue={initialConfig?.apiKey || ""}
                      placeholder="Enter SMS gateway auth token"
                      className="input pl-9 font-mono text-xs"
                    />
                  </div>
                </Field>

                <div className="sm:col-span-2 pt-2">
                  <label className="flex items-center gap-3 p-3.5 rounded-lg border border-ink-150 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-900/50 cursor-pointer hover:border-ink-300">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="checkbox"
                    />
                    <div>
                      <span className="text-sm font-medium text-ink-900 dark:text-ink-100 block">
                        Enable Live SMS Gateway
                      </span>
                      <span className="text-xs text-ink-500 dark:text-ink-400 block">
                        Dispatches live SMS to patient phones. If disabled, SMS notifications log to console in simulator mode.
                      </span>
                    </div>
                  </label>
                </div>
              </FormSection>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-ink-150 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-900/60 px-6 py-3.5">
              <button
                type="submit"
                disabled={gatewayPending}
                className="btn btn-primary"
              >
                <Check className="h-4 w-4" />{" "}
                {gatewayPending ? "Saving…" : "Save SMS Settings"}
              </button>
            </div>
          </form>

          {/* Test SMS Card */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 mb-1 flex items-center gap-2">
              <Send className="h-4 w-4 text-primary-500" /> Test Raw SMS Gateway Dispatch
            </h3>
            <p className="text-xs text-ink-500 dark:text-ink-400 mb-4">
              Send a test SMS to verify gateway connectivity and API credentials.
            </p>

            <form onSubmit={handleTestSms} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Test Recipient Phone" htmlFor="testPhone" required hint="10-digit Indian mobile number">
                  <input
                    id="testPhone"
                    type="tel"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="9876543210"
                    className="input font-mono"
                  />
                </Field>

                <Field label="Test Message Content" htmlFor="testMsg" required>
                  <input
                    id="testMsg"
                    value={testMsg}
                    onChange={(e) => setTestMsg(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded text-xs flex items-center gap-2 ${
                    testResult.startsWith("Failed")
                      ? "alert-error"
                      : "alert-success"
                  }`}
                >
                  {testResult.startsWith("Failed") ? (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  ) : (
                    <Check className="h-4 w-4 shrink-0" />
                  )}
                  {testResult}
                </div>
              )}

              <button
                type="submit"
                disabled={testPending || !testPhone}
                className="btn btn-secondary text-xs"
              >
                <Send className="h-3.5 w-3.5" />
                {testPending ? "Dispatching…" : "Dispatch Gateway Test SMS"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: DLT Templates Management */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          {/* Statutory DLT Notice */}
          <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-950/30 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-semibold text-sky-900 dark:text-sky-200 block">
                TRAI TCCCPR 2018 Statutory DLT Compliance Active
              </span>
              <p className="text-sky-700 dark:text-sky-300 leading-relaxed">
                Under Indian telecom regulations, every commercial SMS must be dispatched with an approved 6-letter Header (Sender ID) and registered DLT Content Template ID with variable slots <code className="px-1 py-0.5 bg-sky-100 dark:bg-sky-900 rounded font-mono text-[11px]">&#123;#var#&#125;</code>.
                Any outbound SMS lacking an active DLT template is <strong>automatically blocked</strong> by MediFlow before provider transmission to prevent blacklisting.
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink-900 dark:text-ink-100">
                Registered Content Templates
              </h2>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Pre-configured transactional templates for invoices, refill alerts, and ledger reminders.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewTemplateModal}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Add DLT Template
            </button>
          </div>

          {/* Templates Grid / Cards */}
          <div className="grid grid-cols-1 gap-4">
            {templates.map((tmpl) => {
              const isApproved = Boolean(tmpl.dltTemplateId && tmpl.dltTemplateId.trim().length > 0);
              const vars = tmpl.variables || extractDltVariables(tmpl.body);

              return (
                <div
                  key={tmpl.id}
                  className={`card p-5 border transition-all ${
                    !tmpl.isActive
                      ? "opacity-60 bg-ink-50/50 dark:bg-ink-900/30 border-ink-200"
                      : isApproved
                      ? "border-ink-200 dark:border-ink-800 hover:border-primary-400"
                      : "border-amber-300 dark:border-amber-800/80 bg-amber-50/20"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ink-150 dark:border-ink-800">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-ink-900 dark:text-ink-100">
                          {tmpl.name}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300">
                          Sender: {tmpl.senderId}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300">
                          {tmpl.category}
                        </span>

                        {isApproved ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="h-3 w-3" />
                            DLT ID: {tmpl.dltTemplateId}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <AlertCircle className="h-3 w-3" />
                            Missing DLT Template ID (Blocked)
                          </span>
                        )}
                      </div>
                      {tmpl.description && (
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                          {tmpl.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openTestTemplateModal(tmpl)}
                        className="btn btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1"
                        title="Dry run / test dispatch"
                      >
                        <Radio className="h-3.5 w-3.5 text-primary-500" />
                        Test
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditTemplateModal(tmpl)}
                        className="btn btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleTemplate(tmpl.id, tmpl.isActive)}
                        className={`text-xs px-2.5 py-1.5 rounded font-medium border ${
                          tmpl.isActive
                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 border-emerald-200"
                            : "bg-ink-100 dark:bg-ink-800 text-ink-600 border-ink-200"
                        }`}
                      >
                        {tmpl.isActive ? "Active" : "Disabled"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(tmpl.id)}
                        className="btn btn-secondary text-xs px-2 py-1.5 text-red-600 hover:text-red-700"
                        title="Delete template"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Template Body */}
                  <div className="mt-3 text-xs bg-ink-50 dark:bg-ink-950/50 p-3 rounded-lg font-mono text-ink-800 dark:text-ink-200 leading-relaxed border border-ink-150 dark:border-ink-800">
                    {tmpl.body}
                  </div>

                  {/* Variables Footer */}
                  <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-ink-500 dark:text-ink-400">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-ink-600 dark:text-ink-300">
                        Variables ({vars.length}):
                      </span>
                      {vars.map((v, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-300 font-mono text-[10px]"
                        >
                          {v}
                        </span>
                      ))}
                    </div>

                    <div className="shrink-0 text-ink-400">
                      {tmpl.body.length} chars
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL 1: Edit / Create Template */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-ink-900 rounded-xl shadow-xl max-w-2xl w-full border border-ink-200 dark:border-ink-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-150 dark:border-ink-800">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary-500" />
                {editingTemplate ? `Edit DLT Template: ${editingTemplate.name}` : "Register New DLT Template"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-ink-400 hover:text-ink-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4">
              {modalError && (
                <div className="alert-error text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Template Identifier Name" htmlFor="formName" required hint="e.g. invoice_receipt">
                  <input
                    id="formName"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="invoice_receipt"
                    className="input font-mono text-xs"
                    required
                  />
                </Field>

                <Field label="Category" htmlFor="formCategory" required>
                  <select
                    id="formCategory"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="service_implicit">Service Implicit (Transactional / OTP / Receipt)</option>
                    <option value="service_explicit">Service Explicit (Reminders / Updates)</option>
                    <option value="promotional">Promotional (Offers / Marketing)</option>
                  </select>
                </Field>

                <Field
                  label="Sender ID / Header"
                  htmlFor="formSenderId"
                  required
                  hint="Strictly 6 alphabetic characters (e.g. MEDFLW)"
                >
                  <input
                    id="formSenderId"
                    value={formSenderId}
                    onChange={(e) => setFormSenderId(e.target.value.toUpperCase())}
                    maxLength={6}
                    placeholder="MEDFLW"
                    className="input font-mono uppercase text-xs"
                    required
                  />
                </Field>

                <Field
                  label="DLT Content Template ID"
                  htmlFor="formDltId"
                  required
                  hint="Approved numerical ID from telecom DLT portal"
                >
                  <input
                    id="formDltId"
                    value={formDltId}
                    onChange={(e) => setFormDltId(e.target.value)}
                    placeholder="1107161234567890123"
                    className="input font-mono text-xs"
                    required
                  />
                </Field>

                <Field
                  label="Principal Entity ID (PE ID)"
                  htmlFor="formEntityId"
                  hint="Optional DLT business registration ID"
                  className="sm:col-span-2"
                >
                  <input
                    id="formEntityId"
                    value={formEntityId}
                    onChange={(e) => setFormEntityId(e.target.value)}
                    placeholder="1101123456789012345"
                    className="input font-mono text-xs"
                  />
                </Field>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-ink-700 dark:text-ink-300">
                    Template Message Body <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormBody((prev) => `${prev} {#var#}`)}
                    className="text-[11px] font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Insert Variable &#123;#var#&#125;
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  placeholder="Dear {#var#}, your tax invoice #{#var#} for Rs {#var#} is ready. View: {#var#}. MediFlow"
                  className="input font-mono text-xs w-full"
                  required
                />

                {/* Live Character & Credit Meter */}
                <div className="mt-2 p-2.5 rounded-lg bg-ink-50 dark:bg-ink-950/60 border border-ink-150 dark:border-ink-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink-700 dark:text-ink-300">
                      Characters: {creditInfo.charCount}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        creditInfo.isUnicode
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      }`}
                    >
                      {creditInfo.isUnicode ? "Unicode (UCS-2)" : "GSM 7-bit"}
                    </span>
                  </div>
                  <div className="text-ink-600 dark:text-ink-400 font-mono text-[11px]">
                    Est. Cost: <span className="font-bold text-ink-900 dark:text-ink-100">{creditInfo.credits}</span> SMS Credit{creditInfo.credits !== 1 ? "s" : ""} ({creditInfo.remainingInCurrentCredit} left in segment)
                  </div>
                </div>
              </div>

              <Field label="Internal Description / Purpose" htmlFor="formDescription">
                <input
                  id="formDescription"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. Sent automatically on final POS bill checkout"
                  className="input text-xs"
                />
              </Field>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-medium text-ink-700 dark:text-ink-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="checkbox"
                  />
                  Enable template for automated dispatch
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-ink-150 dark:border-ink-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalPending || !formName || !formBody || !formDltId}
                  className="btn btn-primary text-xs"
                >
                  <Check className="h-4 w-4" />
                  {modalPending ? "Saving…" : "Save DLT Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Test Template Dispatch */}
      {testTmplModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-ink-900 rounded-xl shadow-xl max-w-lg w-full border border-ink-200 dark:border-ink-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-150 dark:border-ink-800">
              <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 flex items-center gap-2">
                <Send className="h-4 w-4 text-primary-500" />
                Test DLT Dispatch: {testTmplModal.name}
              </h3>
              <button
                type="button"
                onClick={() => setTestTmplModal(null)}
                className="text-ink-400 hover:text-ink-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleDispatchTemplateTest} className="p-6 space-y-4">
              <div className="text-xs p-3 rounded-lg bg-ink-50 dark:bg-ink-950 font-mono text-ink-700 dark:text-ink-300 border border-ink-150 dark:border-ink-800">
                {testTmplModal.body}
              </div>

              <Field label="Recipient Mobile Number" htmlFor="testTmplPhone" required hint="10-digit phone number">
                <input
                  id="testTmplPhone"
                  type="tel"
                  value={testTmplPhone}
                  onChange={(e) => setTestTmplPhone(e.target.value)}
                  placeholder="9876543210"
                  className="input font-mono text-xs"
                  required
                />
              </Field>

              {/* Dynamic inputs for each variable */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-ink-800 dark:text-ink-200 block">
                  Variable Slot Values:
                </label>
                {extractDltVariables(testTmplModal.body).map((slot, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-500 w-24 shrink-0">
                      Slot #{idx + 1}:
                    </span>
                    <input
                      value={testTmplVars[`var_${idx}`] || ""}
                      onChange={(e) =>
                        setTestTmplVars((prev) => ({
                          ...prev,
                          [`var_${idx}`]: e.target.value,
                        }))
                      }
                      placeholder={`Value for ${slot}`}
                      className="input text-xs flex-1"
                    />
                  </div>
                ))}
              </div>

              {testTmplResult && (
                <div
                  className={`p-3 rounded text-xs flex items-center gap-2 ${
                    testTmplResult.success ? "alert-success" : "alert-error"
                  }`}
                >
                  {testTmplResult.success ? (
                    <Check className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  {testTmplResult.message}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-ink-150 dark:border-ink-800">
                <button
                  type="button"
                  onClick={() => setTestTmplModal(null)}
                  className="btn btn-secondary text-xs"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={testTmplPending || !testTmplPhone}
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {testTmplPending ? "Sending…" : "Dispatch Test SMS"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
