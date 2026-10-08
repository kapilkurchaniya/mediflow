"use client";

import { useEffect, useState, useRef } from "react";
import { Mic, Square, X, CornerDownLeft } from "lucide-react";
import clsx from "clsx";

const SUGGESTIONS = ["Show low-stock items", "Today's sales summary", "Bill Dolo 650 × 2", "Expiring this month"];

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

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
        setTranscript(text);
        setIsListening(false);
        // Here we could trigger a server action with the transcript
      };
      
      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        setTranscript("Error: " + event.error);
        setIsListening(false);
      };
      
      rec.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = rec;
    }

    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleListen = () => {
    if (!isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          setTranscript("Listening…");
        } catch (e) {
          console.error(e);
          setTranscript("Failed to start mic");
        }
      } else {
        setTranscript("Voice not supported in this browser.");
      }
    } else {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
    }
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
          "fixed bottom-5 right-5 z-50 w-[360px] origin-bottom-right overflow-hidden rounded-xl border border-ink-150 bg-white",
          "shadow-[var(--shadow-pop)] transition-all duration-200 ease-out",
          isOpen ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <div className="flex items-center justify-between border-b border-ink-150 px-4 h-12">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            <span className="text-[13px] font-semibold text-ink-900">Assistant</span>
            <span className="badge badge-neutral !h-5 !text-[10.5px]">Beta</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="btn btn-ghost btn-icon" aria-label="Close">
            <X />
          </button>
        </div>

        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleListen}
              aria-pressed={isListening}
              className={clsx(
                "relative grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors",
                isListening ? "bg-red-600 text-white" : "bg-ink-900 text-white hover:bg-ink-800",
              )}
            >
              {isListening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />}
              {isListening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
            </button>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-ink-900">
                {isListening ? "Listening" : transcript ? "Done" : "Voice commands"}
              </p>
              <p className="text-[12.5px] text-ink-500 leading-snug">
                {transcript ?? "Tap the mic and speak, e.g. “Bill Dolo 650, two strips”."}
              </p>
            </div>
          </div>

          {isListening && (
            <div className="mt-5 flex h-6 items-end justify-center gap-[3px]" aria-hidden="true">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-ink-300 animate-pulse"
                  style={{ height: `${20 + ((i * 37) % 80)}%`, animationDelay: `${(i % 7) * 90}ms` }}
                />
              ))}
            </div>
          )}

          <p className="eyebrow mt-6 mb-2">Try asking</p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setTranscript(`“${s}” — coming soon.`)}
                className="rounded-md border border-ink-150 bg-ink-50/60 px-2 py-1 text-[12px] text-ink-600 transition-colors hover:border-ink-300 hover:bg-white hover:text-ink-900"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-ink-150 bg-ink-50/60 px-3 py-2.5">
          <input
            className="input input-sm flex-1 !shadow-none"
            placeholder="Type a command…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                setTranscript(`“${e.currentTarget.value.trim()}” — coming soon.`);
                e.currentTarget.value = "";
              }
            }}
          />
          <span className="kbd">
            <CornerDownLeft className="h-3 w-3" />
          </span>
        </div>
      </div>
    </>
  );
}
