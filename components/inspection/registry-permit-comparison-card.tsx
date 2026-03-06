"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Application, Document } from "@/types/database";
import { getPermitReferenceFromApplication } from "@/lib/permit/permit-reference";
import { AlertTriangle, CheckCircle2, FileSearch, ShieldCheck } from "lucide-react";

interface RegistryPermitComparisonCardProps {
  application: Application & { documents?: Document[]; applicant?: any };
  onAcknowledge?: () => void;
  acknowledged?: boolean;
}

type CompareStatus = "match" | "partial" | "mismatch" | "not_available";

function normalize(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function detectStatus(left: string, right: string): CompareStatus {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return "not_available";
  if (a === b) return "match";
  if (a.includes(b) || b.includes(a)) return "partial";
  return "mismatch";
}

function StatusBadge({ status }: { status: CompareStatus }) {
  if (status === "match") return <Badge className="bg-green-100 text-green-800">Match</Badge>;
  if (status === "partial") return <Badge className="bg-amber-100 text-amber-800">Partial</Badge>;
  if (status === "mismatch") return <Badge className="bg-red-100 text-red-800">Mismatch</Badge>;
  return <Badge variant="outline">N/A</Badge>;
}

export function RegistryPermitComparisonCard({ application, onAcknowledge, acknowledged }: RegistryPermitComparisonCardProps) {
  const permitReference = getPermitReferenceFromApplication(application);
  if (!permitReference || permitReference.source !== "registry_unlinked") return null;

  const registry = permitReference.registrySnapshot;
  const applicant = (application as any)?.applicant;
  const submittedName = applicant?.company_name || `${applicant?.first_name || ""} ${applicant?.last_name || ""}`.trim();
  const submittedLocation = [application.village, application.cell, application.sector, application.district, application.province]
    .filter((v) => Boolean(v))
    .join(", ");
  const submittedActivity = Array.isArray((application as any)?.intended_activities) && (application as any).intended_activities.length > 0
    ? (application as any).intended_activities.join(", ")
    : application.water_purpose || "";

  const identityDocs = (application.documents || []).filter(
    (doc) => doc.type === "identification_doc" || doc.type === "registration_certificate"
  );

  const identityStatus = detectStatus(
    `${permitReference.manualHolderName || ""} ${registry?.permit_holder || ""}`,
    submittedName
  );
  const locationStatus = detectStatus(
    `${permitReference.manualLocation || ""} ${registry?.registry_location || ""}`,
    submittedLocation
  );
  const activityStatus = detectStatus(
    `${permitReference.manualActivity || ""} ${registry?.purpose || ""}`,
    submittedActivity
  );

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-indigo-900">
          <FileSearch className="h-5 w-5" />
          Registry vs Submitted Comparison
        </CardTitle>
        <CardDescription>
          Manual old-permit flow detected for <strong>{permitReference.inputPermitNumber}</strong>. Compare applicant input with registry baseline.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!registry && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-800">
              Registry record was not found during applicant lookup. Continue with manual verification evidence.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border bg-white p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Registry baseline</p>
            <p><strong>Holder:</strong> {registry?.permit_holder || "N/A"}</p>
            <p><strong>Location:</strong> {registry?.registry_location || "N/A"}</p>
            <p><strong>Activity:</strong> {registry?.purpose || "N/A"}</p>
          </div>
          <div className="rounded-md border bg-white p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Submitted application</p>
            <p><strong>Applicant:</strong> {submittedName || "N/A"}</p>
            <p><strong>Location:</strong> {submittedLocation || "N/A"}</p>
            <p><strong>Activity:</strong> {submittedActivity || "N/A"}</p>
            <p><strong>Identity docs:</strong> {identityDocs.length > 0 ? `${identityDocs.length} uploaded` : "None uploaded"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2"><StatusBadge status={identityStatus} /><span className="text-sm">Identity</span></div>
          <div className="flex items-center gap-2"><StatusBadge status={locationStatus} /><span className="text-sm">Location</span></div>
          <div className="flex items-center gap-2"><StatusBadge status={activityStatus} /><span className="text-sm">Activity</span></div>
        </div>

        {identityDocs.length > 0 && (
          <div className="text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Identity verification document uploaded by applicant.
          </div>
        )}

        {onAcknowledge && !acknowledged && (
          <div className="border-t pt-4 mt-2">
            <Alert className="border-amber-200 bg-amber-50 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <AlertDescription className="text-amber-800">
                This permit was manually entered by the applicant and is not linked in the system.
                You must verify the permit details against registry records before proceeding with the assessment report.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              onClick={onAcknowledge}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              I have verified this permit against registry records
            </Button>
          </div>
        )}

        {onAcknowledge && acknowledged && (
          <div className="border-t pt-4 mt-2">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-md p-3">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-medium">Permit verification acknowledged by assessor.</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RegistryPermitComparisonCard;
