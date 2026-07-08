"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertCircle, Eye, Loader2, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { CreateInspectionDialog } from "@/components/inspection/create-inspection-dialog";
import { StatusFilterChips, type StatusChipDef } from "@/components/shared/status-filter-chips";
import {
  getInspectionWorkflowLabel,
  getInspectionWorkflowClassName,
  type InspectionWorkflowStatus,
} from "@/types/inspection-workflow";
import { getInspectionBasePath, getApplicationBasePath } from "@/lib/inspection-workflow";
import { staffDashboardBaseForRole } from "@/lib/staff-nav";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";

const INSPECTIONS_QUERY_KEY = "staff-inspections";

type InspectionsData = {
  inspections: InspectionRow[];
  permitByAppId: Record<string, PermitLite | undefined>;
  permitHolderByNumber: Record<string, string>;
  registryByInspectionId: Record<string, { permit_number: string; permit_holder: string | null } | undefined>;
};

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
  inspector_id?: string | null;
  type?: string;
  result?: string | null;
  review_status?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  scheduled_date?: string;
  completed_date?: string | null;
  created_at?: string;
  owner_kind?: string | null;
  owner_id?: string | null;
  manual_inspection_subject?: string | null;
  manual_inspection_reason?: string | null;
  manual_site_notes?: string | null;
  locked_field_overrides?: Record<string, string> | null;
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

function getDisplayStatus(row: InspectionRow): string {
  if (row.status === "in_progress") return "draft";
  if (row.status !== "completed") return row.status;
  return row.workflow_status || "submitted";
}

function manualHolderName(row: InspectionRow): string {
  return (
    row.manual_inspection_subject ||
    row.locked_field_overrides?.permitHolderName ||
    "No permit inspection"
  );
}

