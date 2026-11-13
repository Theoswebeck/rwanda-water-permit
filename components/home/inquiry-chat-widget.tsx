"use client";

import { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  X,
  Send,
  Loader2,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface ChatMessage {
  id: string;
  sender_type: "citizen" | "staff" | "system";
  sender_name: string;
  sender_role: string | null;
  message: string;
  created_at: string;
}

interface ChatInquiry {
  id: string;
  inquiry_number: string;
  sender_name: string;
  sender_email: string;
  subject: string;
  status: string;
  assigned_role: string | null;
  assigned_to_name?: string | null;
}

const STORAGE_KEY = "rwb_last_inquiry";

function statusLabel(status: string) {
  switch (status) {
    case "open":
      return { text: "Open", cls: "bg-blue-100 text-blue-800" };
    case "assigned":
      return { text: "Assigned", cls: "bg-indigo-100 text-indigo-800" };
    case "in_progress":
      return { text: "In Progress", cls: "bg-amber-100 text-amber-800" };
    case "answered":
      return { text: "Answered", cls: "bg-emerald-100 text-emerald-800" };
    case "closed":
      return { text: "Closed", cls: "bg-slate-200 text-slate-700" };
    default:
      return { text: status, cls: "bg-slate-100 text-slate-700" };
  }
}

export function InquiryChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "track" | "thread">("new");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New inquiry form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState("permit_application");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Track form
  const [trackNumber, setTrackNumber] = useState("");
  const [trackEmail, setTrackEmail] = useState("");

  // Active thread
  const [activeInquiry, setActiveInquiry] = useState<ChatInquiry | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved ticket if any
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.inquiryNumber && parsed?.email) {
          setTrackNumber(parsed.inquiryNumber);
          setTrackEmail(parsed.email);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Listen for custom open event from ContactSection
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ inquiryNumber?: string; email?: string }>).detail;
      setIsOpen(true);
      if (detail?.inquiryNumber && detail?.email) {
        setTrackNumber(detail.inquiryNumber);
        setTrackEmail(detail.email);
        loadThread(detail.inquiryNumber, detail.email);
      }
    };
    window.addEventListener("rwb:open-inquiry-chat", handler);
    return () => window.removeEventListener("rwb:open-inquiry-chat", handler);
  }, []);

  useEffect(() => {
    if (mode === "thread") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, mode]);

  const loadThread = async (inqNum: string, inqEmail: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/inquiries/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiryNumber: inqNum.trim(), email: inqEmail.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || json?.error || "Inquiry not found.");
      }
      setActiveInquiry(json.inquiry);
      setMessages(json.messages || []);
      setMode("thread");
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ inquiryNumber: json.inquiry.inquiry_number, email: json.inquiry.sender_email })
        );
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          category,
          priority: "normal",
          subject,
          message,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || json?.error || "Failed to submit inquiry.");
      }
      setTrackNumber(json.inquiryNumber);
      setTrackEmail(email);
      setName("");
      setEmail("");
      setPhone("");
      setSubject("");
      setMessage("");
      await loadThread(json.inquiryNumber, email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit inquiry.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInquiry || !replyText.trim()) return;
    setSendingReply(true);
    setError(null);
    try {
      const res = await fetch("/api/public/inquiries/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryNumber: activeInquiry.inquiry_number,
          email: activeInquiry.sender_email,
          message: replyText.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.message || json?.error || "Failed to send message.");
      }
      setActiveInquiry(json.inquiry);
      setMessages(json.messages || []);
      setReplyText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <>
      {/* Floating Chat Trigger */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full bg-[#0072bc] hover:bg-[#005a96] text-white px-5 py-3.5 shadow-2xl transition-all hover:scale-105 cursor-pointer"
          aria-label="Open RWB Inquiry Chat"
        >
          <MessageSquare className="h-5 w-5" />
          <span className="text-sm font-bold">Ask RWB</span>
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[400px] h-[560px] max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#003d6b] to-[#0072bc] text-white px-4 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              {mode === "thread" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("track");
                    setError(null);
                  }}
                  className="p-1 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <MessageSquare className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold truncate">RWB Help &amp; Inquiries</h3>
                <p className="text-[11px] text-blue-100 truncate">
                  {mode === "thread" && activeInquiry
                    ? activeInquiry.inquiry_number
                    : "Direct support from RWB officers"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/15 transition-colors cursor-pointer"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode Tabs (New vs Track) */}
          {mode !== "thread" && (
            <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode("new");
                  setError(null);
                }}
                className={`py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                  mode === "new"
                    ? "bg-white text-[#0072bc] border-b-2 border-[#0072bc]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                New Inquiry
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("track");
                  setError(null);
                }}
                className={`py-2.5 text-xs font-bold transition-colors cursor-pointer ${
                  mode === "track"
                    ? "bg-white text-[#0072bc] border-b-2 border-[#0072bc]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Track / Continue Chat
              </button>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2 shrink-0">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          {/* Body: New Inquiry */}
          {mode === "new" && (
            <form onSubmit={handleCreateInquiry} className="flex-1 overflow-y-auto p-4 space-y-3">
              <Input
                required
                placeholder="Full Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xs h-9"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  required
                  type="email"
                  placeholder="Email *"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="text-xs h-9"
                />
                <Input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
              >
                <option value="permit_application">Permit Application</option>
                <option value="permit_renewal">Permit Renewal</option>
                <option value="technical_support">Technical Support</option>
                <option value="billing_payment">Billing &amp; Payment</option>
                <option value="inspection">Inspection Services</option>
                <option value="compliance">Compliance Issues</option>
                <option value="general_inquiry">General Inquiry</option>
              </select>
              <Input
                required
                placeholder="Subject *"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-xs h-9"
              />
              <Textarea
                required
                rows={4}
                placeholder="Write your message or question for RWB... *"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="text-xs resize-none"
              />
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0072bc] hover:bg-[#005a96] text-white text-xs font-bold h-9"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Starting Chat...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-2" />
                    Send &amp; Get Tracking ID
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Body: Track Inquiry */}
          {mode === "track" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                loadThread(trackNumber, trackEmail);
              }}
              className="flex-1 overflow-y-auto p-4 space-y-3"
            >
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter your inquiry tracking number (e.g. <span className="font-mono font-semibold">INQ-2026-00001</span>) and the email you used to view replies or continue chatting with an RWB officer.
              </p>
              <Input
                required
                placeholder="Tracking Number (e.g. INQ-2026-00001)"
                value={trackNumber}
                onChange={(e) => setTrackNumber(e.target.value)}
                className="text-xs h-9 font-mono"
              />
              <Input
                required
                type="email"
                placeholder="Your Email Address"
                value={trackEmail}
                onChange={(e) => setTrackEmail(e.target.value)}
                className="text-xs h-9"
              />
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0072bc] hover:bg-[#005a96] text-white text-xs font-bold h-9"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Loading Conversation...
                  </>
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5 mr-2" />
                    Open Conversation
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Body: Live Chat Thread */}
          {mode === "thread" && activeInquiry && (
            <>
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{activeInquiry.subject}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusLabel(activeInquiry.status).cls}`}>
                      {statusLabel(activeInquiry.status).text}
                    </span>
                    {activeInquiry.assigned_role && (
                      <span className="text-[10px] text-slate-500 truncate">
                        Handled by {activeInquiry.assigned_role}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadThread(activeInquiry.inquiry_number, activeInquiry.sender_email)}
                  className="p-1.5 rounded-md text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer"
                  title="Refresh messages"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/50">
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Save your tracking ID <strong className="font-mono">{activeInquiry.inquiry_number}</strong> to check replies anytime.
                  </span>
                </div>

                {messages.map((m) => {
                  const isCitizen = m.sender_type === "citizen";
                  return (
                    <div key={m.id} className={`flex flex-col ${isCitizen ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs ${
                          isCitizen
                            ? "bg-[#0072bc] text-white rounded-br-xs"
                            : "bg-white text-slate-800 border border-slate-200 rounded-bl-xs"
                        }`}
                      >
                        <div className={`text-[10px] font-bold mb-1 ${isCitizen ? "text-blue-100" : "text-[#0072bc]"}`}>
                          {isCitizen ? m.sender_name : `${m.sender_name}${m.sender_role ? ` (${m.sender_role.toUpperCase()})` : ""}`}
                        </div>
                        <p className="whitespace-pre-wrap break-words">{m.message}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-1">
                        {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {activeInquiry.status !== "closed" ? (
                <form onSubmit={handleSendReply} className="p-2.5 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0">
                  <Input
                    placeholder="Type a follow-up message..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="text-xs h-9"
                    disabled={sendingReply}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    disabled={sendingReply || !replyText.trim()}
                    className="h-9 w-9 bg-[#0072bc] hover:bg-[#005a96] text-white shrink-0"
                  >
                    {sendingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </form>
              ) : (
                <div className="p-2.5 border-t border-slate-200 bg-slate-50 text-center text-[11px] text-slate-500 shrink-0">
                  This inquiry is closed. Open a new inquiry if you need further assistance.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

