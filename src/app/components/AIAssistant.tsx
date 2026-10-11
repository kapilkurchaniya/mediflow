"use client";

import { useEffect, useState, useRef } from "react";
import { Mic, Square, X, Send } from "lucide-react";
import clsx from "clsx";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";

const SUGGESTIONS = ["Show low-stock items", "Today's sales summary", "Check interaction: Ibuprofen and Aspirin"];

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [input, setInput] = useState("");
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  
  const { messages, sendMessage, status } = useChat({
    // Vercel AI SDK v4+ API options
  });

  const isLoading = status === 'submitted' || status === 'streaming';
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll and event dispatch
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    
    // Check for tool results
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.parts) {
      const toolResult = lastMessage.parts.find(p => p.type === 'tool-invocation' && (p as any).toolInvocation?.state === 'result');
      if (toolResult) {
         const result = (toolResult as any).toolInvocation.result;
         if (result?.action === 'DISPATCH_ADD_TO_BILL') {
             window.dispatchEvent(new CustomEvent('ai-add-to-bill', { detail: result.payload }));
         }
      }
    }
  }, [messages]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsOpen((o) => !o);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);

    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      
      rec.onresult = (event: SpeechRecognitionEvent) => {
        const text = event.results[0][0].transcript;
        setIsListening(false);
        sendMessage({ role: 'user', parts: [{ type: 'text', text }] });
      };
      
      rec.onerror = () => {
        setIsListening(false);
      };
      
      rec.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = rec;
    }

    return () => window.removeEventListener("keydown", onKey);
  }, [sendMessage]);

  const toggleListen = () => {
    if (!isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value);
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ role: 'user', parts: [{ type: 'text', text: input }] });
    setInput("");
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-label="Open assistant"
        className={clsx(
          "fixed bottom-5 right-5 z-40 flex h-10 items-center gap-2 rounded-full bg-ink-900 pl-3 pr-3.5 text-[13px] font-medium text-white",
          "shadow-[0_8px_24px_-6px_rgb(0_0_0_/_0.35)] ring-1 ring-white/10 transition-all duration-200 hover:bg-ink-800",
          isOpen && "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
        </span>
        Ask MediFlow
        <span className="ml-1 rounded border border-white/15 px-1 font-mono text-[10px] text-white/60">Ctrl J</span>
      </button>

      {/* Panel */}
      <div
        role="dialog"
        aria-label="MediFlow assistant"
        className={clsx(
          "fixed bottom-5 right-5 z-50 flex flex-col w-[380px] h-[550px] origin-bottom-right overflow-hidden rounded-xl border border-ink-150 bg-white",
          "shadow-[var(--shadow-pop)] transition-all duration-200 ease-out",
          isOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-ink-150 px-4 h-12 shrink-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="text-[13px] font-semibold text-ink-900">Assistant</span>
            <span className="badge badge-neutral !h-5 !text-[10.5px]">Beta</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="btn btn-ghost btn-icon" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chat History */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 pt-6 pb-5 flex flex-col gap-4 text-[13px]">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center text-center mt-4">
              <div
                onClick={toggleListen}
                role="button"
                className={clsx(
                  "relative grid h-14 w-14 shrink-0 place-items-center rounded-full transition-colors cursor-pointer mb-4",
                  isListening ? "bg-red-600 text-white" : "bg-ink-900 text-white hover:bg-ink-800",
                )}
              >
                {isListening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />}
                {isListening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-6 w-6" />}
              </div>
              <p className="font-medium text-ink-900 mb-1">
                {isListening ? "Listening..." : "How can I help you today?"}
              </p>
              <p className="text-[12.5px] text-ink-500 mb-6">
                Tap the mic or type your request below.
              </p>

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage({ role: 'user', parts: [{ type: 'text', text: s }] })}
                    className="rounded-md border border-ink-150 bg-ink-50/60 px-3 py-1.5 text-[12px] text-ink-600 transition-colors hover:border-ink-300 hover:bg-white hover:text-ink-900"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m: UIMessage) => (
              <div key={m.id} className={clsx("flex flex-col gap-1 max-w-[90%]", m.role === 'user' ? "self-end items-end" : "self-start")}>
                <div className={clsx(
                  "rounded-2xl px-3.5 py-2", 
                  m.role === 'user' ? "bg-brand-500 text-white rounded-br-sm" : "bg-ink-50 border border-ink-100 text-ink-900 rounded-bl-sm prose prose-sm prose-p:my-1 prose-ul:my-1"
                )}>
                  {m.role === 'user' ? (
                    m.parts.filter(p => p.type === 'text').map(p => p.type === 'text' ? p.text : '').join('')
                  ) : (
                    m.parts.some(p => p.type === 'text' && p.text.trim().length > 0) ? (
                      <ReactMarkdown>{m.parts.filter(p => p.type === 'text').map(p => (p as any).text).join('')}</ReactMarkdown>
                    ) : m.parts.some(p => p.type === 'tool-invocation' && (p as any).toolInvocation?.state === 'result') ? (
                      <span className="text-brand-600 font-medium">
                        {(m.parts.find(p => p.type === 'tool-invocation' && (p as any).toolInvocation?.state === 'result') as any).toolInvocation.result?.message || "Action completed."}
                      </span>
                    ) : <span className="text-ink-500 italic">Executing tools...</span>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
             <div className="self-start bg-ink-50 border border-ink-100 text-ink-900 rounded-2xl rounded-bl-sm px-3.5 py-2">
                <div className="flex gap-1 items-center h-5">
                  <div className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
             </div>
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-ink-150 bg-ink-50/60 px-3 py-2.5 shrink-0">
          <input
            className="input input-sm flex-1 !shadow-none bg-white border-ink-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 outline-none rounded-md px-3 py-1.5 text-[13px]"
            placeholder="Type a command…"
            value={input}
            onChange={handleInputChange}
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()} 
            className="flex items-center justify-center w-8 h-8 rounded-md bg-brand-500 text-white disabled:opacity-50 transition-opacity"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </>
  );
}
