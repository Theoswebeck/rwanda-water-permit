"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Eye, Loader2, MoreHorizontal, Search, UserPlus } from "lucide-react";
import { CreateInspectionDialog } from "@/components/inspection/create-inspection-dialog";
import { StatusFilterChips, type StatusChipDef } from "@/components/shared/status-filter-chips";
import {
  getInspectionWorkflowLabel,
  getInspectionWorkflowClassName,
  type InspectionWorkflowStatus,
} from "@/types/inspection-workflow";
import { getInspectionBasePath } from "@/lib/inspection-workflow";

type ApplicantInfo = {
  first_name?: string;
  last_name?: string;
  company_name?: string;
  account_type?: string;
};

type InspectionRow = {
  id: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | string;
  workflow_status: InspectionWorkflowStatus | string;
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
  } | null;
  applicant?: ApplicantInfo | null;
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

function applicantName(a: ApplicantInfo | null | undefined): string {
  if (!a) return "—";
  const fullName = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  if (a.account_type === "individual") return fullName || "—";
  return a.company_name || fullName || "—";
}

function statusPill(status: InspectionWorkflowStatus | string) {
  const label = getInspectionWorkflowLabel(status);
  const className = getInspectionWorkflowClassName(status);
  return (
    <Badge variant="outline" className={`${className} text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap`}>
      {label}
    </Badge>
  );
}

type AssessorUser = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
};

function getDisplayStatus(row: InspectionRow): string {
  if (row.status !== "completed") return row.status;
  return row.workflow_status || "submitted";
}


const CHIP_DEFS: StatusChipDef[] = [
  {
    id: "all",
    label: "All",
    statuses: [],
    priority: "secondary",
  },
  {
    id: "in_field",
    label: "In Field",
    statuses: ["scheduled", "in_progress"],
    priority: "secondary",
  },
  {
    id: "new_submissions",
    label: "New Submissions",
    statuses: ["submitted"],
    priority: "primary",
  },
  {
    id: "with_assessors",
    label: "With Assessors",
    statuses: ["pending_assessment"],
    priority: "secondary",
  },
  {
    id: "returned",
    label: "Returned to Assessor",
    statuses: ["returned_to_assessment"],
    priority: "primary",
  },
  {
    id: "review",
    label: "Review",
    statuses: ["pending_review", "returned_to_review"],
    priority: "primary",
  },
  {
    id: "verification",
    label: "Verification",
    statuses: ["pending_verification", "returned_to_verification"],
    priority: "secondary",
  },
  {
    id: "approval",
    label: "Approval",
    statuses: ["pending_approval"],
    priority: "secondary",
  },
  {
    id: "final",
    label: "Finalized",
    statuses: ["approved", "rejected"],
    priority: "downstream",
  },
];

interface StaffInspectionsTabProps {
  roleContext?: string;
}