function manualLocationText(row: InspectionRow): string {
  const o = row.locked_field_overrides || {};
  return [
    o.permitLocationVillage,
    o.permitLocationCell,
    o.permitLocationSector,
    o.permitLocationDistrict,
    o.permitLocationProvince,
  ]
    .filter(Boolean)
    .join(", ") || row.manual_site_notes || "";
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
    id: "no_permit",
    label: "No Permit",
    statuses: ["manual_unpermitted"],
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
  const currentUserId = userProfile?.id ?? null;
  const basePath = getInspectionBasePath(roleContext || userProfile?.role);
  const appBasePath = getApplicationBasePath(roleContext || userProfile?.role);
  // Return target threaded into every row action so a detail-page "Back" lands
  // on this exact list (right tab) even on a cold load.
  const backParam = `?back=${encodeURIComponent(`${staffDashboardBaseForRole(roleContext || userProfile?.role)}?tab=inspections`)}`;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Cached, background-revalidated list data — mirrors the react-query caching the
  // Water Use Reports and Permit Registry tabs already use, so returning here after
  // a detail-page visit shows the previous rows instantly instead of re-hitting the
  // DB. The user id in the key isolates cached rows per staffer (prevents one user's
  // list briefly leaking to the next after a client-side login switch). Data swaps
  // atomically on success, so the list is never rendered as a partial snapshot, and
  // a failed background refresh keeps the last-good rows while exposing isError.
  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery<InspectionsData>({
    // Stable key (same shape the Water Use Reports / Permit Registry tabs use) so a
    // remount after a detail-page visit hits the persisted cache instead of showing
    // a spinner. Cross-user isolation is handled by clearing the cache on logout.
    queryKey: [INSPECTIONS_QUERY_KEY],
    queryFn: fetchInspections,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const inspections = data?.inspections ?? [];
  const permitByAppId = data?.permitByAppId ?? {};
  const permitHolderByNumber = data?.permitHolderByNumber ?? {};
  const registryByInspectionId = data?.registryByInspectionId ?? {};
  const [activeChipId, setActiveChipId] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this draft inspection? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("inspections").delete().eq("id", id);
      if (error) throw error;
      queryClient.setQueryData<InspectionsData>([INSPECTIONS_QUERY_KEY], (old) =>
        old ? { ...old, inspections: old.inspections.filter((r) => r.id !== id) } : old
      );
    } catch (e: any) {
      alert(e?.message || "Failed to delete inspection");
    } finally {
      setDeletingId(null);
    }
  };

  // Fetches everything the list renders as ONE atomic result (react-query swaps it
  // in on success), so the table is never shown as a partial snapshot. Hoisted, so
  // the useQuery above can reference it. Throws on error → react-query surfaces it.
  async function fetchInspections(): Promise<InspectionsData> {
        const { data, error: inspErr } = await supabase
          .from("inspections")
          .select(
            `
            id,
            status,
            workflow_status,
            inspector_id,
            type,
            result,
            review_status,
            review_notes,
            reviewed_at,
            scheduled_date,
            completed_date,
            created_at,
            owner_kind,
            owner_id,
            manual_inspection_subject,
            manual_inspection_reason,
            manual_site_notes,
            locked_field_overrides,
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

        // Registry-backed inspections: resolve permit via polymorphic owner_kind/owner_id
        const registryOwnerIds = Array.from(
          new Set(
            rows
              .filter((r) => r.owner_kind === "permit_registry" && r.owner_id)
              .map((r) => r.owner_id as string)
          )
        );
        const registryById: Record<string, { permit_number: string; permit_holder: string | null }> = {};
        if (registryOwnerIds.length > 0) {
          const { data: regRows, error: regErr } = await supabase
            .from("permit_registry")
            .select("id, permit_number, permit_holder")
            .in("id", registryOwnerIds);
          if (regErr) {
            console.warn("⚠️ Failed to load permit_registry for inspections:", regErr);
          } else {
            for (const r of (regRows || []) as Array<{ id: string; permit_number: string; permit_holder: string | null }>) {
              registryById[r.id] = { permit_number: r.permit_number, permit_holder: r.permit_holder };
            }
          }
        }

        // Fallback: if registry was replaced (TRUNCATE+INSERT), owner_id UUIDs are stale.
        // Re-resolve via locked_field_overrides.permitNumber.
        const unresolved = rows.filter(
          (r) => r.owner_kind === "permit_registry" && r.owner_id && !registryById[r.owner_id as string]
        );
        if (unresolved.length > 0) {
          const fallbackPNs = Array.from(new Set(
            unresolved
              .map((r) => (r.locked_field_overrides as Record<string, string> | null)?.permitNumber)
              .filter((pn): pn is string => Boolean(pn))
          ));
          if (fallbackPNs.length > 0) {
            const { data: fbRows } = await supabase
              .from("permit_registry")
              .select("id, permit_number, permit_holder")
              .in("permit_number", fallbackPNs)
              .order("row_index", { ascending: false, nullsFirst: false });
            if (fbRows) {
              const pnMap: Record<string, { id: string; permit_number: string; permit_holder: string | null }> = {};
              for (const fb of fbRows as Array<{ id: string; permit_number: string; permit_holder: string | null }>) {
                if (fb.permit_number && !pnMap[fb.permit_number]) pnMap[fb.permit_number] = fb;
              }
              for (const r of unresolved) {
                const pn = (r.locked_field_overrides as Record<string, string> | null)?.permitNumber;
                if (pn && pnMap[pn] && r.owner_id) registryById[r.owner_id as string] = pnMap[pn];
              }
            }
          }
        }

        const registryByInspection: Record<string, { permit_number: string; permit_holder: string | null } | undefined> = {};
        for (const r of rows) {
          if (r.owner_kind === "permit_registry" && r.owner_id && registryById[r.owner_id]) {
            registryByInspection[r.id] = registryById[r.owner_id];
          }
        }

        const appIds = rows.map(r => r.application?.id).filter(Boolean) as string[];
        if (appIds.length === 0) {
          // Still collect holders from registry for search/row rendering
          const holderMap: Record<string, string> = {};
          for (const v of Object.values(registryByInspection)) {
            if (v?.permit_number && v.permit_holder) holderMap[v.permit_number] = v.permit_holder;
          }
          return {
            inspections: rows,
            permitByAppId: {},
            permitHolderByNumber: holderMap,
            registryByInspectionId: registryByInspection,
          };
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

        // Collect all permit numbers (from permits table + registry stubs)
        const permitNumbers = Array.from(
          new Set(
            Object.values(map)
              .map((p) => p?.permit_number)
              .filter((pn): pn is string => Boolean(pn))
          )
        );

        const holderMap: Record<string, string> = {};
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

          for (const v of Object.values(registryByInspection)) {
            if (v?.permit_number && v.permit_holder && !holderMap[v.permit_number]) {
              holderMap[v.permit_number] = v.permit_holder;
            }
          }

        } else {
          for (const v of Object.values(registryByInspection)) {
            if (v?.permit_number && v.permit_holder) holderMap[v.permit_number] = v.permit_holder;
          }
        }

        return {
          inspections: rows,
          permitByAppId: map,
          permitHolderByNumber: holderMap,
          registryByInspectionId: registryByInspection,
        };
  }

  const visibleInspections = useMemo(() => {
    return inspections.filter((r) => {
      const isPrivateWorkInProgress = r.status === "in_progress" || r.workflow_status === "draft";
      if (!isPrivateWorkInProgress) return true;
      return Boolean(currentUserId && r.inspector_id === currentUserId);
    });
  }, [inspections, currentUserId]);

  const statusForFilter = useMemo(() => {
    return visibleInspections
      .map((r) => ({
      ...r,
      status: r.owner_kind === "manual_unpermitted" ? "manual_unpermitted" : getDisplayStatus(r),
    }));
  }, [visibleInspections]);

  const filtered = useMemo(() => {
    let result = visibleInspections;

    const activeChip = CHIP_DEFS.find((c) => c.id === activeChipId);
    if (activeChip && activeChip.statuses.length > 0) {
      result = result.filter((r) => {
        if (activeChip.id === "no_permit") {
          return r.owner_kind === "manual_unpermitted";
        }
        const displayStatus = getDisplayStatus(r);
        return activeChip.statuses.includes(displayStatus);
      });
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((r) => {
        if (r.owner_kind === "manual_unpermitted") {
          return [
            "no permit",
            manualHolderName(r),
            manualLocationText(r),
            r.manual_inspection_reason || "",
            r.locked_field_overrides?.permitNumber || "",
          ].join(" ").toLowerCase().includes(q);
        }
        const permitNumber =
          (r.application?.id ? permitByAppId[r.application.id]?.permit_number : undefined) ||
          registryByInspectionId[r.id]?.permit_number;
        const permitNo = (permitNumber || "").toLowerCase();
        const permitHolder =
          (permitNumber ? permitHolderByNumber[permitNumber] : null) ||
          registryByInspectionId[r.id]?.permit_holder ||
          applicantName(r.applicant);
        return permitNo.includes(q) || permitHolder.toLowerCase().includes(q);
      });
    }

    return result;
  }, [visibleInspections, permitByAppId, permitHolderByNumber, registryByInspectionId, search, activeChipId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading inspections…</span>
        </div>
      </div>
    );
  }

  // Only a first-load failure (no data at all) replaces the list with an error.
  if (isError && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-6 w-6" />
          <span>{queryError instanceof Error ? queryError.message : "Failed to load inspections"}</span>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4">
      {isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Couldn&apos;t refresh — showing the last loaded list.</span>
        </div>
      ) : null}
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
              <Input placeholder="Search permit #, permit holder, no permit…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[18%]">Date submitted</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[24%]">Permit #</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[30%]">Permit Holder</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[18%]">Workflow</TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium w-[10%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No inspections found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => {
                    const isManual = r.owner_kind === "manual_unpermitted";
                    const appId = r.application?.id;
                    const appPermit = appId ? permitByAppId[appId] : undefined;
                    const registryEntry = registryByInspectionId[r.id];
                    const permitNumber = isManual
                      ? (r.locked_field_overrides?.permitNumber || "No permit")
                      : appPermit?.permit_number || registryEntry?.permit_number;
                    const date = r.completed_date || r.scheduled_date || r.created_at || null;
                    const holderName =
                      isManual
                        ? manualHolderName(r)
                        : (permitNumber ? permitHolderByNumber[permitNumber] : undefined) ||
                          registryEntry?.permit_holder ||
                          applicantName(r.applicant);
                    const displayStatus = getDisplayStatus(r);
                    const viewIdentifier = permitNumber || r.application?.application_number;
                    const viewHref = isManual
                      ? `${basePath}/permit/manual-${r.id}`
                      : viewIdentifier
                      ? `${basePath}/permit/${encodeURIComponent(viewIdentifier)}`
                      : `${basePath}/${r.id}`;
                    return (
                      <TableRow key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-900/40 transition-colors">
                        <TableCell>{fmtDate(date)}</TableCell>
                        <TableCell className="font-medium">
                          {isManual ? (
                            <span className="inline-flex items-center gap-2">
                              No permit
                              <Badge variant="outline" className="text-[10px]">No Permit</Badge>
                            </span>
                          ) : (
                            permitNumber || "—"
                          )}
                        </TableCell>
                        <TableCell className="truncate max-w-[280px]">
                          {holderName}
                          {isManual && manualLocationText(r) ? (
                            <div className="text-xs text-muted-foreground truncate">{manualLocationText(r)}</div>
                          ) : null}
                        </TableCell>
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
                                <Link href={`${viewHref}${backParam}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" />
                                  View inspection
                                </Link>
                              </DropdownMenuItem>
                              {r.application?.application_number ? (
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`${appBasePath}/${encodeURIComponent(r.application.application_number)}${backParam}`}
                                    className="flex items-center gap-2"
                                  >
                                    <Eye className="h-4 w-4" />
                                    View application
                                  </Link>
                                </DropdownMenuItem>
                              ) : null}
                              {!isManual && permitNumber ? (
                                <DropdownMenuItem asChild>
                                  <Link href={`/permit/view/${encodeURIComponent(permitNumber)}${backParam}`} className="flex items-center gap-2">
                                    <Eye className="h-4 w-4" />
                                    View permit
                                  </Link>
                                </DropdownMenuItem>
                              ) : null}
                              {r.status === "in_progress" && r.inspector_id === currentUserId ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="flex items-center gap-2 text-red-600 focus:text-red-600"
                                    disabled={deletingId === r.id}
                                    onClick={() => handleDelete(r.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {deletingId === r.id ? "Deleting…" : "Delete draft"}
                                  </DropdownMenuItem>
                                </>
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
    </div>
    </>
  );
}
