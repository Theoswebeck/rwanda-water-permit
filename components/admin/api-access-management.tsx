"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldX,
  RefreshCcw,
  Ban,
  Clock,
  MailCheck,
} from "lucide-react";

/**
 * Admin "API Access" tab (design: docs/api-access-DESIGN.md §7.2).
 *
 * Left: agency requests queue — approve (scope/period/rate-limit picker) or
 * reject. Right: granted keys — usage, expiry countdown, extend / revoke /
 * reissue. Keys are never visible here: approval emails the technical contact
 * a one-time claim link and the requester reveals the key themselves.
 */

type ApiRequest = {
  id: string;
  reference_no: string;
  institution_name: string;
  institution_type: string;
  tin: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  technical_email: string;
  purpose: string;
  requested_scopes: string[];
  requested_period_months: number;
  static_ip: string | null;
  status: "pending" | "approved" | "rejected";
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type ApiGrant = {
  id: string;
  request_id: string;
  key_prefix: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  scopes: string[];
  rate_limit_per_min: number;
  valid_from: string;
  valid_until: string;
  status: "active" | "revoked";
  granted_by: string;
  created_at: string;
  last_used_at: string | null;
  total_requests: number;
  institution_name: string;
  reference_no: string;
};

const SCOPE_LABELS: Record<string, { label: string; endpoints: string }> = {
  "permits:verify": { label: "Permit verification", endpoints: "GET /api/v1/permits/verify" },
  "permits:read": {
    label: "Permit records",
    endpoints: "GET /api/v1/permits · GET /api/v1/permits/{no}",
  },
  "stats:read": { label: "Aggregate statistics", endpoints: "GET /api/v1/statistics/summary" },
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    approved: "bg-green-100 text-green-800 border-green-200",
    rejected: "bg-red-100 text-red-800 border-red-200",
    active: "bg-green-100 text-green-800 border-green-200",
    revoked: "bg-slate-200 text-slate-700 border-slate-300",
  };
  return (
    <Badge variant="outline" className={map[status] ?? ""}>
      {status}
    </Badge>
  );
}

