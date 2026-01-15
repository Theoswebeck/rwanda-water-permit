"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  FileText,
  Loader2,
  User,
  Droplets,
  BarChart3,
  Leaf,
  Users,
  CheckSquare,
  Calendar,
  FileSignature,
  MapPin,
  CheckCircle,
  XCircle,
  Building,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import { UserProfileButton } from "@/components/dashboard/user-profile-button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import type { WaterUseReportWithRelations } from "@/hooks/useWaterUseReports";

// Helper to format date
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return "Not provided";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

// ReadOnlyField component
const ReadOnlyField = ({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number | undefined | null;
  className?: string;
}) => (
  <div className={className}>
    <Label className="text-muted-foreground text-sm">{label}</Label>
    <div className="mt-1 p-3 bg-slate-50 rounded-md border text-sm font-medium">
      {value || "Not provided"}
    </div>
  </div>
);

// ComplianceItem component
const ComplianceItem = ({
  label,
  isCompliant,
  remarks,
}: {
  label: string;
  isCompliant: boolean;
  remarks?: string;
}) => (
  <div className="flex items-start gap-3 p-3 rounded-lg border">
    <div
      className={`mt-0.5 ${isCompliant ? "text-green-600" : "text-red-500"}`}
    >
      {isCompliant ? (
        <CheckCircle className="h-5 w-5" />
      ) : (
        <XCircle className="h-5 w-5" />
      )}
    </div>
    <div className="flex-1">
      <p className="font-medium text-sm">{label}</p>
      {remarks && (
        <p className="text-xs text-muted-foreground mt-1">{remarks}</p>
      )}
    </div>
  </div>
);

