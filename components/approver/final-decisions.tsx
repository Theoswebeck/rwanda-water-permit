"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  CheckCircle2, 
  XCircle, 
  Eye, 
  Calendar,
  MapPin,
  AlertTriangle,
  Search,
  Clock,
  TrendingUp,
  Loader2,
  User
} from "lucide-react";
import { getApplicationsPendingApproval, approveApplication, rejectApplication, supabase } from "@/lib/supabase";
import type { Application } from "@/types/database";

interface FinalReviewApplication {
  id: string;
  application_number?: string;
  applicantName: string;
  applicantType: "company" | "individual";
  applicationType: string;
  waterSource: string;
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
}

export function FinalDecisions() {
  const [applications, setApplications] = useState<FinalReviewApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRisk, setFilterRisk] = useState("all");
  const [selectedApplication, setSelectedApplication] = useState<FinalReviewApplication | null>(null);
  const [isDecisionDialogOpen, setIsDecisionDialogOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approve" | "reject" | "return_to_review">("approve");
  const [decisionReason, setDecisionReason] = useState("");
  const [conditions, setConditions] = useState("");

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const data = await getApplicationsPendingApproval();
      
      const formattedApplications: FinalReviewApplication[] = data.map((app: any) => {
        const applicantName = app.applicant?.account_type === 'individual' 
          ? `${app.applicant.first_name} ${app.applicant.last_name}`
          : app.applicant?.company_name || 'Unknown';
        
        const daysInSystem = Math.floor(
          (new Date().getTime() - new Date(app.created_at).getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          id: app.id,
          application_number: app.application_number,
          applicantName,
          applicantType: app.applicant?.account_type === 'individual' ? 'individual' : 'company',
          applicationType: app.application_type,
          waterSource: app.water_source,
          location: `${app.district}, ${app.province}`,
          submittedDate: app.created_at,
          reviewCompletedDate: app.reviewed_at,
          inspectionCompletedDate: app.inspected_at,
          estimatedValue: app.project_value,
          assignedReviewer: app.assigned_reviewer ? `${app.assigned_reviewer.first_name} ${app.assigned_reviewer.last_name}` : undefined,
          assignedInspector: app.assigned_inspector ? `${app.assigned_inspector.first_name} ${app.assigned_inspector.last_name}` : undefined,
          reviewerRecommendation: app.reviews?.[0]?.recommendation === 'approve' ? 'approve' : 'reject',
          inspectorRecommendation: app.inspections?.[0]?.result === 'passed' ? 'approve' : 'reject',
          riskLevel: app.reviews?.[0]?.risk_assessment || 'medium',
          daysInSystem,
          project_title: app.project_title,
          status: app.status,
          sla_status: app.sla_status,
          due_date: app.due_date
        };
      });

      setApplications(formattedApplications);
    } catch (err) {
      console.error('Failed to fetch applications pending approval:', err);
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

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700 border-gray-200",
      submitted: "bg-blue-100 text-blue-700 border-blue-200",
      under_review: "bg-yellow-100 text-yellow-700 border-yellow-200",
      pending_inspection: "bg-orange-100 text-orange-700 border-orange-200",
      approved: "bg-green-100 text-green-700 border-green-200",
      rejected: "bg-red-100 text-red-700 border-red-200",
      revision_required: "bg-amber-100 text-amber-700 border-amber-200",
      cancelled: "bg-gray-100 text-gray-700 border-gray-200"
    };
    
    const color = statusColors[status] || "bg-gray-100 text-gray-700 border-gray-200";
    const displayText = status.replace('_', ' ').toUpperCase();
    
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

  const handleFinalDecision = async (applicationId: string, decision: "approve" | "reject" | "return_to_review") => {
    try {
      // Fetch a real approver UUID from the users table
      const { data: approverData, error: approverError } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'approver')
        .limit(1)
        .single();
      if (approverError || !approverData) throw approverError || new Error('No approver found');
      const approverId = approverData.id;
      
      if (decision === 'approve') {
        const conditionsObj = conditions ? { conditions: conditions.split('\n') } : undefined;
        await approveApplication(applicationId, approverId, conditionsObj);
      } else if (decision === 'reject') {
        await rejectApplication(applicationId, approverId, decisionReason);
      } else if (decision === 'return_to_review') {
        // Return application to under_review status
        const { error } = await supabase
          .from('applications')
          .update({ 
            status: 'under_review',
            revision_notes: decisionReason
          })
          .eq('id', applicationId);
        
        if (error) throw error;
      }
      
      // Refresh applications list
      await fetchApplications();
      
      // Close dialog and reset form
      setIsDecisionDialogOpen(false);
      setDecisionReason("");
      setConditions("");
      setSelectedApplication(null);
    } catch (err) {
      console.error('Failed to process decision:', err);
      setError('Failed to process decision');
    }
  };

  const openDecisionDialog = (application: FinalReviewApplication, decision: "approve" | "reject" | "return_to_review") => {
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
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Final Approval Decisions
          </h2>
          <p className="text-muted-foreground mt-2">
            Applications that have completed review and inspection phases, ready for your final approval decision
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Decisions</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{applications.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting final approval
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {applications.filter(app => app.riskLevel === "high").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Requires careful review
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Processing</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {applications.length > 0 ? Math.round(applications.reduce((sum, app) => sum + app.daysInSystem, 0) / applications.length) : 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Days in system
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Applications Table */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Applications Ready for Final Decision</CardTitle>
          <CardDescription>
            Review completed applications and make final approval decisions
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
                  <TableHead>Application</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Type & Source</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{application.application_number || application.id}</div>
                        <div className="text-sm text-muted-foreground">{application.project_title}</div>
                        <div className="text-xs text-muted-foreground flex items-center mt-1">
                          <Calendar className="h-3 w-3 mr-1" />
                          {new Date(application.submittedDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{application.applicantName}</div>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          {application.applicantType === 'individual' ? 'Individual' : 'Company'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm">{application.applicationType}</div>
                        <div className="text-xs text-muted-foreground">{application.waterSource}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground flex items-center">
                        <MapPin className="h-3 w-3 mr-1" />
                        {application.location}
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(application.status)}
                    </TableCell>
                    <TableCell>
                      {getSLABadge(application)}
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
                              if (value === "return_to_review") {
                                openDecisionDialog(application, value as any);
                              } else {
                                openDecisionDialog(application, value as "approve" | "reject");
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
                              <SelectItem value="return_to_review">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                                  Return to Review
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
                  : "Return Application to Review"}
            </DialogTitle>
            <DialogDescription>
              {decisionType === "approve" 
                ? "You are about to approve this water permit application. This decision is final."
                : decisionType === "reject"
                  ? "You are about to reject this water permit application. Please provide a reason."
                  : "You are about to return this application to the review stage. Please provide specific instructions for the reviewers."
              }
            </DialogDescription>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm bg-muted/50 p-4 rounded-lg">
                <div>
                  <span className="font-medium text-muted-foreground">Application ID:</span>
                  <p className="mt-1 font-medium">{selectedApplication.id}</p>
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
                  <span className="font-medium text-muted-foreground">Location:</span>
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
                    {decisionType === "reject" ? "Rejection Reason (Required)" : "Review Instructions (Required)"}
                  </label>
                  <Textarea
                    placeholder={
                      decisionType === "reject" 
                        ? "Explain why this application is being rejected..."
                        : "Provide specific instructions for what needs to be reviewed or corrected..."
                    }
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={3}
                    required
                  />
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
              disabled={(decisionType === "reject" || decisionType === "return_to_review") && !decisionReason.trim()}
              variant={
                decisionType === "approve" 
                  ? "default" 
                  : decisionType === "reject" 
                    ? "destructive" 
                    : "outline"
              }
            >
              {decisionType === "approve" 
                ? "Approve Application" 
                : decisionType === "reject" 
                  ? "Reject Application"
                  : "Return to Review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 