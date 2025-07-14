"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
  User,
  FileText,
  AlertTriangle,
  Search,
  Scale,
  Clock,
  TrendingUp,
  Timer,
  Loader2
} from "lucide-react";
import { getApplicationsPendingApproval, approveApplication, rejectApplication } from "@/lib/supabase";
import type { Application, User as UserType } from "@/types/database";

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
}

export function FinalDecisions() {
  const [applications, setApplications] = useState<FinalReviewApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRisk, setFilterRisk] = useState("all");
  const [selectedApplication, setSelectedApplication] = useState<FinalReviewApplication | null>(null);
  const [isDecisionDialogOpen, setIsDecisionDialogOpen] = useState(false);
  const [decisionType, setDecisionType] = useState<"approve" | "reject">("approve");
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
          project_title: app.project_title
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

  const handleFinalDecision = async (applicationId: string, decision: "approve" | "reject") => {
    try {
      const mockApproverId = 'mock-approver-id'; // In real app, get from auth context
      
      if (decision === 'approve') {
        const conditionsObj = conditions ? { conditions: conditions.split('\n') } : undefined;
        await approveApplication(applicationId, mockApproverId, conditionsObj);
      } else {
        await rejectApplication(applicationId, mockApproverId, decisionReason);
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

  const openDecisionDialog = (application: FinalReviewApplication, decision: "approve" | "reject") => {
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
    <div className="space-y-6">
      <div className="flex flex-col space-y-2 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl">
            Final Approval Decisions
          </h2>
          <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
            Applications ready for your final decision after review and inspection
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Decisions</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{applications.length}</div>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-xs text-muted-foreground">
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
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-xs text-muted-foreground">
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
              {Math.round(applications.reduce((sum, app) => sum + app.daysInSystem, 0) / applications.length)}
            </div>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-xs text-muted-foreground">
              Days in system
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Applications Ready for Final Decision</CardTitle>
          <CardDescription>
            Review completed applications and make final approval decisions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-6">
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

          {/* Applications Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Type & Source</TableHead>
                  <TableHead className="font-semibold">Recommendations</TableHead>
                  <TableHead>Processing Time</TableHead>
                  <TableHead className="text-right">Final Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApplications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{application.application_number || application.id}</div>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          {application.submittedDate}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{application.applicantName}</div>
                        <div className="text-sm text-muted-foreground flex items-center">
                          <MapPin className="h-3 w-3 mr-1" />
                          {application.location}
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
                      <motion.div 
                        className="space-y-3"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground tracking-wide">Reviewer</span>
                          {getRecommendationBadge(application.reviewerRecommendation || "reject")}
                        </div>
                        <div className="h-px bg-border/50 mx-2" />
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-muted-foreground tracking-wide">Inspector</span>
                          {getRecommendationBadge(application.inspectorRecommendation || "reject")}
                        </div>
                      </motion.div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{application.daysInSystem} days</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedApplication(application)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Review
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openDecisionDialog(application, "approve")}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => openDecisionDialog(application, "reject")}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
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
              {decisionType === "approve" ? "Approve Application" : "Reject Application"}
            </DialogTitle>
            <DialogDescription>
              {decisionType === "approve" 
                ? "You are about to approve this water permit application. This decision is final."
                : "You are about to reject this water permit application. Please provide a reason."
              }
            </DialogDescription>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Application ID:</span>
                  <p className="leading-relaxed [&:not(:first-child)]:mt-6">{selectedApplication.id}</p>
                </div>
                <div>
                  <span className="font-medium">Applicant:</span>
                  <p className="leading-relaxed [&:not(:first-child)]:mt-6">{selectedApplication.applicantName}</p>
                </div>
                <div>
                  <span className="font-medium">Type:</span>
                  <p className="leading-relaxed [&:not(:first-child)]:mt-6">{selectedApplication.applicationType}</p>
                </div>
                <div>
                  <span className="font-medium">Location:</span>
                  <p className="leading-relaxed [&:not(:first-child)]:mt-6">{selectedApplication.location}</p>
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
                  <label className="text-sm font-medium">Rejection Reason (Required)</label>
                  <Textarea
                    placeholder="Explain why this application is being rejected..."
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    rows={3}
                    required
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDecisionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedApplication && handleFinalDecision(selectedApplication.id, decisionType)}
              disabled={decisionType === "reject" && !decisionReason.trim()}
              variant={decisionType === "approve" ? "default" : "destructive"}
            >
              {decisionType === "approve" ? "Approve Application" : "Reject Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 