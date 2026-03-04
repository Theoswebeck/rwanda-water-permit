"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  CheckCircle2, 
  XCircle, 
  Eye, 
  MapPin, 
  AlertTriangle, 
  Search, 
  Loader2 
} from "lucide-react";
import { getApplicationsPendingApproval } from "@/lib/supabase";
import { sortBySubmissionDateDescending } from "@/lib/application-sorting";
import { calculateDaysRemainingTo90DayDeadline, formatDate } from "@/lib/utils";

type RawPendingApprovalApplication = {
  id: string
  application_number?: string | null
  application_type: string
  water_source: string
  water_purpose?: string | null
  district: string
  province: string
  status: string
  created_at: string
  submitted_at?: string | null
  reviewed_at?: string | null
  inspected_at?: string | null
  project_value?: number | null
  project_title?: string | null
  sla_status?: string | null
  due_date?: string | null
  is_modification?: boolean | null
  internal_notes?: string | null
  applicant?: {
    account_type?: "individual" | "company" | string | null
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
  } | null
  assigned_reviewer?: { first_name?: string | null; last_name?: string | null } | null
  assigned_inspector?: { first_name?: string | null; last_name?: string | null } | null
  reviews?: Array<{ recommendation?: string | null; risk_assessment?: "low" | "medium" | "high" | null }> | null
  inspections?: Array<{ result?: string | null }> | null
}

interface FinalReviewApplication {
  id: string;
  application_number?: string;
  applicantName: string;
  applicantType: "company" | "individual";
  applicationType: string;
  waterSource: string;
  waterPurpose: string;
  location: string;
  submittedDate: string;
  reviewCompletedDate?: string;
  inspectionCompletedDate?: string;
  estimatedValue?: number;
  assignedReviewer?: string;
  assignedInspector?: string;
  reviewerRecommendation?: "approve" | "reject";
  inspectorRecommendation?: "approve" | "reject";
  riskLevel: "low" | "medium" | "high";
  daysInSystem: number;
  project_title: string;
  status: string;
  sla_status?: string;
  due_date?: string;
  deadline_90_days_remaining?: number | null;
  is_modification?: boolean;
}

