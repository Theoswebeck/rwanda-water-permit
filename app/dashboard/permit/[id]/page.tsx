"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Calendar, Download, FileCheck, Clock, AlertCircle, MapPin } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getActivityLabel } from "@/lib/assessment-report-utils";
import { parsePermitDate } from "@/lib/permit/resolve-modification-validity";
import { BackToDashboardButton } from "@/components/ui/back-button";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  individual: "Individual",
  company: "Company",
  cooperative: "Cooperative",
  organization: "Organization",
  institution: "Institution",
};

function toDisplayLabel(value: string | null | undefined): string {
  if (!value) return "N/A";
  return value
    .replaceAll("_", " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export default function PermitDetailPage() {
  const params = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [permit, setPermit] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [changeEvents, setChangeEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  
  useEffect(() => {
    const fetchPermitDetails = async () => {
      setIsLoading(true);

      try {
        const permitId = params.id as string;
        
        // Fetch permit with application data
        const { data, error } = await supabase
          .from("permits")
          .select(
            `
              id,
              permit_number,
              status,
              water_source,
              purpose,
              water_allowance,
              allowance_unit,
              issuing_authority,
              issued_date,
              expiry_date,
              permit_pdf_url,
              conditions,
              modification_count,
              last_modified_at,
              last_modified_by,
              application_id,
              application:applications!permits_application_id_fkey(
                id,
                application_number,
                project_title,
                province,
                district,
                sector,
                cell,
                village,
              terms_accepted_at,
              internal_notes,
              land_ownership_status,
                environmental_assessment,
              intended_activities,
              water_purpose,
              water_body_name,
                applicant:users!applicant_id(
                  first_name,
                  last_name,
                  company_name,
                  email,
                  phone,
                mobile_phone,
                landline_phone,
                company_phone,
                  account_type
                )
              )
            `
          )
          .eq("id", permitId)
          .single();

        if (error) throw error;

        const rawPermit = data as any;
        const app = rawPermit?.application;
        const applicant = rawPermit?.applicant ?? app?.applicant;
        const applicationId = rawPermit?.application_id;
        const modificationCount = rawPermit?.modification_count ?? 0;
        const lastModifiedAt = rawPermit?.last_modified_at ?? null;
        
        const notes = parseJsonObject(app?.internal_notes);
        const waterSourceLocationParts = [
          firstNonEmptyString([notes?.waterSourceVillage, app?.village]),
          firstNonEmptyString([notes?.waterSourceCell, app?.cell]),
          firstNonEmptyString([notes?.waterSourceSector, app?.sector]),
          firstNonEmptyString([notes?.waterSourceDistrict, app?.district]),
          firstNonEmptyString([notes?.waterSourceProvince, app?.province]),
        ].filter(Boolean) as string[];
        const waterSourceLocation = waterSourceLocationParts.length ? waterSourceLocationParts.join(", ") : "N/A";

        const applicantName = (() => {
          if (!applicant) return "N/A";
          if (applicant?.account_type === "individual") {
            return `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim() || "N/A";
          }
          return firstNonEmptyString([
            applicant?.company_name,
            `${applicant?.first_name ?? ""} ${applicant?.last_name ?? ""}`.trim(),
          ]) || "N/A";
        })();

        const applicantTypeLabel = (() => {
          const key = typeof applicant?.account_type === "string" ? applicant.account_type : "";
          if (ACCOUNT_TYPE_LABELS[key]) return ACCOUNT_TYPE_LABELS[key];
          return key ? toDisplayLabel(key) : "N/A";
        })();

        const applicantContactPhone =
          firstNonEmptyString([
            applicant?.phone,
            applicant?.mobile_phone,
            applicant?.landline_phone,
            applicant?.company_phone,
          ]) || "N/A";

        const intendedActivities = Array.isArray(app?.intended_activities)
          ? (app.intended_activities as unknown[]).map(String).filter(Boolean)
          : [];
        const transferFormData = notes?.transferFormData as Record<string, unknown> | undefined;
        const transferActivity = !intendedActivities.length && typeof transferFormData?.waterPurpose === "string"
          ? (transferFormData.waterPurpose as string).trim()
          : "";
        const primaryActivityCode =
          firstNonEmptyString([intendedActivities[0], transferActivity, app?.water_purpose, rawPermit?.purpose]) || "";
        const waterActivity = primaryActivityCode ? getActivityLabel(primaryActivityCode) : "N/A";

        const conditions = (() => {
          const c = rawPermit?.conditions;
          if (!c) return [];
          if (Array.isArray(c)) return c;
          if (typeof c === "object" && Array.isArray((c as any).conditions)) return (c as any).conditions;
          return [];
        })();
        
        // Fetch inspections for this permit using application_id
        let inspectionsData: any[] = [];
        if (applicationId) {
          console.log("📋 Fetching inspections for application_id:", applicationId);
          const { data: inspections, error: inspectionsError } = await supabase
            .from("inspections")
            .select(`
              id,
              status,
              type,
              result,
              scheduled_date,
              completed_date,
              recommendations,
              overall_score,
              created_at,
              inspector:users!inspector_id(
                first_name,
                last_name
              )
            `)
            .eq("application_id", applicationId)
            .order("created_at", { ascending: false });
            
          if (inspectionsError) {
            console.warn("⚠️ Failed to fetch inspections:", inspectionsError);
          } else {
            const inspectionRows = Array.isArray(inspections) ? inspections : [];
            console.log("✅ Found inspections:", inspectionRows.length);
            inspectionsData = inspectionRows.map((insp: any) => ({
              id: insp.id,
              date: insp.completed_date 
                ? new Date(insp.completed_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                : insp.scheduled_date 
                  ? new Date(insp.scheduled_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
                  : "Date not available",
              status: insp.result 
                ? insp.result.charAt(0).toUpperCase() + insp.result.slice(1).replace(/_/g, " ")
                : insp.status 
                  ? insp.status.charAt(0).toUpperCase() + insp.status.slice(1).replace(/_/g, " ")
                  : "Pending",
              notes: insp.recommendations || `${insp.type || "General"} inspection ${insp.status || "scheduled"}`,
              inspector: insp.inspector 
                ? `${insp.inspector.first_name || ""} ${insp.inspector.last_name || ""}`.trim() 
                : "Inspector",
              score: insp.overall_score,
            }));
          }
        }

        const issueDate = app?.terms_accepted_at || rawPermit.issued_date;

        // permits.status is never written back when a permit lapses, so an
        // expired permit still reads "active" in the row. Derive it from the
        // expiry date instead.
        //
        // Compare whole calendar days, not instants: a date-only expiry parses
        // as UTC midnight, so comparing it against `new Date()` would flip the
        // permit to Expired at 02:00 Kigali time on its own expiry date —
        // while the registry (`expiry_date::date < current_date`) still calls
        // it active for the rest of that day.
        const expiryAt = parsePermitDate(rawPermit.expiry_date);
        const now = new Date();
        const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const displayStatus =
          rawPermit.status === "revoked" || rawPermit.status === "suspended"
            ? rawPermit.status
            : expiryAt && expiryAt.getTime() < todayStart
              ? "expired"
              : rawPermit.status;

        setPermit({
          id: rawPermit.id,
          title: app?.project_title || `${toDisplayLabel(rawPermit.purpose)} Water Permit`,
          issueDate: issueDate,
          expiryDate: rawPermit.expiry_date,
          status: displayStatus,
          waterActivity,
          location: waterSourceLocation,
          permitNumber: rawPermit.permit_number,
          waterSource: firstNonEmptyString([app?.water_body_name, rawPermit.water_source]) || "N/A",
          purpose: rawPermit.purpose,
          waterAllowance:
            typeof rawPermit.water_allowance === "number"
              ? `${rawPermit.water_allowance.toFixed(2)} ${rawPermit.allowance_unit || ""}`.trim()
              : "N/A",
          issuingAuthority: rawPermit.issuing_authority,
          permitPdfPath: rawPermit.permit_pdf_url ?? null,
          isModified: modificationCount > 0,
          modifiedCount: modificationCount,
          lastModifiedAt,
          applicationId,
          applicationDetails: {
            applicantName,
            applicantType: applicantTypeLabel,
            contactEmail: applicant?.email ?? "N/A",
            contactPhone: applicantContactPhone,
            landOwnership: toDisplayLabel(app?.land_ownership_status),
            environmentalAssessment: toDisplayLabel(app?.environmental_assessment),
          },
          conditions,
          inspections: inspectionsData,
        });

        // Fetch permit change history (modifications/renewals/etc.)
        setEventsLoading(true);
        try {
          const { data: events, error: eventsError } = await supabase
            .from("permit_change_events")
            .select("id, changed_at, changed_by, event_type, changed_fields, diff, summary")
            .eq("permit_id", permitId)
            .order("changed_at", { ascending: false })
            .limit(50);

          if (eventsError) {
            console.warn("⚠️ Failed to fetch permit change events:", eventsError);
            setChangeEvents([]);
          } else {
            setChangeEvents(Array.isArray(events) ? events : []);
          }
        } finally {
          setEventsLoading(false);
        }
      } catch (e) {
        console.error("❌ Failed to load permit details:", e);
        setPermit(null);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPermitDetails();
  }, [params.id]);
  
  // Handle permit download
  const handleDownloadPermit = async () => {
    if (!permit) return;

    try {
      setIsDownloading(true);
      const verificationUrl = `https://waterpermit.rwb.rw/permit/view/${encodeURIComponent(String(permit.permitNumber ?? ""))}`;
      window.open(verificationUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("❌ Failed to open permit page:", error);
      alert("Failed to open permit page. Please try again later.");
    } finally {
      setIsDownloading(false);
    }
  };
  
  // Function to render the correct status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="outline" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Active</Badge>;
      case "expired":
        return <Badge variant="outline" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Expired</Badge>;
      case "expiring-soon":
      case "expiring_soon":
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Expires Soon
          </Badge>
        );
      case "suspended":
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-300">Suspended</Badge>;
      case "revoked":
        return <Badge variant="outline" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Revoked</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  // Function to calculate days until expiry
  const getDaysUntilExpiry = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };
  
  // Format date to be more readable
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };
  
  // Function to render status-specific details
  const renderStatusDetails = () => {
    if (!permit) return null;
    
    if (permit.status === "active") {
      return (
        <Card className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="bg-green-100 dark:bg-green-800 p-2 rounded-full">
                <FileCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-green-800 dark:text-green-400">Active Permit</h3>
                <p className="text-sm text-green-700 dark:text-green-500 mt-1">
                  This water permit is currently active and valid until {formatDate(permit.expiryDate)}.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Permit Number</p>
                    <p className="font-medium">{permit.permitNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Days Remaining</p>
                    <p className="font-medium">{getDaysUntilExpiry(permit.expiryDate)} days</p>
                  </div>
                </div>
                <Button 
                  className="mt-4" 
                  size="sm" 
                  onClick={handleDownloadPermit}
                  disabled={isDownloading}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isDownloading ? "Opening Permit Page..." : "View Permit Page"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    } else if (permit.status === "expiring-soon" || permit.status === "expiring_soon") {
      return (
        <Card className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="bg-amber-100 dark:bg-amber-800 p-2 rounded-full">
                <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-amber-800 dark:text-amber-400">Permit Expiring Soon</h3>
                <p className="text-sm text-amber-700 dark:text-amber-500 mt-1">
                  Your permit will expire in {getDaysUntilExpiry(permit.expiryDate)} days on {formatDate(permit.expiryDate)}.
                </p>
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">Renewal Information</p>
                  <p className="text-sm mt-1">{permit.renewalReminder || "Please submit a renewal application to avoid interruption of service."}</p>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button 
                    size="sm"
                    onClick={handleDownloadPermit}
                    disabled={isDownloading}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isDownloading ? "Opening Permit Page..." : "View Permit Page"}
                  </Button>
                  <Button size="sm" variant="default">
                    Apply for Renewal
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    } else if (permit.status === "expired") {
      return (
        <Card className="bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="bg-red-100 dark:bg-red-800 p-2 rounded-full">
                <Clock className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-red-800 dark:text-red-400">Expired Permit</h3>
                <p className="text-sm text-red-700 dark:text-red-500 mt-1">
                  This permit expired on {formatDate(permit.expiryDate)} ({Math.abs(getDaysUntilExpiry(permit.expiryDate))} days ago).
                </p>
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground">Renewal Status</p>
                  <p className="text-sm mt-1">{permit.renewalStatus === "Pending" ? "Renewal application is pending review." : permit.expiryNotice || "This permit needs to be renewed for continued water usage."}</p>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleDownloadPermit}
                    disabled={isDownloading}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isDownloading ? "Opening Permit Page..." : "View Permit Page"}
                  </Button>
                  <Button size="sm" variant="default">
                    {permit.renewalStatus === "Pending" ? "Check Renewal Status" : "Apply for Renewal"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
    
    return null;
  };
  
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  if (!permit) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-12">
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl">Permit Not Found</h2>
            <p className="text-muted-foreground mt-2">The permit you are looking for does not exist or has been removed.</p>
            <BackToDashboardButton variant="default" className="mt-6" />
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center mb-6">
          <BackToDashboardButton className="gap-1" />
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">{permit.title}</h1>
              {getStatusBadge(permit.status)}
              {(permit.modifiedCount ?? 0) > 0 ? (
                <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                  Modified{permit.modifiedCount && permit.modifiedCount > 1 ? ` (${permit.modifiedCount})` : ""}
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground">
              Permit Number: {permit.permitNumber} • Issued on {formatDate(permit.issueDate)}
            </p>
          </div>
          
          {renderStatusDetails()}
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Permit Details</CardTitle>
                  <CardDescription>Details of your water permit</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Water Source</dt>
                      <dd className="mt-1">{toDisplayLabel(permit.waterSource)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Water Allowance</dt>
                      <dd className="mt-1">{permit.waterAllowance}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Water Activity</dt>
                      <dd className="mt-1">{permit.waterActivity}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Location</dt>
                      <dd className="mt-1 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {permit.location}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Issuing Authority</dt>
                      <dd className="mt-1">{permit.issuingAuthority}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Application Information</CardTitle>
                  <CardDescription>Details from the original application</CardDescription>
                </CardHeader>
                <CardContent>
                  {permit.applicationDetails ? (
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">Applicant Name</dt>
                        <dd className="mt-1">{permit.applicationDetails.applicantName}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">Applicant Type</dt>
                        <dd className="mt-1">{permit.applicationDetails.applicantType}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">Contact Email</dt>
                        <dd className="mt-1">{permit.applicationDetails.contactEmail}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">Contact Phone</dt>
                        <dd className="mt-1">{permit.applicationDetails.contactPhone}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">Land Ownership</dt>
                        <dd className="mt-1">{permit.applicationDetails.landOwnership}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">Environmental Assessment</dt>
                        <dd className="mt-1">{permit.applicationDetails.environmentalAssessment}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-muted-foreground text-sm">No application details available.</p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Permit Conditions</CardTitle>
                  <CardDescription>Required conditions for permit compliance</CardDescription>
                </CardHeader>
                <CardContent>
                  {permit.conditions && permit.conditions.length > 0 ? (
                    <ul className="space-y-2 list-disc pl-5">
                      {permit.conditions.map((condition: string, index: number) => (
                        <li key={index} className="text-sm">{condition}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">No specific conditions listed for this permit.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Modification History</CardTitle>
                  <CardDescription>Previous modifications applied to this permit</CardDescription>
                </CardHeader>
                <CardContent>
                  {eventsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading history…</p>
                  ) : (changeEvents || []).filter((e) => e?.event_type === "modification").length > 0 ? (
                    <ol className="space-y-4">
                      {(changeEvents || [])
                        .filter((e) => e?.event_type === "modification")
                        .map((e: any) => (
                          <li key={e.id} className="rounded-md border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-50">
                                  Modification
                                </Badge>
                                <span className="text-sm font-medium">{e.summary || "Permit modified"}</span>
                              </div>
                              <time className="text-xs text-muted-foreground">
                                {e.changed_at ? new Date(e.changed_at).toLocaleString() : "—"}
                              </time>
                            </div>
                            {Array.isArray(e.changed_fields) && e.changed_fields.length > 0 ? (
                              <div className="mt-2 text-xs text-muted-foreground">
                                Changed: {e.changed_fields.join(", ")}
                              </div>
                            ) : null}
                          </li>
                        ))}
                    </ol>
                  ) : (
                    <p className="text-muted-foreground text-sm">No modifications have been recorded for this permit yet.</p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Inspection History</CardTitle>
                  <CardDescription>Record of inspections for this permit</CardDescription>
                </CardHeader>
                <CardContent>
                  {permit.inspections && permit.inspections.length > 0 ? (
                    <ol className="space-y-6">
                      {permit.inspections.map((inspection: any, index: number) => (
                        <li key={index} className="relative flex gap-6">
                          <div className="relative flex h-6 w-6 flex-none items-center justify-center">
                            <div className={`h-1.5 w-1.5 rounded-full ${
                              inspection.status === "Passed" 
                                ? "bg-green-500 ring-green-500" 
                                : inspection.status === "Warning" 
                                  ? "bg-amber-500 ring-amber-500" 
                                  : inspection.status === "Failed" 
                                    ? "bg-red-500 ring-red-500" 
                                    : "bg-blue-500 ring-blue-500"
                            } ring-1 ring-offset-2`}></div>
                            {index !== permit.inspections.length - 1 && (
                              <div className="absolute left-2.5 top-3 h-full w-0.5 bg-gray-200 dark:bg-gray-800"></div>
                            )}
                          </div>
                          <div className="flex-auto py-0.5 text-sm">
                            <span className={`font-medium ${
                              inspection.status === "Passed" 
                                ? "text-green-800 dark:text-green-400" 
                                : inspection.status === "Warning" 
                                  ? "text-amber-800 dark:text-amber-400" 
                                  : inspection.status === "Failed" 
                                    ? "text-red-800 dark:text-red-400" 
                                    : "text-gray-900 dark:text-white"
                            }`}>{inspection.status}</span>
                            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">{inspection.notes}</p>
                            <time className="mt-1 text-xs text-muted-foreground">{inspection.date}</time>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-muted-foreground text-sm">No inspections have been recorded for this permit.</p>
                  )}
                </CardContent>
              </Card>
            </div>
            
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Validity Period</CardTitle>
                  <CardDescription>Duration of permit validity</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Issue Date</span>
                      </div>
                      <span className="font-medium">{formatDate(permit.issueDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">Expiry Date</span>
                      </div>
                      <span className={`font-medium ${
                        permit.status === "expired" 
                          ? "text-red-600" 
                          : permit.status === "expiring-soon" || permit.status === "expiring_soon"
                            ? "text-amber-600" 
                            : ""
                      }`}>{formatDate(permit.expiryDate)}</span>
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Status</span>
                      <div>
                        {getStatusBadge(permit.status)}
                      </div>
                    </div>
                    
                    {permit.status === "active" && (
                      <div className="pt-2">
                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                          <div 
                            className={`h-2.5 rounded-full ${
                              getDaysUntilExpiry(permit.expiryDate) <= 30 
                                ? "bg-amber-600" 
                                : "bg-green-600"
                            }`} 
                            style={{ 
                              width: `${Math.min(100, Math.max(0, (getDaysUntilExpiry(permit.expiryDate) / 365) * 100))}%` 
                            }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                  <CardDescription>Manage your permit</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    className="w-full bg-black hover:bg-gray-800 text-white"
                    onClick={handleDownloadPermit}
                    disabled={isDownloading}
                  >
                    <Download className="h-4 w-4" />
                    {isDownloading ? "Opening Permit Page..." : "View Permit Page"}
                  </Button>
                  
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Need Help?</CardTitle>
                  <CardDescription>Contact our support team</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    If you have any questions about your permit, please contact our support team.
                  </p>
                  <a href={`https://waterpermit.rwb.rw/contact?permit=${permit?.permitNumber || params.id}&category=permit`} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full">Contact Support</Button>
                  </a>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 