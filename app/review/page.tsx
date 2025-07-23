"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Search, Clock, CheckCircle, XCircle, AlertCircle, ArrowUpDown, MapPin, Loader2 } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus } from "@/types/database";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";

interface ReviewApplication extends Application {
  applicant_name?: string;
  sla_days_remaining?: number;
}

export default function ReviewerDashboard() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [reviewApplications, setReviewApplications] = useState<ReviewApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingReview, setStartingReview] = useState<string | null>(null);

  // Fetch applications for review
  useEffect(() => {
    const fetchReviewApplications = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch applications that are in review stages with applicant info
         const { data, error } = await supabase
           .from('applications')
           .select(`
             *,
             applicant:users!applicant_id(first_name, last_name, company_name)
           `)
           .in('status', ['submitted', 'under_review', 'pending_inspection', 'pending_final_approval', 'revision_required'])
           .order('created_at', { ascending: false });

        if (error) throw error;

        // Process applications with calculated fields
                 const processedApplications: ReviewApplication[] = data.map(app => {
           const applicant = app.applicant as any;
           const applicantName = applicant?.company_name || 
                                (applicant?.first_name && applicant?.last_name ? 
                                 `${applicant.first_name} ${applicant.last_name}` : 
                                 'Unknown Applicant');

           // Calculate SLA days remaining
           let slaRemaining: number | null = null;
           if (app.due_date) {
             const dueDate = new Date(app.due_date);
             const now = new Date();
             const diffTime = dueDate.getTime() - now.getTime();
             const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
             slaRemaining = diffDays;
           }

           return {
             ...app,
             applicant_name: applicantName,
             sla_days_remaining: slaRemaining
           };
         });

        setReviewApplications(processedApplications);
      } catch (err) {
        let errorMsg = 'Failed to fetch applications';
        if (err instanceof Error) {
          errorMsg = err.message;
          console.error('❌ Error fetching review applications:', err);
        } else if (typeof err === 'object' && err !== null) {
          // Safely access message/details if present
          const maybeMsg = (err as { message?: string; details?: string });
          errorMsg = maybeMsg.message || maybeMsg.details || JSON.stringify(err);
          console.error('❌ Error fetching review applications:', JSON.stringify(err, null, 2));
        } else {
          console.error('❌ Error fetching review applications:', err);
        }
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchReviewApplications();
  }, []);

  // Filter applications by status
  const newSubmissions = useMemo(() => 
    reviewApplications.filter(app => app.status === 'submitted'), 
    [reviewApplications]
  );
  
  const pendingInspection = useMemo(() => 
    reviewApplications.filter(app => app.status === 'pending_inspection'), 
    [reviewApplications]
  );
  
  const readyForFinalReview = useMemo(() => 
    reviewApplications.filter(app => app.status === 'under_review'), 
    [reviewApplications]
  );
  
  const needsRevision = useMemo(() => 
    reviewApplications.filter(app => app.status === 'revision_required'), 
    [reviewApplications]
  );

  const getStatusBadge = (status: ApplicationStatus) => {
    const statusConfig: Record<ApplicationStatus, { label: string; variant: "secondary" | "default" | "outline" | "destructive" }> = {
      draft: { label: "Draft", variant: "outline" },
      submitted: { label: "Submitted", variant: "secondary" },
      under_review: { label: "Under Review", variant: "default" },
      pending_inspection: { label: "Pending Inspection", variant: "outline" },
      pending_final_approval: { label: "Pending Approval", variant: "default" },
      approved: { label: "Approved", variant: "default" },
      rejected: { label: "Rejected", variant: "destructive" },
      revision_required: { label: "Needs Revision", variant: "secondary" },
      cancelled: { label: "Cancelled", variant: "outline" },
      approved_pending_permit: { label: "Pending Terms Acceptance", variant: "default" },
    };
    
    const config = statusConfig[status];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getSLAStatus = (daysRemaining: number | null) => {
    if (daysRemaining === null) return <span className="text-muted-foreground">N/A</span>;
    if (daysRemaining < 0) return <Badge variant="destructive">Overdue</Badge>;
    if (daysRemaining <= 1) return <Badge variant="outline">Due today</Badge>;
    return <span className="text-muted-foreground">In {daysRemaining} days</span>;
  };

  const handleStartReview = async (application: ReviewApplication) => {
    try {
      setStartingReview(application.id);
      
      // Update application status to under_review when starting review
      const { error } = await supabase
        .from('applications')
        .update({ status: 'under_review' })
        .eq('id', application.id);

      if (error) {
        console.error('Error updating application status:', error);
        alert('Failed to start review. Please try again.');
        setStartingReview(null);
        return;
      }

      // Update the local state to reflect the status change
      setReviewApplications(prevApps =>
        prevApps.map(app =>
          app.id === application.id 
            ? { ...app, status: 'under_review' as ApplicationStatus }
            : app
        )
      );

      // Navigate to the review page
      router.push(`/review/application/${application.application_number}`);
    } catch (err) {
      console.error('Error starting review:', err);
      alert('Failed to start review. Please try again.');
      setStartingReview(null);
    }
  };

  const filterApplications = (applications: ReviewApplication[]) => {
    return applications.filter(app => {
      const matchesSearch = app.application_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.applicant_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           app.project_title?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === "all" || 
                         app.water_source?.toLowerCase().includes(filterType.toLowerCase()) ||
                         app.application_type?.toLowerCase().includes(filterType.toLowerCase());
      
      return matchesSearch && matchesType;
    });
  };

  const ApplicationTable = ({ applications, emptyMessage }: { applications: ReviewApplication[], emptyMessage: string }) => {
    const filteredApps = filterApplications(applications);
    
    if (filteredApps.length === 0) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center space-y-2 text-center">
          <div className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
            {filteredApps.length === 0 && applications.length > 0 ? "No applications match your filters" : emptyMessage}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">
                <Button variant="ghost" className="h-auto p-0 font-medium justify-start">
                  Application ID
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" className="h-auto p-0 font-medium justify-start">
                  Applicant Name
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="w-[140px]">
                <Button variant="ghost" className="h-auto p-0 font-medium justify-start">
                  Type
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="w-[120px]">
                <Button variant="ghost" className="h-auto p-0 font-medium justify-start">
                  Date Submitted
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="w-[120px]">
                <Button variant="ghost" className="h-auto p-0 font-medium justify-start">
                  Status
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="w-[130px]">
                <Button variant="ghost" className="h-auto p-0 font-medium justify-start">
                  SLA Status
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredApps.map((app) => (
              <TableRow key={app.id}>
                <TableCell className="font-medium">{app.application_number}</TableCell>
                <TableCell>{app.applicant_name}</TableCell>
                <TableCell>{app.water_source}</TableCell>
                <TableCell>
                  {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 
                   app.created_at ? new Date(app.created_at).toLocaleDateString() : 'N/A'}
                </TableCell>
                <TableCell>{getStatusBadge(app.status)}</TableCell>
                <TableCell>{getSLAStatus(app.sla_days_remaining ?? null)}</TableCell>
                <TableCell>
                  {app.status === 'submitted' ? (
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => handleStartReview(app)}
                      disabled={startingReview === app.id}
                    >
                      {startingReview === app.id ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4 mr-1" />
                      )}
                      {startingReview === app.id ? 'Starting...' : 'Review'}
                    </Button>
                  ) : (
                    <Link href={`/review/application/${app.application_number}`}>
                      <Button size="sm" variant="ghost">
                        <Eye className="h-4 w-4 mr-1" />
                        {app.status === 'under_review' ? 'Final Review' : 'View'}
                      </Button>
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-muted-foreground">Loading applications...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">Error loading applications</p>
              <p className="text-muted-foreground text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="container mx-auto px-4 py-6"
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                Application Review Dashboard
              </h1>
              <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base leading-relaxed [&:not(:first-child)]:mt-6">
                Review and assess water permit applications for technical compliance
              </p>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  New Submissions
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{newSubmissions.length}</div>
                <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-xs">
                  Awaiting initial review
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Pending Inspection
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingInspection.length}</div>
                <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-xs">
                  With inspectors
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Under Review
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{readyForFinalReview.length}</div>
                <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-xs">
                  Being reviewed by staff
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Returned for Revision
                </CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{needsRevision.length}</div>
                <p className="text-muted-foreground text-[1.05rem] text-balance sm:text-base text-xs">
                  Pending resubmission
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Content with Tabs */}
          <Tabs defaultValue="new_submissions" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="new_submissions">New Submissions</TabsTrigger>
              <TabsTrigger value="pending_inspection">Pending Inspection</TabsTrigger>
              <TabsTrigger value="ready_for_final_review">Under Review</TabsTrigger>
              <TabsTrigger value="all_applications">All Applications</TabsTrigger>
              <TabsTrigger value="map" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Concession Map
              </TabsTrigger>
            </TabsList>

            {/* Search and Filter Controls */}
            <div className="flex items-center space-x-2">
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
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="surface">Surface Water</SelectItem>
                  <SelectItem value="groundwater">Groundwater</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="agricultural">Agricultural</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tab Contents */}
            <TabsContent value="new_submissions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">New Submissions</CardTitle>
                  <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                    Applications waiting for initial documentary review
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ApplicationTable 
                    applications={newSubmissions}
                    emptyMessage="No new submissions to review"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pending_inspection" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">Pending Inspection</CardTitle>
                  <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                    Applications currently assigned to inspectors for site assessment
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ApplicationTable 
                    applications={pendingInspection}
                    emptyMessage="No applications pending inspection"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ready_for_final_review" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">Under Review</CardTitle>
                  <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                    Applications currently being reviewed by technical staff
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ApplicationTable 
                    applications={readyForFinalReview}
                    emptyMessage="No applications under review"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="all_applications" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">All Applications</CardTitle>
                  <CardDescription className="text-muted-foreground text-[1.05rem] text-balance sm:text-base">
                    Comprehensive view of all applications assigned to you
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ApplicationTable 
                    applications={reviewApplications}
                    emptyMessage="No applications found"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="map" className="space-y-4">
              <WaterConcessionMap />
            </TabsContent>
          </Tabs>
        </div>
      </motion.div>
    </DashboardLayout>
  );
} 