export function ApiAccessManagement() {
  const [requests, setRequests] = useState<ApiRequest[]>([]);
  const [grants, setGrants] = useState<ApiGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"requests" | "grants">("requests");

  const [detail, setDetail] = useState<ApiRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApiRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [reissueTarget, setReissueTarget] = useState<ApiGrant | null>(null);
  const [reissuePeriod, setReissuePeriod] = useState("12");
  const [extendTarget, setExtendTarget] = useState<ApiGrant | null>(null);
  const [extendUntil, setExtendUntil] = useState("");
  const [notice, setNotice] = useState<{ text: string; url?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/api-access", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = await res.json();
      setRequests(json.requests ?? []);
      setGrants(json.grants ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (url: string, body: unknown) => {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      return json;
    } finally {
      setBusy(false);
    }
  };

  const openApprove = (r: ApiRequest) => {
    setDetail({ ...r, _approving: true } as ApiRequest);
  };

  const approve = async (
    r: ApiRequest,
    scopes: string[],
    periodMonths: number,
    rateLimit: number,
    notes: string
  ) => {
    try {
      const json = await post(`/api/admin/api-access/requests/${r.id}/decision`, {
        action: "approve",
        scopes,
        period_months: periodMonths,
        rate_limit_per_min: rateLimit,
        notes: notes || undefined,
      });
      setDetail(null);
      setNotice(
        json.claim_sent_to
          ? { text: `Approved. A one-time key claim link was emailed to ${json.claim_sent_to} — the requester reveals the key themselves; it is never shown here.` }
          : {
              text: `Approved, but the claim email could NOT be sent (SMTP not configured?). Deliver this one-time claim link to the technical contact over a secure channel — the key is revealed only to whoever opens it:`,
              url: json.claim_url,
            }
      );
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Approval failed");
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    try {
      await post(`/api/admin/api-access/requests/${rejectTarget.id}/decision`, {
        action: "reject",
        notes: rejectNotes,
      });
      setRejectTarget(null);
      setRejectNotes("");
      setDetail(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Rejection failed");
    }
  };

  const grantAction = async (grant: ApiGrant, body: Record<string, unknown>) => {
    try {
      const json = await post(`/api/admin/api-access/grants/${grant.id}`, body);
      if (body.action === "reissue") {
        setNotice(
          json.claim_sent_to
            ? { text: `Key reissued. A one-time claim link was emailed to ${json.claim_sent_to}.` }
            : {
                text: `Key reissued, but the claim email could NOT be sent. Deliver this one-time claim link to the technical contact over a secure channel:`,
                url: json.claim_url,
              }
        );
      }
      setExtendTarget(null);
      setReissueTarget(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading API access data…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant={view === "requests" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("requests")}
          >
            Requests {pendingCount > 0 && <Badge className="ml-2">{pendingCount} pending</Badge>}
          </Button>
          <Button
            variant={view === "grants" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("grants")}
          >
            Granted keys
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCcw className="mr-1 h-4 w-4" /> Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{error}</CardContent>
        </Card>
      )}
      {actionError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700">{actionError}</CardContent>
        </Card>
      )}
      {notice && (
        <Card className={notice.url ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}>
          <CardContent className={`py-3 text-sm ${notice.url ? "text-amber-800" : "text-green-800"}`}>
            <div className="flex items-start gap-2">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{notice.text}</span>
              <button className="ml-auto text-xs underline" onClick={() => setNotice(null)}>
                dismiss
              </button>
            </div>
            {notice.url && (
              <div className="mt-2 flex items-center gap-2 pl-6">
                <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">{notice.url}</code>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  onClick={() => void navigator.clipboard.writeText(notice.url!)}
                >
                  Copy link
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {view === "requests" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agency access requests</CardTitle>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No requests submitted yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Requested scopes</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                      <TableCell className="font-mono text-xs">{r.reference_no}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.institution_name}</div>
                        <div className="text-xs text-slate-500">{r.contact_email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.requested_scopes?.map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {SCOPE_LABELS[s]?.label ?? s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{r.requested_period_months} mo</TableCell>
                      <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                      <TableCell>
                        <StatusChip status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {r.status === "pending" ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-green-300 text-green-700 hover:bg-green-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                openApprove(r);
                              }}
                            >
                              <ShieldCheck className="mr-1 h-4 w-4" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-red-300 text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRejectTarget(r);
                                setRejectNotes("");
                              }}
                            >
                              <ShieldX className="mr-1 h-4 w-4" /> Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">{fmtDate(r.reviewed_at)}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Granted keys</CardTitle>
          </CardHeader>
          <CardContent>
            {grants.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No keys issued yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Institution</TableHead>
                    <TableHead>Scopes</TableHead>
                    <TableHead>Valid until</TableHead>
                    <TableHead>Rate limit</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grants.map((g) => {
                    const remaining = daysUntil(g.valid_until);
                    return (
                      <TableRow key={g.id}>
                        <TableCell className="font-mono text-xs">
                          {g.claimed_at ? (
                            // Identification only — last 4 chars of the stored
                            // prefix; the key itself is never available here.
                            <span title={`Claimed ${fmtDate(g.claimed_at)}`}>…{g.key_prefix?.slice(-4)}</span>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-100 font-sans text-amber-800"
                              title={`Claim link emailed; expires ${fmtDate(g.claim_expires_at)}`}
                            >
                              awaiting claim
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{g.institution_name}</div>
                          <div className="text-xs text-slate-500">{g.reference_no}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {g.scopes.map((s) => (
                              <Badge key={s} variant="secondary" className="text-xs">
                                {SCOPE_LABELS[s]?.label ?? s}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {g.status === "active" ? (
                            <span
                              className={
                                remaining < 30 ? "font-medium text-red-600" : "text-slate-700"
                              }
                            >
                              {fmtDate(g.valid_until)}
                              <span className="ml-1 text-xs text-slate-500">
                                ({remaining}d)
                              </span>
                            </span>
                          ) : (
                            fmtDate(g.valid_until)
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{g.rate_limit_per_min}/min</TableCell>
                        <TableCell className="text-xs">
                          {g.total_requests} calls
                          <div className="text-slate-500">last {fmtDate(g.last_used_at)}</div>
                        </TableCell>
                        <TableCell>
                          <StatusChip status={g.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {g.status === "active" && (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                title="Extend validity"
                                onClick={() => {
                                  setExtendTarget(g);
                                  const d = new Date(g.valid_until);
                                  d.setFullYear(d.getFullYear() + 1);
                                  setExtendUntil(d.toISOString().slice(0, 10));
                                }}
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                title="Reissue (revoke + new key)"
                                onClick={() => {
                                  setReissueTarget(g);
                                  setReissuePeriod("12");
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-red-300 text-red-700 hover:bg-red-50"
                                title="Revoke immediately"
                                onClick={() => {
                                  if (confirm(`Revoke the key for ${g.institution_name}? This takes effect immediately.`)) {
                                    void grantAction(g, { action: "revoke" });
                                  }
                                }}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Request detail */}
      <RequestDetailDialog
        request={detail}
        busy={busy}
        onClose={() => setDetail(null)}
        onApprove={approve}
        onReject={(r) => {
          setDetail(null);
          setRejectTarget(r);
          setRejectNotes("");
        }}
      />

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject API access request</DialogTitle>
            <DialogDescription>
              {rejectTarget?.institution_name} ({rejectTarget?.reference_no}) — the reason is
              emailed to the technical contact.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Reason for rejection (required)…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || rejectNotes.trim().length < 3}
              onClick={() => void reject()}
            >
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShieldX className="mr-1 h-4 w-4" />}
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend dialog */}
      <Dialog open={!!extendTarget} onOpenChange={(open) => !open && setExtendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend key validity</DialogTitle>
            <DialogDescription>{extendTarget?.institution_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>New valid-until date</Label>
            <Input type="date" value={extendUntil} onChange={(e) => setExtendUntil(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !extendUntil}
              onClick={() => extendTarget && void grantAction(extendTarget, { action: "extend", valid_until: extendUntil })}
            >
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reissue dialog */}
      <Dialog open={!!reissueTarget} onOpenChange={(open) => !open && setReissueTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reissue API key</DialogTitle>
            <DialogDescription>
              {reissueTarget?.institution_name} — the current key is revoked immediately and a
              fresh one-time claim link (same scopes and rate limit) is emailed to the
              technical contact. Also use this to resend an expired or lost claim link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Validity period</Label>
            <Select value={reissuePeriod} onValueChange={setReissuePeriod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
                <SelectItem value="24">24 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReissueTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                reissueTarget &&
                void grantAction(reissueTarget, { action: "reissue", period_months: Number(reissuePeriod) })
              }
            >
              <KeyRound className="mr-1 h-4 w-4" /> Reissue key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Request detail + approve flow ──────────────────────────────────────────

function RequestDetailDialog({
  request,
  busy,
  onClose,
  onApprove,
  onReject,
}: {
  request: ApiRequest | null;
  busy: boolean;
  onClose: () => void;
  onApprove: (r: ApiRequest, scopes: string[], months: number, rateLimit: number, notes: string) => void;
  onReject: (r: ApiRequest) => void;
}) {
  const requested = request?.requested_scopes ?? [];
  const [scopes, setScopes] = useState<string[]>([]);
  const [period, setPeriod] = useState("12");
  const [customMonths, setCustomMonths] = useState("18");
  const [rateLimit, setRateLimit] = useState("60");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (request) {
      setScopes(request.requested_scopes ?? []);
      setPeriod(String(request.requested_period_months));
      setRateLimit("60");
      setNotes("");
      setCustomMonths("18");
    }
  }, [request]);

  if (!request) return null;
  const approving = (request as ApiRequest & { _approving?: boolean })._approving === true;
  const months = period === "custom" ? Number(customMonths) || 0 : Number(period);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {request.reference_no}
            <StatusChip status={request.status} />
          </DialogTitle>
          <DialogDescription>
            {request.institution_name} · {request.institution_type}
            {request.tin ? ` · TIN ${request.tin}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <InfoRow label="Contact" value={`${request.contact_name} · ${request.contact_email}${request.contact_phone ? ` · ${request.contact_phone}` : ""}`} />
            <InfoRow label="Technical contact" value={request.technical_email} />
            {request.static_ip && <InfoRow label="Declared static IP" value={request.static_ip} />}
            <InfoRow label="Requested period" value={`${request.requested_period_months} months`} />
            <InfoRow label="Submitted" value={new Date(request.created_at).toLocaleString()} />
          </div>

          <div>
            <div className="mb-1 font-medium text-slate-700">Purpose</div>
            <div className="whitespace-pre-wrap rounded-lg border bg-slate-50 p-3 text-slate-700">
              {request.purpose}
            </div>
          </div>

          {request.status === "pending" ? (
            <>
              <div>
                <div className="mb-2 font-medium text-slate-700">
                  Scopes to grant (agency requested: {requested.length}; only those can be granted)
                </div>
                <div className="space-y-2">
                  {requested.map((s) => (
                    <label
                      key={s}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-slate-50"
                    >
                      <Checkbox
                        checked={scopes.includes(s)}
                        onCheckedChange={(checked) =>
                          setScopes((prev) =>
                            checked ? [...prev, s] : prev.filter((x) => x !== s)
                          )
                        }
                        className="mt-0.5"
                      />
                      <span>
                        <span className="font-medium">{SCOPE_LABELS[s]?.label ?? s}</span>
                        <span className="block font-mono text-xs text-slate-500">
                          {SCOPE_LABELS[s]?.endpoints}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Validity period</Label>
                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                      <SelectItem value="24">24 months</SelectItem>
                      <SelectItem value="custom">Custom…</SelectItem>
                    </SelectContent>
                  </Select>
                  {period === "custom" && (
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      className="mt-2"
                      value={customMonths}
                      onChange={(e) => setCustomMonths(e.target.value)}
                      placeholder="Months (1–60)"
                    />
                  )}
                </div>
                <div>
                  <Label>Rate limit (requests/min)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={6000}
                    value={rateLimit}
                    onChange={(e) => setRateLimit(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Review notes (internal)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional context recorded with the decision…"
                />
              </div>
            </>
          ) : (
            <div className="rounded-lg border bg-slate-50 p-3 text-slate-600">
              <div>
                <span className="font-medium">Decision:</span> {request.status}
                {request.reviewed_by ? ` by ${request.reviewed_by}` : ""} on {fmtDate(request.reviewed_at)}
              </div>
              {request.review_notes && (
                <div className="mt-1">
                  <span className="font-medium">Notes:</span> {request.review_notes}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {request.status === "pending" && (
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => onReject(request)}
            >
              <ShieldX className="mr-1 h-4 w-4" /> Reject…
            </Button>
          )}
          {request.status === "pending" && approving && (
            <Button
              disabled={busy || scopes.length === 0 || months < 1}
              onClick={() => onApprove(request, scopes, months, Number(rateLimit) || 60, notes)}
            >
              {busy ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1 h-4 w-4" />
              )}
              Approve &amp; send key link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 break-words text-slate-800">{value}</div>
    </div>
  );
}