function WaterUseReportViewContent() {
  const params = useParams();
  const router = useRouter();
  const { userProfile } = useAuth();
  const reportId = params.id as string;

  const [report, setReport] = useState<WaterUseReportWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("section1");

  // Tab configuration
  const tabs = [
    { id: "section1", label: "General Info", icon: User },
    { id: "section2", label: "Permitted Use", icon: Droplets },
    { id: "section3", label: "Actual Use", icon: BarChart3 },
    { id: "section4", label: "Efficiency", icon: Leaf },
    { id: "section5", label: "Environmental", icon: Leaf },
    { id: "section6", label: "Social/Gender", icon: Users },
    { id: "section7", label: "Compliance", icon: CheckSquare },
    { id: "section8", label: "Future Plans", icon: Calendar },
    { id: "section9", label: "Declaration", icon: FileSignature },
  ];

  // Fetch report data
  useEffect(() => {
    const fetchReport = async () => {
      if (!reportId) return;

      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("water_use_reports")
          .select(
            `
            *,
            permit:permits!permit_id(
              id, permit_number, purpose, water_allowance, allowance_unit,
              issued_date, expiry_date, status
            ),
            application:applications!application_id(
              id, application_number, project_title, intended_activities,
              province, district, sector, cell, village, water_body_name,
              max_daily_volume_m3, max_yearly_volume_m3, concession_area
            ),
            applicant:users!applicant_id(
              id, first_name, last_name, company_name, email
            )
          `
          )
          .eq("id", reportId)
          .single();

        if (fetchError) {
          console.error("❌ Error fetching report:", fetchError);
          setError(fetchError.message);
          return;
        }

        setReport(data);
        console.log("✅ Report loaded:", data.id);
      } catch (err) {
        console.error("❌ Error:", err);
        setError("Failed to load report");
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [reportId]);

  // Get applicant name
  const getApplicantName = (report: WaterUseReportWithRelations) => {
    if (report.applicant?.company_name) {
      return report.applicant.company_name;
    }
    if (report.applicant?.first_name || report.applicant?.last_name) {
      return `${report.applicant.first_name || ""} ${report.applicant.last_name || ""}`.trim();
    }
    return "Unknown Applicant";
  };

  // Get template badge
  const getTemplateBadge = (template: string) => {
    if (template === "concession") {
      return (
        <Badge
          variant="outline"
          className="bg-purple-50 text-purple-700 border-purple-200"
        >
          Concession
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="bg-blue-50 text-blue-700 border-blue-200"
      >
        Abstraction
      </Badge>
    );
  };

  // Get back link based on user role
  const getBackLink = () => {
    const role = userProfile?.role;
    switch (role) {
      case "admin":
        return "/admin";
      case "assessor":
        return "/assessment";
      case "reviewer":
        return "/review";
      case "verifier":
        return "/verification";
      case "inspector":
        return "/inspection";
      case "approver":
        return "/approver";
      default:
        return "/dashboard";
    }
  };

  // Extract section data with type safety
  const section3 = (report?.section3 as any) || {};
  const section3_quarterly = (report?.section3_quarterly as any) || {};
  const section4 = (report?.section4 as any) || {};
  const section5_monitoring = (report?.section5_monitoring as any) || {};
  const section5_incidents = (report?.section5_incidents as any) || {};
  const section6_employment = (report?.section6_employment as any) || {};
  const section6_ohs = (report?.section6_ohs as any) || {};
  const section7 = (report?.section7 as any) || {};
  const section8 = (report?.section8 as any) || {};
  const section9 = (report?.section9_declaration as any) || {};

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3 text-muted-foreground">Loading report...</span>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !report) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Failed to Load Report</h2>
          <p className="text-muted-foreground mb-4">
            {error || "Report not found"}
          </p>
          <Link href={getBackLink()}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={getBackLink()}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <FileText className="h-6 w-6 text-blue-600" />
                  Water Use Report - {report.reporting_year}
                </h1>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="font-mono text-sm bg-slate-100 px-2 py-1 rounded border">
                  {report.permit?.permit_number}
                </span>
                {getTemplateBadge(report.template)}
                <Badge
                  className={
                    report.status === "submitted"
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }
                >
                  {report.status}
                </Badge>
              </div>
            </div>
          </div>
          <UserProfileButton />
        </div>

        {/* Main Content with Tabs */}
        <Card>
          <CardContent className="p-6">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid grid-cols-9 w-full mb-6">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="text-xs px-2"
                  >
                    <tab.icon className="h-3 w-3 mr-1 hidden sm:inline" />
                    <span className="hidden lg:inline">{tab.label}</span>
                    <span className="lg:hidden">
                      {tab.id.replace("section", "S")}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Section 1: General Information */}
              <TabsContent value="section1">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Section 1: General Information
                      </CardTitle>
                      <CardDescription>
                        Permit holder and project details
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ReadOnlyField
                          label="Permit Holder"
                          value={getApplicantName(report)}
                        />
                        <ReadOnlyField
                          label="Permit Number"
                          value={report.permit?.permit_number}
                        />
                        <ReadOnlyField
                          label="Project Title"
                          value={report.application?.project_title}
                        />
                        <ReadOnlyField
                          label="Reporting Year"
                          value={report.reporting_year}
                        />
                        <ReadOnlyField
                          label="Water Purpose"
                          value={report.permit?.purpose?.replace(/_/g, " ")}
                        />
                        <ReadOnlyField
                          label="Water Body Name"
                          value={report.application?.water_body_name}
                        />
                      </div>

                      {/* Location */}
                      {report.application && (
                        <div className="pt-4 border-t">
                          <h4 className="font-semibold flex items-center gap-2 mb-4">
                            <MapPin className="h-4 w-4" />
                            Project Location
                          </h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <ReadOnlyField
                              label="Province"
                              value={report.application.province}
                            />
                            <ReadOnlyField
                              label="District"
                              value={report.application.district}
                            />
                            <ReadOnlyField
                              label="Sector"
                              value={report.application.sector}
                            />
                            <ReadOnlyField
                              label="Cell"
                              value={report.application.cell}
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Section 2: Permitted Water Use */}
              <TabsContent value="section2">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Droplets className="h-5 w-5" />
                        Section 2: Permitted Water Use Summary
                      </CardTitle>
                      <CardDescription>
                        Authorized values from the permit
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {report.template === "abstraction" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <ReadOnlyField
                            label="Maximum Abstraction Rate (m³/day)"
                            value={
                              report.application?.max_daily_volume_m3
                                ? `${report.application.max_daily_volume_m3.toLocaleString()} m³/day`
                                : report.permit?.water_allowance
                                  ? `${report.permit.water_allowance.toLocaleString()} ${report.permit.allowance_unit || "m³"}`
                                  : undefined
                            }
                          />
                          <ReadOnlyField
                            label="Authorized Annual Volume (m³/year)"
                            value={
                              report.application?.max_yearly_volume_m3
                                ? `${report.application.max_yearly_volume_m3.toLocaleString()} m³/year`
                                : undefined
                            }
                          />
                          {report.permit?.water_allowance && (
                            <ReadOnlyField
                              label="Permit Water Allowance"
                              value={`${report.permit.water_allowance.toLocaleString()} ${report.permit.allowance_unit || "m³"}`}
                              className="md:col-span-2"
                            />
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <ReadOnlyField
                            label="Authorized Lake Surface Area (Ha)"
                            value={
                              report.application?.concession_area
                                ? `${report.application.concession_area.toLocaleString()} Ha`
                                : report.permit?.water_allowance
                                  ? `${report.permit.water_allowance.toLocaleString()} ${report.permit.allowance_unit || "Ha"}`
                                  : undefined
                            }
                          />
                          {report.permit?.water_allowance && (
                            <ReadOnlyField
                              label="Permit Allowance"
                              value={`${report.permit.water_allowance.toLocaleString()} ${report.permit.allowance_unit || "Ha"}`}
                            />
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Section 3: Actual Water Use */}
              <TabsContent value="section3">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Section 3: Actual Water Use
                      </CardTitle>
                      <CardDescription>
                        Reported water usage for the year
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <ReadOnlyField
                          label="Operational Status"
                          value={section3.operationalStatus?.replace(/_/g, " ")}
                        />
                        <ReadOnlyField
                          label="Payment Status"
                          value={section3.paymentStatus?.replace(/_/g, " ")}
                        />
                        {report.template === "concession" && (
                          <ReadOnlyField
                            label="Total Surface Area Occupied"
                            value={section3.totalSurfaceAreaOccupied}
                          />
                        )}
                      </div>

                      {section3.waterUseConflicts && (
                        <div>
                          <Label className="text-muted-foreground text-sm">
                            Water Use Conflicts
                          </Label>
                          <div className="mt-1 p-3 bg-amber-50 rounded-md border border-amber-200 text-sm">
                            {section3.waterUseConflicts}
                          </div>
                        </div>
                      )}

                      {/* Quarterly Data Table */}
                      <div className="pt-4 border-t">
                        <h4 className="font-semibold mb-4">
                          Quarterly Water Use Data
                        </h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Quarter</TableHead>
                              <TableHead>Volume (m³)</TableHead>
                              <TableHead>Avg Daily (m³/day)</TableHead>
                              <TableHead>Measurement Method</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {["q1", "q2", "q3", "q4"].map((q, idx) => {
                              const qData = section3_quarterly[q] || {};
                              return (
                                <TableRow key={q}>
                                  <TableCell className="font-medium">
                                    Q{idx + 1}
                                  </TableCell>
                                  <TableCell>{qData.volume || "-"}</TableCell>
                                  <TableCell>{qData.avgDaily || "-"}</TableCell>
                                  <TableCell className="capitalize">
                                    {qData.method?.replace(/_/g, " ") || "-"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            <TableRow className="bg-slate-50 font-semibold">
                              <TableCell>Total</TableCell>
                              <TableCell>
                                {["q1", "q2", "q3", "q4"]
                                  .reduce(
                                    (sum, q) =>
                                      sum +
                                      (parseFloat(section3_quarterly[q]?.volume) ||
                                        0),
                                    0
                                  )
                                  .toLocaleString() || "-"}{" "}
                                m³
                              </TableCell>
                              <TableCell>-</TableCell>
                              <TableCell>-</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Section 4: Water Use Efficiency */}
              <TabsContent value="section4">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Leaf className="h-5 w-5" />
                        Section 4: Water Use Efficiency
                      </CardTitle>
                      <CardDescription>
                        Measures taken to improve water efficiency
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ReadOnlyField
                          label="Efficiency Measures Implemented"
                          value={section4.efficiencyMeasures}
                          className="md:col-span-2"
                        />
                        <ReadOnlyField
                          label="Water Recycling/Reuse Practices"
                          value={section4.recyclingPractices}
                          className="md:col-span-2"
                        />
                        <ReadOnlyField
                          label="Estimated Water Saved (m³)"
                          value={section4.estimatedWaterSaved}
                        />
                        <ReadOnlyField
                          label="Reduction Percentage (%)"
                          value={section4.reductionPercentage}
                        />
                        <ReadOnlyField
                          label="Identified Water Losses"
                          value={section4.identifiedLosses}
                          className="md:col-span-2"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Section 5: Environmental Compliance */}
              <TabsContent value="section5">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Leaf className="h-5 w-5" />
                        Section 5: Environmental Compliance
                      </CardTitle>
                      <CardDescription>
                        Water quality monitoring and environmental incidents
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Water Quality Monitoring */}
                      <div>
                        <h4 className="font-semibold mb-4">
                          Water Quality Monitoring
                        </h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Parameter</TableHead>
                              <TableHead>Min</TableHead>
                              <TableHead>Max</TableHead>
                              <TableHead>Average</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[
                              {
                                key: "waterTemperature",
                                label: "Water Temperature (°C)",
                              },
                              {
                                key: "dissolvedOxygen",
                                label: "Dissolved Oxygen (mg/L)",
                              },
                              { key: "turbidity", label: "Turbidity (NTU)" },
                              { key: "ph", label: "pH" },
                              { key: "nutrients", label: "Nutrients (N/P)" },
                              { key: "bod", label: "BOD (mg/L)" },
                            ].map((param) => {
                              const data = section5_monitoring[param.key] || {};
                              return (
                                <TableRow key={param.key}>
                                  <TableCell className="font-medium">
                                    {param.label}
                                  </TableCell>
                                  <TableCell>{data.min || "-"}</TableCell>
                                  <TableCell>{data.max || "-"}</TableCell>
                                  <TableCell>{data.avg || "-"}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Environmental Incidents */}
                      <div className="pt-4 border-t">
                        <h4 className="font-semibold mb-4">
                          Environmental Incidents
                        </h4>
                        {section5_incidents.hasIncidents ? (
                          <div className="space-y-4">
                            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                              <p className="text-red-800 font-medium">
                                Incident Reported
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                <ReadOnlyField
                                  label="Incident Date"
                                  value={formatDate(
                                    section5_incidents.incidentDate
                                  )}
                                />
                                <ReadOnlyField
                                  label="Date Reported to Authority"
                                  value={formatDate(
                                    section5_incidents.dateReportedToAuthority
                                  )}
                                />
                                <ReadOnlyField
                                  label="Description"
                                  value={section5_incidents.incidentDescription}
                                  className="md:col-span-2"
                                />
                                <ReadOnlyField
                                  label="Corrective Actions"
                                  value={section5_incidents.correctiveActions}
                                  className="md:col-span-2"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-green-50 rounded-lg border border-green-200 flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <span className="text-green-800 font-medium">
                              No environmental incidents reported
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Section 6: Social & Gender */}
              <TabsContent value="section6">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Section 6: Social & Gender Impact
                      </CardTitle>
                      <CardDescription>
                        Employment data and gender inclusivity measures
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Employment Table */}
                      <div>
                        <h4 className="font-semibold mb-4">Employment Data</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-center">Male</TableHead>
                              <TableHead className="text-center">
                                Female
                              </TableHead>
                              <TableHead className="text-center">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[
                              { key: "permanent", label: "Permanent" },
                              { key: "temporary", label: "Temporary/Seasonal" },
                              { key: "technical", label: "Technical/Skilled" },
                              { key: "unskilled", label: "Unskilled" },
                            ].map((cat) => {
                              const male =
                                parseInt(
                                  section6_employment[`${cat.key}Male`]
                                ) || 0;
                              const female =
                                parseInt(
                                  section6_employment[`${cat.key}Female`]
                                ) || 0;
                              return (
                                <TableRow key={cat.key}>
                                  <TableCell className="font-medium">
                                    {cat.label}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {male || "-"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {female || "-"}
                                  </TableCell>
                                  <TableCell className="text-center font-medium">
                                    {male + female || "-"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Gender Inclusivity */}
                      <div className="pt-4 border-t">
                        <h4 className="font-semibold mb-4">
                          Gender Inclusivity & OHS
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <ComplianceItem
                            label="Gender-Inclusive Safety Measures"
                            isCompliant={section6_ohs.genderInclusiveSafety}
                            remarks={section6_ohs.genderInclusiveSafetyRemarks}
                          />
                          <ComplianceItem
                            label="Separate Sanitation Facilities"
                            isCompliant={section6_ohs.separateSanitation}
                            remarks={section6_ohs.separateSanitationRemarks}
                          />
                          <ComplianceItem
                            label="Gender-Based Grievance Mechanism"
                            isCompliant={section6_ohs.genderGrievance}
                            remarks={section6_ohs.genderGrievanceRemarks}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Section 7: Compliance Status */}
              <TabsContent value="section7">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckSquare className="h-5 w-5" />
                        Section 7: Compliance Status
                      </CardTitle>
                      <CardDescription>
                        Self-reported compliance with permit conditions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ComplianceItem
                          label="Operating within Permit Limits"
                          isCompliant={section7.permitLimitsCompliance}
                          remarks={section7.permitLimitsRemarks}
                        />
                        <ComplianceItem
                          label="Zoning/Boundary Compliance"
                          isCompliant={section7.zoningCompliance}
                          remarks={section7.zoningRemarks}
                        />
                        <ComplianceItem
                          label="Environmental Approval Compliance"
                          isCompliant={section7.environmentalApprovalCompliance}
                          remarks={section7.environmentalApprovalRemarks}
                        />
                        <ComplianceItem
                          label="Monitoring Reports Submitted"
                          isCompliant={section7.monitoringReportsCompliance}
                          remarks={section7.monitoringReportsRemarks}
                        />
                        <ComplianceItem
                          label="Water Fees Paid"
                          isCompliant={section7.waterFeesCompliance}
                          remarks={section7.waterFeesRemarks}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Section 8: Future Plans */}
              <TabsContent value="section8">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Section 8: Future Plans
                      </CardTitle>
                      <CardDescription>
                        Planned changes and improvements for the next year
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ReadOnlyField
                          label="Planned Changes in Water Use"
                          value={section8.plannedChanges}
                          className="md:col-span-2"
                        />
                        <ReadOnlyField
                          label="Expected Change (%)"
                          value={section8.expectedChangePercentage}
                        />
                        <ReadOnlyField
                          label="Planned Infrastructure Upgrades"
                          value={section8.plannedInfrastructureUpgrades}
                        />
                        <ReadOnlyField
                          label="Environmental Improvements"
                          value={section8.environmentalImprovements}
                          className="md:col-span-2"
                        />
                        <ReadOnlyField
                          label="Gender Inclusion Actions"
                          value={section8.genderInclusionActions}
                          className="md:col-span-2"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>

              {/* Section 9: Declaration */}
              <TabsContent value="section9">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileSignature className="h-5 w-5" />
                        Section 9: Declaration
                      </CardTitle>
                      <CardDescription>
                        Certification and submission details
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ReadOnlyField
                          label="Declarant Name"
                          value={section9.declarantName}
                        />
                        <ReadOnlyField
                          label="Declaration Date"
                          value={formatDate(section9.declarationDate)}
                        />
                      </div>

                      {section9.agreed && (
                        <div className="p-4 bg-green-50 rounded-lg border border-green-200 flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <span className="text-green-800 font-medium">
                            Declaration agreed and signed
                          </span>
                        </div>
                      )}

                      {/* Timestamps */}
                      <div className="pt-4 border-t">
                        <h4 className="font-semibold mb-4">
                          Submission Details
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <ReadOnlyField
                            label="Created"
                            value={formatDate(report.created_at)}
                          />
                          <ReadOnlyField
                            label="Last Updated"
                            value={formatDate(report.updated_at)}
                          />
                          <ReadOnlyField
                            label="Submitted"
                            value={formatDate(report.submitted_at)}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function WaterUseReportViewPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        "admin",
        "assessor",
        "reviewer",
        "verifier",
        "inspector",
        "approver",
        "applicant",
      ]}
    >
      <WaterUseReportViewContent />
    </ProtectedRoute>
  );
}
