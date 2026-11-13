"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Send,
  Loader2,
  MessageSquare,
  UserPlus,
  Lock,
  Globe,
  RefreshCw,
  Mail,
  Phone,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InquiryMessageRecord, InquiryRecord, InquiryStatus } from "@/lib/inquiries/schema";

interface StaffOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-blue-100 text-blue-800 border-blue-200" },
  assigned: { label: "Assigned", className: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  in_progress: { label: "In Progress", className: "bg-amber-100 text-amber-800 border-amber-200" },
  answered: { label: "Answered", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  closed: { label: "Closed", className: "bg-slate-200 text-slate-700 border-slate-300" },
};

export function StaffInquiriesWorkbench() {
  const [inquiries, setInquiries] = useState<InquiryRecord[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [viewerRole, setViewerRole] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<"default" | "mine" | "all">("default");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeInquiry, setActiveInquiry] = useState<InquiryRecord | null>(null);
  const [messages, setMessages] = useState<InquiryMessageRecord[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  // Reply composer
  const [replyText, setReplyText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);

  // Assignment controls (Reviewer / Admin)
  const [assignTargetId, setAssignTargetId] = useState<string>("");
  const [handoffNote, setHandoffNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const fetchInquiries = useCallback(async (silent = false) => {
    if (!silent) setLoadingList(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (scopeFilter !== "default") params.set("scope", scopeFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/staff/inquiries?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setInquiries(json.inquiries || []);
        setStaffOptions(json.staffOptions || []);
        setCanAssign(Boolean(json.canAssign));
        setViewerRole(json.viewerRole || "");
      }
    } finally {
      if (!silent) setLoadingList(false);
    }
  }, [statusFilter, scopeFilter, searchQuery]);

  const fetchThread = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const res = await fetch(`/api/staff/inquiries/${id}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setActiveInquiry(json.inquiry);
        const incoming: InquiryMessageRecord[] = json.messages || [];
        setMessages((prev) => {
          const prevLast = prev[prev.length - 1]?.id;
          const nextLast = incoming[incoming.length - 1]?.id;
          if (prev.length === incoming.length && prevLast === nextLast) {
            return prev;
          }
          return incoming;
        });
        if (!silent) {
          setAssignTargetId(json.inquiry?.assigned_to_user_id || "");
        }
      }
    } finally {
      if (!silent) setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    fetchInquiries();
  }, [fetchInquiries]);

  useEffect(() => {
    prevMessageCountRef.current = 0;
    if (selectedId) {
      fetchThread(selectedId);
    } else {
      setActiveInquiry(null);
      setMessages([]);
    }
  }, [selectedId, fetchThread]);

  // Auto-refresh inquiry list & active thread every 5s while tab is visible
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchInquiries(true);
        if (selectedId) {
          fetchThread(selectedId, true);
        }
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchInquiries, fetchThread, selectedId]);

  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const handleAssign = async () => {
    if (!activeInquiry || !assignTargetId) return;
    setAssigning(true);
    try {
      const res = await fetch(`/api/staff/inquiries/${activeInquiry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedToUserId: assignTargetId,
          handoffNote: handoffNote.trim() || undefined,
        }),
      });
      if (res.ok) {
        setHandoffNote("");
        await Promise.all([fetchThread(activeInquiry.id), fetchInquiries()]);
      }
    } finally {
      setAssigning(false);
    }
  };

  const handleStatusChange = async (newStatus: InquiryStatus) => {
    if (!activeInquiry) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/staff/inquiries/${activeInquiry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await Promise.all([fetchThread(activeInquiry.id), fetchInquiries()]);
      }
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInquiry || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/staff/inquiries/${activeInquiry.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: replyText.trim(),
          isInternalNote,
        }),
      });
      if (res.ok) {
        setReplyText("");
        await Promise.all([fetchThread(activeInquiry.id), fetchInquiries()]);
      }
    } finally {
      setSendingReply(false);
    }
  };

  const assignableOfficers = staffOptions.filter((s) =>
    ["assessor", "inspector", "reviewer"].includes(s.role.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Top Filters Bar */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search INQ-#, sender, email, subject..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="answered">Answered</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as any)}>
              <SelectTrigger className="w-[170px] h-9 text-xs">
                <SelectValue placeholder="Queue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">
                  {["assessor", "inspector"].includes(viewerRole) ? "My Assigned Queue" : "All Inquiries"}
                </SelectItem>
                <SelectItem value="mine">Assigned to Me</SelectItem>
                <SelectItem value="all">All Inquiries</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="sm" onClick={() => fetchInquiries()} className="gap-1.5 h-9">
            <RefreshCw className={`h-3.5 w-3.5 ${loadingList ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Split Pane: Inbox List + Chat Thread */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[600px]">
        {/* Left Pane: Inquiry List */}
        <Card className="lg:col-span-5 border-slate-200 shadow-xs flex flex-col overflow-hidden max-h-[680px]">
          <CardHeader className="py-3 px-4 border-b border-slate-100 bg-slate-50/70">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span>Citizen &amp; Applicant Inquiries</span>
              <Badge variant="secondary" className="tabular-nums">{inquiries.length}</Badge>
            </CardTitle>
          </CardHeader>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingList ? (
              <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading inquiries...
              </div>
            ) : inquiries.length === 0 ? (
              <div className="text-center py-16 px-4 text-slate-500 text-sm">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                No inquiries match your current filter.
              </div>
            ) : (
              inquiries.map((item) => {
                const badge = STATUS_BADGES[item.status] || STATUS_BADGES.open;
                const isSelected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left p-3.5 transition-colors cursor-pointer ${
                      isSelected ? "bg-blue-50/80 border-l-4 border-[#0072bc]" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-[#0072bc]">
                        {item.inquiry_number}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 truncate">{item.subject}</p>
                    <p className="text-xs text-slate-600 truncate mt-0.5">
                      {item.sender_name} • {item.sender_email}
                    </p>
                    {item.last_message && (
                      <p className="text-xs text-slate-400 truncate mt-1">{item.last_message}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                      <span>
                        {item.assigned_to_name
                          ? `Assigned: ${item.assigned_to_name} (${(item.assigned_role || "").toUpperCase()})`
                          : "Unassigned"}
                      </span>
                      <span>{new Date(item.updated_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Right Pane: Thread & Assignment */}
        <Card className="lg:col-span-7 border-slate-200 shadow-xs flex flex-col overflow-hidden max-h-[680px]">
          {!activeInquiry ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <MessageSquare className="h-12 w-12 mb-3 text-slate-200" />
              <p className="text-sm font-semibold text-slate-600">Select an inquiry to view the conversation</p>
              <p className="text-xs mt-1 max-w-sm">
                Reviewers can reply directly or assign inquiries to an Assessor or Inspector with internal handoff notes.
              </p>
            </div>
          ) : (
            <>
              {/* Inquiry Header */}
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 space-y-3 shrink-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#0072bc] bg-blue-50 px-2 py-0.5 rounded">
                        {activeInquiry.inquiry_number}
                      </span>
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {activeInquiry.category.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{activeInquiry.subject}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 mt-1">
                      <span className="font-medium text-slate-800">{activeInquiry.sender_name}</span>
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {activeInquiry.sender_email}
                      </span>
                      {activeInquiry.sender_phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {activeInquiry.sender_phone}
                        </span>
                      )}
                      {activeInquiry.organization && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" /> {activeInquiry.organization}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Selector */}
                  <div className="flex items-center gap-2">
                    <Select
                      value={activeInquiry.status}
                      onValueChange={(val) => handleStatusChange(val as InquiryStatus)}
                      disabled={updatingStatus}
                    >
                      <SelectTrigger className="w-[135px] h-8 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="answered">Answered</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Reviewer / Admin Assignment Bar */}
                {canAssign && (
                  <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center gap-2">
                    <Select value={assignTargetId} onValueChange={setAssignTargetId}>
                      <SelectTrigger className="flex-1 min-w-[200px] h-8 text-xs bg-white">
                        <SelectValue placeholder="Assign to Assessor or Inspector..." />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableOfficers.map((staff) => {
                          const fullName = `${staff.first_name || ""} ${staff.last_name || ""}`.trim() || staff.email;
                          return (
                            <SelectItem key={staff.id} value={staff.id}>
                              [{staff.role.toUpperCase()}] {fullName} ({staff.email})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Optional internal handoff note..."
                      value={handoffNote}
                      onChange={(e) => setHandoffNote(e.target.value)}
                      className="flex-1 min-w-[180px] h-8 text-xs bg-white"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAssign}
                      disabled={assigning || !assignTargetId}
                      className="h-8 text-xs bg-[#0072bc] hover:bg-[#005a96] text-white gap-1.5"
                    >
                      {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                      Assign
                    </Button>
                  </div>
                )}
              </div>

              {/* Chat Messages Thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
                {loadingThread ? (
                  <div className="flex items-center justify-center py-12 text-slate-500 text-sm">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading messages...
                  </div>
                ) : (
                  messages.map((m) => {
                    if (m.sender_type === "system") {
                      return (
                        <div key={m.id} className="text-center my-2">
                          <span className="inline-block text-[11px] bg-slate-200/80 text-slate-700 px-3 py-1 rounded-full">
                            {m.message}
                          </span>
                        </div>
                      );
                    }
                    const isStaff = m.sender_type === "staff";
                    return (
                      <div key={m.id} className={`flex flex-col ${isStaff ? "items-end" : "items-start"}`}>
                        <div
                          className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs ${
                            m.is_internal_note
                              ? "bg-amber-50 border border-amber-200 text-amber-950 rounded-br-xs"
                              : isStaff
                              ? "bg-[#0072bc] text-white rounded-br-xs"
                              : "bg-white border border-slate-200 text-slate-900 rounded-bl-xs"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-[11px] font-bold ${
                                m.is_internal_note
                                  ? "text-amber-800"
                                  : isStaff
                                  ? "text-blue-100"
                                  : "text-[#0072bc]"
                              }`}
                            >
                              {m.sender_name}
                              {m.sender_role ? ` (${m.sender_role.toUpperCase()})` : ""}
                            </span>
                            {m.is_internal_note && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded">
                                <Lock className="h-2.5 w-2.5" /> Internal Note
                              </span>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {new Date(m.created_at).toLocaleString()}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Composer */}
              <form onSubmit={handleSendReply} className="p-3 border-t border-slate-200 bg-white space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(false)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                        !isInternalNote
                          ? "bg-[#0072bc] text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Globe className="h-3 w-3" />
                      Reply to Citizen
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(true)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                        isInternalNote
                          ? "bg-amber-500 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Lock className="h-3 w-3" />
                      Internal Staff Note
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {isInternalNote ? "Only visible to RWB staff" : "Emails citizen & updates chat"}
                  </span>
                </div>

                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    placeholder={
                      isInternalNote
                        ? "Write an internal note for Reviewer / Assessor / Inspector..."
                        : "Write your official reply to the citizen..."
                    }
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="text-xs sm:text-sm resize-none"
                    disabled={sendingReply}
                  />
                  <Button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className={`h-10 px-4 text-xs font-bold shrink-0 text-white ${
                      isInternalNote ? "bg-amber-600 hover:bg-amber-700" : "bg-[#0072bc] hover:bg-[#005a96]"
                    }`}
                  >
                    {sendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