export function StaffInspectionsTab({ roleContext }: StaffInspectionsTabProps) {
  const { userProfile } = useAuth();
  const basePath = getInspectionBasePath(roleContext || userProfile?.role);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [permitByAppId, setPermitByAppId] = useState<Record<string, PermitLite | undefined>>({});
  const [permitHolderByNumber, setPermitHolderByNumber] = useState<Record<string, string>>({});
  const [activeChipId, setActiveChipId] = useState("all");

  const [assessors, setAssessors] = useState<AssessorUser[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<InspectionRow | null>(null);
  const [selectedAssessorId, setSelectedAssessorId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  const canAssign = roleContext === "reviewer" || roleContext === "admin" || userProfile?.role === "reviewer" || userProfile?.role === "admin";

  useEffect(() => {
    if (!canAssign) return;
    const fetchAssessors = async () => {
      const { data, error: err } = await supabase
        .from("users")
        .select("id, first_name, last_name, role, email")
        .in("role", ["assessor"])
        .eq("status", "active")
        .order("first_name", { ascending: true });
      if (!err) setAssessors(data || []);
    };
    fetchAssessors();
  }, [canAssign]);

  const openAssignDialog = useCallback((inspection: InspectionRow) => {
    setSelectedInspection(inspection);
    setSelectedAssessorId("");
    setAssignDialogOpen(true);
  }, []);

  const handleAssignToAssessor = useCallback(async () => {
    if (!selectedInspection || !selectedAssessorId) return;
    try {
      setAssignLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const assessor = assessors.find(a => a.id === selectedAssessorId);
      if (!assessor) {
        alert("Please select a valid assessor");
        return;
      }

      const { error: updateError } = await supabase
        .from("inspections")
        .update({
          assigned_assessor_id: selectedAssessorId,
          workflow_status: "pending_assessment",
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedInspection.id);

      if (updateError) throw updateError;

      const { error: historyError } = await supabase
        .from("inspection_workflow_history")
        .insert({
          inspection_id: selectedInspection.id,
          user_id: user.id,
          from_status: selectedInspection.workflow_status || "submitted",
          to_status: "pending_assessment",
          action: "assign_to_assessor",
          comment: `Assigned to ${assessor.first_name} ${assessor.last_name} for assessment`,
        });

      if (historyError) {
        console.error("⚠️ Failed to log workflow history:", historyError);
      }

      console.log(`✅ Inspection ${selectedInspection.id.slice(0, 8)} assigned to ${assessor.first_name} ${assessor.last_name}`);

      setInspections(prev =>
        prev.map(ins =>
          ins.id === selectedInspection.id
            ? { ...ins, workflow_status: "pending_assessment" }
            : ins
        )
      );

      setAssignDialogOpen(false);
      setSelectedInspection(null);
      setSelectedAssessorId("");
    } catch (err: any) {
      console.error("❌ Error assigning assessor:", err);
      alert(err?.message || "Failed to assign assessor. Please try again.");
    } finally {
      setAssignLoading(false);
    }
  }, [selectedInspection, selectedAssessorId, assessors]);

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
            workflow_status,
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
          if (!map[p.application_id]) map[p.application_id] = p as PermitLite;
        }

        // For registry-sourced inspections (stub applications with REG- prefix),
        // create synthetic permit entries so the list shows the permit number.
        for (const r of rows) {
          const appNo = r.application?.application_number || "";
          const appRowId = r.application?.id;
          if (appRowId && appNo.startsWith("REG-") && !map[appRowId]) {
            const realPermitNo = appNo.replace(/^REG-/, "");
            map[appRowId] = {
              id: appRowId,
              application_id: appRowId,
              permit_number: realPermitNo,
              status: "active",
            } as any;
          }
        }

        setPermitByAppId(map);

        // Collect all permit numbers (from permits table + registry stubs)
        const permitNumbers = Array.from(
          new Set(
            Object.values(map)
              .map((p) => p?.permit_number)
              .filter((pn): pn is string => Boolean(pn))
          )
        );

        if (permitNumbers.length > 0) {
          const [registryResult, permitsResult] = await Promise.all([
            supabase
              .from("permit_registry")
              .select("permit_number, permit_holder")
              .in("permit_number", permitNumbers),
            supabase
              .from("permits")
              .select("permit_number, applicant")
              .in("permit_number", permitNumbers),
          ]);

          const holderMap: Record<string, string> = {};

          if (!permitsResult.error) {
            for (const row of (permitsResult.data || []) as any[]) {
              if (!row.permit_number) continue;
              const u = row.applicant;
              if (!u) continue;
              const name =
                u.account_type === "individual"
                  ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
                  : u.company_name || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
              if (name) holderMap[row.permit_number] = name;
            }
          }

          if (!registryResult.error) {
            for (const row of (registryResult.data || []) as PermitRegistryHolder[]) {
              if (row.permit_number && row.permit_holder) holderMap[row.permit_number] = row.permit_holder;
            }
          } else {
            console.warn("⚠️ Failed to load permit holder names from registry:", registryResult.error);
          }

          setPermitHolderByNumber(holderMap);
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

  const statusForFilter = useMemo(() => {
    return inspections.map((r) => ({
      ...r,
      status: getDisplayStatus(r),
    }));
  }, [inspections]);

  const filtered = useMemo(() => {
    let result = inspections;

    const activeChip = CHIP_DEFS.find((c) => c.id === activeChipId);
    if (activeChip && activeChip.statuses.length > 0) {
      result = result.filter((r) => {
        const displayStatus = getDisplayStatus(r);
        return activeChip.statuses.includes(displayStatus);
      });
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((r) => {
        const id = (r.id || "").toLowerCase();
        const appNo = (r.application?.application_number || "").toLowerCase();
        const permitNo = r.application?.id ? (permitByAppId[r.application.id]?.permit_number || "").toLowerCase() : "";
        const permitNumber = r.application?.id ? permitByAppId[r.application.id]?.permit_number : undefined;
        const permitHolder = (permitNumber ? permitHolderByNumber[permitNumber] : null) || applicantName(r.applicant);
        return id.includes(q) || appNo.includes(q) || permitNo.includes(q) || permitHolder.toLowerCase().includes(q);
      });
    }

    return result;
  }, [inspections, permitByAppId, permitHolderByNumber, search, activeChipId]);

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
    <>
    <div className="space-y-4">
      <StatusFilterChips
        chips={CHIP_DEFS}
        activeChipId={activeChipId}
        onChipChange={setActiveChipId}
        applications={statusForFilter}
      />

      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Inspections</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{filtered.length}</Badge>
              {roleContext === "assessor" && <CreateInspectionDialog />}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
            <div className="flex items-center gap-2 w-full md:w-[360px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search inspection id, permit #, permit holder…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[14%]">Inspection</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[12%]">Date</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[18%]">Permit #</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[24%]">Permit Holder</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[16%]">Workflow</TableHead>
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
                      ? (permitHolderByNumber[permit.permit_number] || applicantName(r.applicant))
                      : applicantName(r.applicant);
                    const displayStatus = getDisplayStatus(r);
                    return (
                      <TableRow key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors">
                        <TableCell className="font-medium">
                          <Link href={`${basePath}/${r.id}`} className="hover:underline">
                            {shortId(r.id)}
                          </Link>
                        </TableCell>
                        <TableCell>{fmtDate(date)}</TableCell>
                        <TableCell className="font-medium">{permit?.permit_number || "—"}</TableCell>
                        <TableCell className="truncate max-w-[280px]">{holderName}</TableCell>
                        <TableCell>{statusPill(displayStatus)}</TableCell>
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
                                <Link href={`${basePath}/${r.id}`} className="flex items-center gap-2">
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
                              {canAssign && displayStatus === "submitted" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => openAssignDialog(r)} className="flex items-center gap-2">
                                    <UserPlus className="h-4 w-4" />
                                    Assign Assessor
                                  </DropdownMenuItem>
                                </>
                              )}
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
    </div>

    <Dialog open={assignDialogOpen} onOpenChange={(open) => { if (!open) { setAssignDialogOpen(false); setSelectedInspection(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Assessor</DialogTitle>
          <DialogDescription>
            Assign an assessor to review inspection {selectedInspection ? shortId(selectedInspection.id) : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={selectedAssessorId} onValueChange={setSelectedAssessorId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an assessor…" />
            </SelectTrigger>
            <SelectContent>
              {assessors.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.first_name} {a.last_name} ({a.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setAssignDialogOpen(false); setSelectedInspection(null); }}>
            Cancel
          </Button>
          <Button disabled={!selectedAssessorId || assignLoading} onClick={handleAssignToAssessor}>
            {assignLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
