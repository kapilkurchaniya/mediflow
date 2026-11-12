"use client";

import { useEffect, useState, useRef } from "react";
import { Mic, Square, X, Send } from "lucide-react";
import clsx from "clsx";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AIToolCard, type ToolInvocationRecord } from "./ai/AIToolCard";

const SUGGESTIONS = [
  "Show low-stock items",
  "Today's sales summary",
  "Check interaction: Ibuprofen and Aspirin",
  "Draft PO for low stock items",
  "Explain GSTR-2B mismatches",
];

function formatMarkdownTables(text: string): string {
  if (!text) return "";
  let formatted = text.replace(/\|\s*\|\s*/g, "|\n|");
  formatted = formatted.replace(/([^\n])\n?(\| [^\n]+\|)/g, "$1\n\n$2");
  return formatted;
}

interface ToolInvocationPart {
  type: "tool-invocation";
  toolInvocation: {
    toolName: string;
    state: string;
    result?: unknown;
  };
}

const markdownComponents = {
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-2.5 max-w-full overflow-x-auto rounded-lg border border-ink-200 bg-white shadow-xs">
      <table className="w-full text-left text-[12px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-ink-50/90 border-b border-ink-150 text-[11px] font-semibold text-ink-600 uppercase tracking-wider">
      {children}
    </thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-3 py-2 text-ink-700 font-semibold">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-3 py-2 border-b border-ink-100 last:border-b-0 text-ink-800">{children}</td>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="hover:bg-brand-50/20 transition-colors">{children}</tr>
  ),
  p: ({ children }: { children?: React.ReactNode }) => <p className="my-1.5 leading-relaxed text-[12.5px]">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-ink-900">{children}</strong>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="my-1.5 list-disc pl-4 space-y-1 text-[12px]">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="my-1.5 list-decimal pl-4 space-y-1 text-[12px]">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="text-[12px] text-ink-800">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-ink-100/80 px-1 py-0.5 text-[11px] font-mono text-ink-800">{children}</code>
  ),
};

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const { messages, sendMessage, status } = useChat({});
  const isLoading = status === "submitted" || status === "streaming";

  // Global shortcut (Ctrl + J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-scroll and event dispatch for POS
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant" && lastMessage.parts) {
      for (const p of lastMessage.parts) {
        if (p.type === "tool-invocation") {
          const inv = p as unknown as ToolInvocationPart;
          if (inv.toolInvocation?.state === "result") {
            const res = inv.toolInvocation.result as { action?: string; payload?: unknown } | undefined;
            if (res?.action === "DISPATCH_ADD_TO_BILL") {
              window.dispatchEvent(new CustomEvent("ai-add-to-bill", { detail: res.payload }));
            }
          }
        }
      }
    }
  }, [messages, isLoading]);

  const handleSend = (text: string) => {
    if (!text.trim() || isLoading) return;
    sendMessage({ role: "user", parts: [{ type: "text", text: text.trim() }] });
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        handleSend(transcript);
      }
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-label="Open assistant"
        className={clsx(
          "fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 flex h-10 items-center gap-2 rounded-full bg-ink-900 pl-3 pr-3.5 text-[13px] font-medium text-white print:hidden",
          "shadow-[0_8px_24px_-6px_rgb(0_0_0_/_0.35)] ring-1 ring-white/10 transition-all duration-200 hover:bg-ink-800",
          isOpen && "pointer-events-none translate-y-2 opacity-0"
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
        </span>
        Ask MediFlow
        <span className="ml-1 rounded border border-white/15 px-1 font-mono text-[10px] text-white/60">Ctrl J</span>
      </button>

      {/* Floating Dialog Drawer */}
      <div
        role={isOpen ? "dialog" : undefined}
        aria-label="MediFlow assistant"
        className={clsx(
          "fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-50 flex flex-col w-[calc(100vw-2rem)] sm:w-[440px] max-w-[440px] h-[min(580px,calc(100vh-5.5rem))] sm:h-[620px] origin-bottom-right overflow-hidden rounded-2xl border border-ink-150 bg-white print:hidden",
          "shadow-[var(--shadow-pop)] transition-all duration-200 ease-out",
          isOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-150 px-4 h-12 shrink-0 bg-white/80 backdrop-blur-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="text-[13px] font-semibold text-ink-900">MediFlow Copilot</span>
            <span className="badge badge-neutral !h-5 !text-[10.5px]">Live Store</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="btn btn-ghost btn-icon" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Message Feed */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3.5 text-[13px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center text-center mt-6">
              <div
                onClick={toggleListen}
                role="button"
                className={clsx(
                  "relative grid h-14 w-14 shrink-0 place-items-center rounded-full transition-colors cursor-pointer mb-4",
                  isListening ? "bg-red-600 text-white" : "bg-ink-900 text-white hover:bg-ink-800"
                )}
              >
                {isListening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />}
                {isListening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-6 w-6" />}
              </div>
              <p className="font-semibold text-ink-900 mb-1 text-[14px]">
                {isListening ? "Listening..." : "How can I help you today?"}
              </p>
              <p className="text-[12px] text-ink-500 mb-6">
                Ask about sales, stock, purchase orders, or select a suggestion below.
              </p>

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-lg border border-ink-150 bg-ink-50/70 px-3 py-1.5 text-[12px] text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700 font-medium"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m: UIMessage) => {
              const isUser = m.role === "user";
              const textParts: string[] = [];
              const toolInvocations: ToolInvocationRecord[] = [];

              for (const p of m.parts) {
                if (p.type === "text" && "text" in p && typeof (p as { text: unknown }).text === "string") {
                  textParts.push((p as { text: string }).text);
                } else if (p.type === "tool-invocation") {
                  const inv = p as unknown as ToolInvocationPart;
                  if (inv.toolInvocation?.state === "result") {
                    toolInvocations.push(inv.toolInvocation as ToolInvocationRecord);
                  }
                }
              }

              const textContent = textParts.join("");

              return (
                <div key={m.id} className={clsx("flex flex-col gap-1 w-full", isUser ? "items-end" : "items-start")}>
                  <div
                    className={clsx(
                      "rounded-2xl px-3.5 py-2.5",
                      isUser
                        ? "bg-brand-500 text-white rounded-br-sm max-w-[85%]"
                        : "bg-ink-50 border border-ink-120 text-ink-900 rounded-bl-sm w-full max-w-full shadow-2xs"
                    )}
                  >
                    {isUser ? (
                      <p className="text-[13px] leading-relaxed">{textContent}</p>
                    ) : (
                      <div className="space-y-2">
                        {toolInvocations.map((ti, tiIdx) => (
                          <AIToolCard key={tiIdx} toolInvocation={ti} />
                        ))}
                        {textContent.trim().length > 0 ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {formatMarkdownTables(textContent)}
                          </ReactMarkdown>
                        ) : toolInvocations.length === 0 ? (
                          <span className="text-ink-400 italic text-[12px]">Fetching data...</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isLoading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
            <div className="self-start bg-ink-50 border border-ink-120 text-ink-900 rounded-2xl rounded-bl-sm px-3.5 py-2.5 shadow-2xs">
              <div className="flex gap-1.5 items-center h-5">
                <span className="text-[12px] text-ink-500 mr-1 font-medium">MediFlow is thinking</span>
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-ink-150 bg-ink-50/60 px-3 py-2.5 shrink-0">
          <input
            className="input input-sm flex-1 !shadow-none bg-white border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none rounded-lg px-3 py-1.5 text-[13px]"
            placeholder="Type a command or ask a question…"
            autoComplete="off"
            suppressHydrationWarning
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand-500 text-white disabled:opacity-50 transition-opacity hover:bg-brand-600"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}

export default AIAssistant;