export function FinalDecisions() {
  const [applications, setApplications] = useState<FinalReviewApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRisk, setFilterRisk] = useState("all");
  const [selectedApplication, setSelectedApplication] = useState<FinalReviewApplication | null>(null);
  const [isDecisionDialogOpen, setIsDecisionDialogOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approve" | "reject" | "return_to_assessment">("approve");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionReasonPreset, setDecisionReasonPreset] = useState<string>("");
  const [conditions, setConditions] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const getWaterSourceLocation = (app: RawPendingApprovalApplication) => {
    if (typeof app.internal_notes === "string" && app.internal_notes.trim().length > 0) {
      try {
        const parsed = JSON.parse(app.internal_notes) as Record<string, unknown>;
        const sourceParts = [
          parsed.waterSourceVillage,
          parsed.waterSourceCell,
          parsed.waterSourceSector,
          parsed.waterSourceDistrict,
          parsed.waterSourceProvince,
        ]
          .map((part) => (typeof part === "string" ? part.trim() : ""))
          .filter((part) => part.length > 0);
        if (sourceParts.length > 0) {
          return sourceParts.join(", ");
        }
      } catch {
        // Ignore invalid JSON and fallback to top-level fields.
      }
    }

    const fallbackParts = [app.district, app.province]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter((part) => part.length > 0);
    return fallbackParts.length > 0 ? fallbackParts.join(", ") : "N/A";
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const data = (await getApplicationsPendingApproval()) as RawPendingApprovalApplication[];
      
      const formattedApplications: FinalReviewApplication[] = data.map((app) => {
        const applicantName = app.applicant?.account_type === 'individual' 
          ? `${app.applicant.first_name} ${app.applicant.last_name}`
          : app.applicant?.company_name || 'Unknown';
        
        const daysInSystem = Math.floor(
          (new Date().getTime() - new Date(app.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        // 90-day countdown starts from when completeness was confirmed (not submission)
        const deadline90Remaining = calculateDaysRemainingTo90DayDeadline({
          completenessConfirmedAt: app.completeness_confirmed_at,
        });

        return {
          id: app.id,
          application_number: app.application_number || undefined,
          applicantName,
          applicantType: app.applicant?.account_type === 'individual' ? 'individual' : 'company',
          applicationType: app.application_type,
          waterSource: app.water_source,
          waterPurpose: app.water_purpose || '',
          location: getWaterSourceLocation(app),
          submittedDate: app.submitted_at || app.created_at,
          reviewCompletedDate: app.reviewed_at || undefined,
          inspectionCompletedDate: app.inspected_at || undefined,
          estimatedValue: app.project_value || undefined,
          assignedReviewer: app.assigned_reviewer ? `${app.assigned_reviewer.first_name} ${app.assigned_reviewer.last_name}` : undefined,
          assignedInspector: app.assigned_inspector ? `${app.assigned_inspector.first_name} ${app.assigned_inspector.last_name}` : undefined,
          reviewerRecommendation: app.reviews?.[0]?.recommendation === 'approve' ? 'approve' : 'reject',
          inspectorRecommendation: app.inspections?.[0]?.result === 'passed' ? 'approve' : 'reject',
          riskLevel: app.reviews?.[0]?.risk_assessment || 'medium',
          daysInSystem,
          project_title: app.project_title || '',
          status: app.status,
          sla_status: app.sla_status || undefined,
          due_date: app.due_date || undefined,
          deadline_90_days_remaining: deadline90Remaining,
          is_modification: app.is_modification || false,
        };
      });

      setApplications(formattedApplications);
    } catch (err) {
      console.error('❌ Failed to fetch applications pending approval:', err);
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadge = (risk: FinalReviewApplication["riskLevel"]) => {
    const riskColors = {
      low: "bg-green-100 text-green-700 border-green-200",
      medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
      high: "bg-red-100 text-red-700 border-red-200"
    };
    return <Badge variant="outline" className={riskColors[risk]}>{risk.toUpperCase()}</Badge>;
  };

  const getWaterPurposeLabel = (purpose: string) => {
    const labels: Record<string, string> = {
      'domestic': 'Domestic Use',
      'industrial': 'Industrial Use',
      'agricultural': 'Agricultural Use',
      'irrigation': 'Irrigation',
      'livestock': 'Livestock',
      'aquaculture': 'Aquaculture',
      'recreation': 'Recreation',
      'electricity_generation': 'Electricity Generation',
      'mining': 'Mining',
      'municipal_supply': 'Municipal Supply',
      'other': 'Other'
    };
    return labels[purpose] || purpose || 'Unknown';
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700 border-gray-200",
      submitted: "bg-blue-100 text-blue-700 border-blue-200",
      under_review: "bg-yellow-100 text-yellow-700 border-yellow-200",
      pending_inspection: "bg-orange-100 text-orange-700 border-orange-200",
      pending_final_approval: "bg-purple-100 text-purple-700 border-purple-200",
      approved: "bg-green-100 text-green-700 border-green-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
      revision_required: "bg-amber-100 text-amber-700 border-amber-200",
      cancelled: "bg-gray-100 text-gray-700 border-gray-200"
    };
    
    const color = statusColors[status] || "bg-gray-100 text-gray-700 border-gray-200";
    
    // Custom display text for specific statuses
    const displayText = status === 'pending_final_approval' 
      ? 'Pending Approval' 
      : status.replace('_', ' ').toUpperCase();
    
    return <Badge variant="outline" className={color}>{displayText}</Badge>;
  };

  const getSLABadge = (application: FinalReviewApplication) => {
    if (!application.due_date) return null;
    
    const dueDate = new Date(application.due_date);
    const now = new Date();
    const isOverdue = now > dueDate;
    
    if (isOverdue) {
      return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Overdue</Badge>;
    }
    
    const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysRemaining <= 2) {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">Due Soon</Badge>;
    }
    
    return null;
  };

  const getRecommendationBadge = (recommendation: "approve" | "reject") => {
    return recommendation === "approve" ? (
      <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Approve
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
        <XCircle className="h-3 w-3 mr-1" />
        Reject
      </Badge>
    );
  };

  // Get application type badge (New, Modification, Transfer, Renewal)
  const getAppTypeBadge = (application: FinalReviewApplication) => {
    const isModification = application.applicationType === 'modification' || application.is_modification === true;
    const isTransfer = application.applicationType === 'transfer';
    const isRenewal = application.applicationType === 'renewal' || application.is_renewal === true;
    
    if (isRenewal) {
      return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">Renewal</Badge>;
    }
    if (isModification) {
      return <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">Mod</Badge>;
    }
    if (isTransfer) {
      return <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0">Transfer</Badge>;
    }
    return <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">New</Badge>;
  };

  const handleFinalDecision = async (applicationId: string, decision: "approve" | "reject" | "return_to_assessment") => {
    try {
      setSubmitting(true);
      setError(null);
      console.log(`🔄 Processing ${decision} decision for application ${applicationId}`);

      const resp = await fetch('/api/approver/final-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          decision,
          reason: decisionReason,
          conditions,
        }),
      });

      const result = await resp.json();
      if (!resp.ok || !result?.success) {
        throw new Error(result?.message || 'Failed to process decision');
      }
      
      // Show success message
      const actionText = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'returned to verification';
      const notificationSuffix = decision === 'return_to_assessment' ? '' : ' SMS and email notifications sent.';
      setSuccessMessage(`Application ${actionText} successfully!${notificationSuffix}`);
      
      // Refresh applications list
      await fetchApplications();
      
      // Close dialog and reset form
      setIsDecisionDialogOpen(false);
      setDecisionReason("");
      setConditions("");
      setSelectedApplication(null);
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      console.error('❌ Failed to process decision:', err);
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to process ${decision}: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openDecisionDialog = (application: FinalReviewApplication, decision: "approve" | "reject" | "return_to_assessment") => {
    setSelectedApplication(application);
    setDecisionType(decision);
    setIsDecisionDialogOpen(true);
  };

  const filteredApplications = applications.filter(app => {
    const matchesSearch = app.applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.application_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         app.project_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = filterRisk === "all" || app.riskLevel === filterRisk;
    return matchesSearch && matchesRisk;
  });
  const sortedApplications = sortBySubmissionDateDescending(filteredApplications, (app) => app.submittedDate);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="scroll-m-20 text-xl font-semibold tracking-tight mb-2">Error Loading Applications</h3>
        <p className="text-muted-foreground">{error}</p>
        <Button onClick={fetchApplications} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {successMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {successMessage}
        </div>
      )}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Pending Approval Applications
          </h2>
          <p className="text-muted-foreground mt-2">
            Applications with pending_final_approval status awaiting your approval decision
          </p>
        </div>
      </div>


      {/* Applications Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Applications Pending Approval</CardTitle>
          <CardDescription>
            Applications with pending_final_approval status ready for your approval decision
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search applications..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={filterRisk} onValueChange={setFilterRisk}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Risk Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="high">High Risk</SelectItem>
                <SelectItem value="medium">Medium Risk</SelectItem>
                <SelectItem value="low">Low Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Location of Water Source</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApplications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {formatDate(application.submittedDate)}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70">
                        {new Date(application.submittedDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{application.application_number || application.id}</div>
                        <div className="text-sm text-muted-foreground">
                          {getWaterPurposeLabel(application.waterPurpose)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{application.applicantName}</div>
                    </TableCell>
                    <TableCell>
                      {getAppTypeBadge(application)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(application.status)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="text-sm text-muted-foreground flex items-center">
                        <MapPin className="h-3 w-3 mr-1" />
                        {application.location}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Link href={`/approver/application/${application.application_number}`}>
                          <Button
                            size="sm"
                            variant="outline"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
                        
                        {/* Only show action dropdown for applications ready for final approval */}
                        {application.status === 'pending_final_approval' && (
                          <Select
                            onValueChange={(value) => {
                              if (value === "approve" || value === "reject" || value === "return_to_assessment") {
                                openDecisionDialog(application, value as any);
                              }
                            }}
                          >
                            <SelectTrigger className="w-[130px] h-8">
                              <SelectValue placeholder="Action" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="approve">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  Approve
                                </div>
                              </SelectItem>
                              <SelectItem value="reject">
                                <div className="flex items-center gap-2">
                                  <XCircle className="h-4 w-4 text-red-600" />
                                  Reject
                                </div>
                              </SelectItem>
                              <SelectItem value="return_to_assessment">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                                  Return to Verification
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Decision Dialog */}
      <Dialog open={isDecisionDialogOpen} onOpenChange={setIsDecisionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decisionType === "approve" 
                ? "Approve Application" 
                : decisionType === "reject" 
                  ? "Reject Application" 
                  : "Return Application to Verification"}
            </DialogTitle>
            <DialogDescription>
              {decisionType === "approve" 
                ? "You are about to approve this water permit application. This decision is final."
                : decisionType === "reject"
                  ? "You are about to reject this water permit application. Please provide a reason."
                  : "You are about to return this application to the verification stage. Please provide specific instructions for the verifier."
              }
            </DialogDescription>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/50 p-4 rounded-lg">
                <div>
                  <span className="font-medium text-muted-foreground">Application ID:</span>
                  <p className="mt-1 font-medium">{selectedApplication.application_number || selectedApplication.id}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Applicant:</span>
                  <p className="mt-1 font-medium">{selectedApplication.applicantName}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Type:</span>
                  <p className="mt-1 font-medium">{selectedApplication.applicationType}</p>
                </div>
                <div>
                  <span className="font-medium text-muted-foreground">Location of Water Source:</span>
                  <p className="mt-1 font-medium">{selectedApplication.location}</p>
                </div>
              </div>
              
              {decisionType === "approve" ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Approval Conditions (Optional)</label>
                  <Textarea
                    placeholder="Add any conditions or requirements for the approval (one per line)..."
                    value={conditions}
                    onChange={(e) => setConditions(e.target.value)}
                    rows={3}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {decisionType === "reject" ? "Rejection Reason (Required)" : "Verification Instructions (Required)"}
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Select value={decisionReasonPreset} onValueChange={(v)=>{ setDecisionReasonPreset(v); setDecisionReason(v === 'other' ? '' : v); }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="incomplete_documentation">Incomplete documentation</SelectItem>
                        <SelectItem value="non_compliance_requirements">Non-compliance with requirements</SelectItem>
                        <SelectItem value="inconsistent_information">Inconsistent information provided</SelectItem>
                        <SelectItem value="requires_further_review">Requires further technical assessment</SelectItem>
                        <SelectItem value="other">Other...</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder={decisionReasonPreset === 'other' || decisionReasonPreset === '' ? "Type reason/instructions..." : "Add details (optional)"}
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                  
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 pt-6">
            <Button variant="outline" onClick={() => setIsDecisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedApplication && handleFinalDecision(selectedApplication.id, decisionType)}
              disabled={submitting || ((decisionType === "reject" || decisionType === "return_to_assessment") && !decisionReason.trim())}
              variant={
                decisionType === "approve" 
                  ? "default" 
                  : decisionType === "reject" 
                    ? "destructive" 
                    : "outline"
              }
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                decisionType === "approve" 
                  ? "Approve Application" 
                  : decisionType === "reject" 
                    ? "Reject Application"
                    : "Return to Assessment"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 
