"use client";

import { useState } from "react";
import { MessageSquare, Send, CheckCheck, Clock, User, Phone, Search, RefreshCw, AlertCircle } from "lucide-react";
import { sendManualWhatsAppMessage } from "@/app/actions/whatsapp";
import clsx from "clsx";

interface MessageItem {
  id: string;
  direction: string;
  customerPhone: string;
  customerId: string | null;
  messageBody: string;
  messageType: string;
  status: string;
  createdAt: Date;
  customerName: string | null;
}

interface Conversation {
  phone: string;
  customerName: string | null;
  lastMessage: string;
  lastAt: Date;
  unreadCount: number;
}

export function WhatsAppInboxClient({
  initialConversations,
  initialMessages,
}: {
  initialConversations: Conversation[];
  initialMessages: MessageItem[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedPhone, setSelectedPhone] = useState<string>(
    initialConversations[0]?.phone || initialMessages[0]?.customerPhone || ""
  );
  const [search, setSearch] = useState("");
  const [newText, setNewText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredConversations = conversations.filter(
    (c) =>
      c.phone.toLowerCase().includes(search.toLowerCase()) ||
      (c.customerName && c.customerName.toLowerCase().includes(search.toLowerCase()))
  );

  const activeMessages = messages.filter((m) => {
    if (!selectedPhone) return false;
    const phoneA = m.customerPhone.slice(-10);
    const phoneB = selectedPhone.slice(-10);
    return phoneA === phoneB;
  });

  const activeConversation = conversations.find(
    (c) => c.phone.slice(-10) === selectedPhone.slice(-10)
  );

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhone || !newText.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    const res = await sendManualWhatsAppMessage(selectedPhone, newText);

    if ("error" in res && res.error) {
      setError(res.error);
    } else {
      const msgId = "messageId" in res && res.messageId ? res.messageId : `temp_${Date.now()}`;
      const newMsg: MessageItem = {
        id: msgId,
        direction: "outbound",
        customerPhone: selectedPhone,
        customerId: null,
        messageBody: newText.trim(),
        messageType: "text",
        status: "sent",
        createdAt: new Date(),
        customerName: activeConversation?.customerName || null,
      };

      setMessages((prev) => [newMsg, ...prev]);
      setNewText("");

      // Update conversations list
      setConversations((prev) => {
        const existing = prev.find((c) => c.phone.slice(-10) === selectedPhone.slice(-10));
        if (existing) {
          return [
            { ...existing, lastMessage: newMsg.messageBody, lastAt: newMsg.createdAt },
            ...prev.filter((c) => c.phone.slice(-10) !== selectedPhone.slice(-10)),
          ];
        }
        return [
          {
            phone: selectedPhone,
            customerName: null,
            lastMessage: newMsg.messageBody,
            lastAt: newMsg.createdAt,
            unreadCount: 0,
          },
          ...prev,
        ];
      });
    }

    setIsSending(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-14rem)] min-h-[500px]">
      {/* Left Column: Conversations */}
      <div className="lg:col-span-4 bg-surface rounded-xl border border-ink-150 flex flex-col overflow-hidden">
        <div className="p-3.5 border-b border-ink-150 bg-ink-50/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <input
              type="text"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 input-sm w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-ink-100">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-ink-400 text-sm">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No conversations yet
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = c.phone.slice(-10) === selectedPhone.slice(-10);
              return (
                <button
                  key={c.phone}
                  type="button"
                  onClick={() => {
                    setSelectedPhone(c.phone);
                    setError(null);
                  }}
                  className={clsx(
                    "w-full text-left p-3.5 flex items-start gap-3 transition-colors",
                    isSelected ? "bg-primary-50/60 border-l-4 border-primary-600" : "hover:bg-ink-50/70"
                  )}
                >
                  <div className="h-9 w-9 rounded-full bg-primary-100 text-primary-700 font-semibold flex items-center justify-center shrink-0 text-xs">
                    {c.customerName ? c.customerName[0].toUpperCase() : <Phone className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-[13px] text-ink-900 truncate">
                        {c.customerName || `+${c.phone}`}
                      </span>
                      <span className="text-[11px] text-ink-400">
                        {new Date(c.lastAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className="text-[12px] text-ink-500 truncate">{c.lastMessage}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Chat messages & composer */}
      <div className="lg:col-span-8 bg-surface rounded-xl border border-ink-150 flex flex-col overflow-hidden">
        {selectedPhone ? (
          <>
            {/* Header */}
            <div className="p-3.5 border-b border-ink-150 bg-ink-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  WA
                </div>
                <div>
                  <h3 className="font-semibold text-[13.5px] text-ink-900">
                    {activeConversation?.customerName || `+${selectedPhone}`}
                  </h3>
                  <span className="text-[11.5px] text-ink-500">WhatsApp Business Active</span>
                </div>
              </div>
            </div>

            {/* Message feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#e5ddd5]/15">
              {activeMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-ink-400 text-sm">
                  No messages yet. Send a message to start conversation.
                </div>
              ) : (
                [...activeMessages].reverse().map((msg) => {
                  const isOut = msg.direction === "outbound";
                  return (
                    <div
                      key={msg.id}
                      className={clsx("flex flex-col max-w-[78%]", isOut ? "ml-auto items-end" : "mr-auto items-start")}
                    >
                      <div
                        className={clsx(
                          "rounded-2xl px-3.5 py-2 text-[13px] shadow-xs leading-relaxed whitespace-pre-wrap break-words",
                          isOut ? "bg-primary-600 text-white rounded-br-xs" : "bg-white text-ink-900 border border-ink-150 rounded-bl-xs"
                        )}
                      >
                        {msg.messageBody}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-[10.5px] text-ink-400 px-1">
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {isOut && (
                          <span>
                            {msg.status === "delivered" || msg.status === "read" ? (
                              <CheckCheck className="h-3 w-3 text-emerald-500" />
                            ) : msg.status === "sent" ? (
                              <CheckCheck className="h-3 w-3 text-ink-400" />
                            ) : (
                              <Clock className="h-3 w-3 text-amber-500" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Error banner */}
            {error && (
              <div className="px-4 py-2 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* Composer */}
            <form onSubmit={handleSend} className="p-3 border-t border-ink-150 bg-white flex items-center gap-2">
              <input
                type="text"
                placeholder="Type a WhatsApp message…"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className="input flex-1"
                disabled={isSending}
              />
              <button
                type="submit"
                disabled={isSending || !newText.trim()}
                className="btn btn-primary px-4 py-2"
              >
                {isSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span>Send</span>
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-ink-400">
            <MessageSquare className="h-12 w-12 text-ink-300 mb-3" />
            <h4 className="font-medium text-ink-700">Select a Conversation</h4>
            <p className="text-xs text-ink-400 max-w-sm mt-1">
              Click on a customer chat on the left or send an automated invoice / refill alert from sales & prescriptions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
