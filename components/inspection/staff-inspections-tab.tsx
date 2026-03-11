"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertCircle, Eye, Loader2, MoreHorizontal, Search } from "lucide-react";
import { CreateInspectionDialog } from "@/components/inspection/create-inspection-dialog";

type InspectionRow = {
  id: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | string;
  type?: string;
  result?: string | null;
  review_status?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  scheduled_date?: string;
  completed_date?: string | null;
  created_at?: string;
  application: {
    id: string;
    application_number?: string;
    project_title?: string;
    applicant?: {
      first_name?: string;
      last_name?: string;
      company_name?: string;
      account_type?: string;
    } | null;
  } | null;
};

type PermitLite = {
  id: string;
  application_id: string;
  permit_number: string;
  status: string;
  issued_date?: string;
  expiry_date?: string;
};

type PermitRegistryHolder = {
  permit_number: string;
  permit_holder: string | null;
};

function shortId(id: string): string {
  return id ? `${id.slice(0, 8)}…` : "—";
}

function fmtDate(dateString?: string | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function applicantName(applicant: InspectionRow["application"] extends infer A ? any : any): string {
  const a = applicant?.applicant;
  if (!a) return "—";
  if (a.account_type === "individual") {
    const n = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
    return n || "—";
  }
  return a.company_name || "—";
}

function statusPill(status: string) {
  const cfg: Record<string, { label: string; className: string }> = {
    submitted: {
      label: "Submitted",
      className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
    },
    under_review: {
      label: "Under review",
      className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    },
    scheduled: {
      label: "Scheduled",
      className: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-800",
    },
    in_progress: {
      label: "Ongoing",
      className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    },
    cancelled: {
      label: "Cancelled",
      className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
    },
  };
  const c = cfg[status] || {
    label: status,
    className: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/50 dark:text-slate-300 dark:border-slate-800",
  };
  return (
    <Badge variant="outline" className={`${c.className} text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap`}>
      {c.label}
    </Badge>
  );
}

function workflowStatus(row: InspectionRow): string {
  if (row.status !== "completed") return row.status;
  if (row.review_status === "reviewed") return "completed";
  const hasReviewActivity = Boolean(row.reviewed_at || row.review_notes || row.review_status === "changes_requested");
  return hasReviewActivity ? "under_review" : "submitted";
}

export function StaffInspectionsTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [permitByAppId, setPermitByAppId] = useState<Record<string, PermitLite | undefined>>({});
  const [permitHolderByNumber, setPermitHolderByNumber] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: inspErr } = await supabase
          .from("inspections")
          .select(
            `
            id,
            status,
            type,
            result,
            review_status,
            review_notes,
            reviewed_at,
            scheduled_date,
            completed_date,
            created_at,
            application:applications!application_id(
              id,
              application_number,
              project_title,
              applicant:users!applicant_id(
                first_name,
                last_name,
                company_name,
                account_type
              )
            )
          `
          )
          .order("created_at", { ascending: false });

        if (inspErr) throw inspErr;
        const rows = (data || []) as unknown as InspectionRow[];
        setInspections(rows);

        const appIds = rows.map(r => r.application?.id).filter(Boolean) as string[];
        if (appIds.length === 0) {
          setPermitByAppId({});
          return;
        }

        const { data: permits, error: permitErr } = await supabase
          .from("permits")
          .select("id, application_id, permit_number, status, issued_date, expiry_date")
          .in("application_id", appIds);

        if (permitErr) throw permitErr;

        const map: Record<string, PermitLite | undefined> = {};
        for (const p of (permits || []) as any[]) {
          // keep first; there should typically be only one permit per application
          if (!map[p.application_id]) map[p.application_id] = p as PermitLite;
        }
        setPermitByAppId(map);

        const permitNumbers = Array.from(
          new Set(
            ((permits || []) as PermitLite[])
              .map((p) => p.permit_number)
              .filter((permitNumber): permitNumber is string => Boolean(permitNumber))
          )
        );

        if (permitNumbers.length > 0) {
          const { data: registryRows, error: holderErr } = await supabase
            .from("permit_registry")
            .select("permit_number, permit_holder")
            .in("permit_number", permitNumbers);

          if (holderErr) {
            console.warn("⚠️ Failed to load permit holder names, falling back to applicant names:", holderErr);
            setPermitHolderByNumber({});
          } else {
            const holderMap: Record<string, string> = {};
            for (const row of (registryRows || []) as PermitRegistryHolder[]) {
              if (row.permit_number && row.permit_holder) holderMap[row.permit_number] = row.permit_holder;
            }
            setPermitHolderByNumber(holderMap);
          }
        } else {
          setPermitHolderByNumber({});
        }
      } catch (e: any) {
        console.error("❌ Failed to load inspections:", e);
        setError(e?.message || "Failed to load inspections");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inspections;
    return inspections.filter(r => {
      const id = (r.id || "").toLowerCase();
      const appNo = (r.application?.application_number || "").toLowerCase();
      const permitNo = r.application?.id ? (permitByAppId[r.application.id]?.permit_number || "").toLowerCase() : "";
      const permitNumber = r.application?.id ? permitByAppId[r.application.id]?.permit_number : undefined;
      const permitHolder = (permitNumber ? permitHolderByNumber[permitNumber] : null) || applicantName(r.application as any);
      return id.includes(q) || appNo.includes(q) || permitNo.includes(q) || permitHolder.toLowerCase().includes(q);
    });
  }, [inspections, permitByAppId, permitHolderByNumber, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading inspections…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800">
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Inspections</span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{filtered.length}</Badge>
            <CreateInspectionDialog />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 w-full md:w-[360px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search inspection id, permit #, applicant…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[16%]">Inspection</TableHead>
                <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[16%]">Date</TableHead>
                <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[22%]">Permit #</TableHead>
                <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[26%]">Applicant</TableHead>
                <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[12%]">Status</TableHead>
                <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium w-[8%]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No inspections found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const appId = r.application?.id;
                  const permit = appId ? permitByAppId[appId] : undefined;
                  const date = r.completed_date || r.scheduled_date || r.created_at || null;
                  const holderName = permit?.permit_number
                    ? (permitHolderByNumber[permit.permit_number] || applicantName(r.application as any))
                    : applicantName(r.application as any);
                  return (
                    <TableRow key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors">
                      <TableCell className="font-medium">
                        <Link href={`/inspection/${r.id}`} className="hover:underline">
                          {shortId(r.id)}
                        </Link>
                      </TableCell>
                      <TableCell>{fmtDate(date)}</TableCell>
                      <TableCell className="font-medium">{permit?.permit_number || "—"}</TableCell>
                      <TableCell className="truncate max-w-[280px]">{holderName}</TableCell>
                      <TableCell>{statusPill(workflowStatus(r))}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open actions</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/inspection/${r.id}`} className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                View inspection
                              </Link>
                            </DropdownMenuItem>
                            {r.application?.application_number ? (
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/inspection/application/${encodeURIComponent(r.application.application_number)}`}
                                  className="flex items-center gap-2"
                                >
                                  <Eye className="h-4 w-4" />
                                  View application
                                </Link>
                              </DropdownMenuItem>
                            ) : null}
                            {permit?.permit_number ? (
                              <DropdownMenuItem asChild>
                                <Link href={`/permit/view/${encodeURIComponent(permit.permit_number)}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" />
                                  View permit
                                </Link>
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}


