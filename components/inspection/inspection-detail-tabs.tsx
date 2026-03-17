"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getInspectionById } from "@/lib/supabase";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Eye, Loader2 } from "lucide-react";
import { InspectionDetail } from "@/components/inspection/inspection-detail";
import { InspectionWorkflowActions } from "@/components/inspection/inspection-workflow-actions";
import { InspectionWorkflowTimeline } from "@/components/inspection/inspection-workflow-timeline";
import {
  getInspectionWorkflowLabel,
  getInspectionWorkflowClassName,
  type InspectionWorkflowStatus,
} from "@/types/inspection-workflow";

type PermitLite = {
  id: string;
  permit_number: string;
  status: string;
  water_source?: string;
  purpose?: string;
  water_allowance?: number;
  allowance_unit?: string;
  issued_date?: string;
  expiry_date?: string;
};

type RegistryEntry = {
  id: string;
  permit_number: string;
  permit_holder?: string;
  location?: string;
  authorized_activity?: string;
  water_source?: string;
  volume_or_area?: string;
  issuance_date?: string;
  expiration_date?: string;
  status?: string;
  method_of_water_taking?: string;
  contact?: string;
  latitude?: number;
  longitude?: number;
};

function fmtDate(dateString?: string | null): string {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function applicantName(applicant: any): string {
  if (!applicant) return "—";
  return applicant.company_name || `${applicant.first_name ?? ""} ${applicant.last_name ?? ""}`.trim() || "—";
}

function isRegistryApplication(applicationNumber?: string): boolean {
  return Boolean(applicationNumber && applicationNumber.startsWith("REG-"));
}

function extractPermitNumber(applicationNumber: string): string {
  return applicationNumber.replace(/^REG-/, "");
}

export function InspectionDetailTabs({ inspectionId, roleContext }: { inspectionId: string; roleContext?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<any>(null);
  const [permit, setPermit] = useState<PermitLite | null>(null);
  const [registryEntry, setRegistryEntry] = useState<RegistryEntry | null>(null);
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);

  const loadInspection = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await getInspectionById(inspectionId);
      setInspection(data);

      const applicationId = data?.application?.id;
      const appNumber = data?.application?.application_number as string | undefined;
      const isRegistry = isRegistryApplication(appNumber);

      if (isRegistry && appNumber) {
        const realPermitNumber = extractPermitNumber(appNumber);
        const { data: regData } = await supabase
          .from("permit_registry")
          .select("*")
          .eq("permit_number", realPermitNumber)
          .maybeSingle();

        setRegistryEntry((regData as RegistryEntry | null) || null);
        setPermit(null);
        return;
      }

      if (!applicationId) {
        setPermit(null);
        setRegistryEntry(null);
        return;
      }

      const { data: permitData, error: permitError } = await supabase
        .from("permits")
        .select("id, permit_number, status, water_source, purpose, water_allowance, allowance_unit, issued_date, expiry_date")
        .eq("application_id", applicationId)
        .maybeSingle();

      if (permitError) throw permitError;
      setPermit((permitData as any) || null);
      setRegistryEntry(null);
    } catch (e: any) {
      console.error("❌ Failed to load inspection detail tabs:", e);
      setError(e?.message || "Failed to load inspection details");
    } finally {
      setLoading(false);
    }
  }, [inspectionId]);

  useEffect(() => {
    loadInspection();
  }, [loadInspection]);

  const handleWorkflowStatusChange = useCallback(
    (newStatus: InspectionWorkflowStatus) => {
      setInspection((prev: any) =>
        prev ? { ...prev, workflow_status: newStatus } : prev
      );
      setTimelineRefreshKey((k) => k + 1);
    },
    []
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <AlertCircle className="h-5 w-5" />
        <span>{error}</span>
      </div>
    );
  }

  const app = inspection?.application;
  const applicant = app?.applicant;
  const workflowStatus: InspectionWorkflowStatus =
    inspection?.workflow_status || "draft";
  const inspectionStatus: string = inspection?.status || "scheduled";

  const isRegistry = isRegistryApplication(app?.application_number);
  const displayPermitNumber = isRegistry
    ? (registryEntry?.permit_number || extractPermitNumber(app?.application_number || ""))
    : (permit?.permit_number || "N/A");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Inspection {inspectionId.slice(0, 8)}…</h2>
          <p className="text-muted-foreground">
            Permit: {displayPermitNumber}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant="outline"
              className={`${getInspectionWorkflowClassName(workflowStatus)} text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap`}
            >
              {getInspectionWorkflowLabel(workflowStatus)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Date: {fmtDate(inspection?.completed_date || inspection?.scheduled_date || inspection?.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isRegistry && app?.application_number ? (
            <Link href={`/inspection/application/${encodeURIComponent(app.application_number)}`}>
              <Button variant="outline" className="gap-2">
                <Eye className="h-4 w-4" />
                Application
              </Button>
            </Link>
          ) : null}
          {permit?.permit_number ? (
            <Link href={`/permit/view/${encodeURIComponent(permit.permit_number)}`}>
              <Button variant="outline" className="gap-2">
                <Eye className="h-4 w-4" />
                Permit
              </Button>
            </Link>
          ) : null}
        </div>
      </div>

      <InspectionWorkflowActions
        inspectionId={inspectionId}
        workflowStatus={workflowStatus}
        inspectionStatus={inspectionStatus}
        inspection={inspection || {}}
        roleContext={roleContext}
        onStatusChange={handleWorkflowStatusChange}
      />

      <Tabs defaultValue="report" className="w-full">
        <TabsList className={`grid w-full ${isRegistry ? "grid-cols-3" : "grid-cols-4"}`}>
          {!isRegistry && <TabsTrigger value="application">Application</TabsTrigger>}
          <TabsTrigger value="permit">{isRegistry ? "Permit Info" : "Permit"}</TabsTrigger>
          <TabsTrigger value="report">Inspection Report</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {!isRegistry && (
          <TabsContent value="application" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Application summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Application #</p>
                    <p className="font-medium">{app?.application_number || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Applicant</p>
                    <p className="font-medium">{applicantName(applicant)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Project</p>
                    <p className="font-medium">{app?.project_title || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Location</p>
                    <p className="font-medium">{[app?.district, app?.sector, app?.cell].filter(Boolean).join(", ") || "—"}</p>
                  </div>
                </div>
                <Separator />
                {app?.application_number ? (
                  <Link href={`/inspection/application/${encodeURIComponent(app.application_number)}`}>
                    <Button variant="default">Open full application</Button>
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="permit" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Permit details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isRegistry && registryEntry ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Permit #</p>
                    <p className="font-medium">{registryEntry.permit_number}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Permit Holder</p>
                    <p className="font-medium">{registryEntry.permit_holder || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <p className="font-medium capitalize">{registryEntry.status || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Location</p>
                    <p className="font-medium">{registryEntry.location || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Issued</p>
                    <p className="font-medium">{fmtDate(registryEntry.issuance_date)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Expiry</p>
                    <p className="font-medium">{fmtDate(registryEntry.expiration_date)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Authorized Activity</p>
                    <p className="font-medium">{registryEntry.authorized_activity || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Water Source</p>
                    <p className="font-medium">{registryEntry.water_source || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Volume / Area</p>
                    <p className="font-medium">{registryEntry.volume_or_area || "—"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Method of Water Taking</p>
                    <p className="font-medium">{registryEntry.method_of_water_taking || "—"}</p>
                  </div>
                  {registryEntry.contact && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Contact</p>
                      <p className="font-medium">{registryEntry.contact}</p>
                    </div>
                  )}
                </div>
              ) : permit ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Permit #</p>
                      <p className="font-medium">{permit.permit_number}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Status</p>
                      <p className="font-medium capitalize">{permit.status}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Issued</p>
                      <p className="font-medium">{fmtDate(permit.issued_date)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Expiry</p>
                      <p className="font-medium">{fmtDate(permit.expiry_date)}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Purpose</p>
                      <p className="font-medium">{permit.purpose || "—"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Allowance</p>
                      <p className="font-medium">
                        {permit.water_allowance != null ? `${permit.water_allowance} ${permit.allowance_unit || ""}` : "—"}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <Link href={`/permit/view/${encodeURIComponent(permit.permit_number)}`}>
                    <Button variant="default">Open full permit</Button>
                  </Link>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No permit found for this application.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="report" className="mt-6">
          <InspectionDetail inspectionId={inspectionId} permitNumber={displayPermitNumber} />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <InspectionWorkflowTimeline
            inspectionId={inspectionId}
            refreshKey={timelineRefreshKey}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
