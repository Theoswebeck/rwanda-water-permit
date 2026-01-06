"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
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
import { Eye, Search, Clock, CheckCircle, XCircle, AlertCircle, MapPin, Loader2, Droplets, FileCheck } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application } from "@/types/database";
import { WaterConcessionMap } from "@/components/shared/water-concession-map";

interface ReviewApplication extends Application {
  applicant_name?: string;
  sla_days_remaining?: number;
}

interface ReviewStatsData {
  newSubmissions: number;
  pendingAssessment: number;
  underReview: number;
  returnedForRevision: number;
}

export default function ReviewerDashboard() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [reviewApplications, setReviewApplications] = useState<ReviewApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingReview, setStartingReview] = useState<string | null>(null);
  const [stats, setStats] = useState<ReviewStatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch applications for review
  useEffect(() => {
    const fetchReviewApplications = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all applications (powers the "All Applications" tab).
        // We filter locally for the action queue (pending_review).
        const { data, error } = await supabase
           .from('applications')
           .select(`
             *,
             applicant:users!applicant_id(first_name, last_name, company_name)
           `)
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

  // Fetch review statistics from database
  useEffect(() => {
    const fetchReviewStats = async () => {
      try {
        setStatsLoading(true);
        
        // Query for applications pending review
        const { count: newSubmissionsCount, error: newError } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_review');
        
        if (newError) throw newError;

        // Query for applications pending assessment
        const { count: pendingAssessmentCount, error: pendingError } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending_assessment');
        
        if (pendingError) throw pendingError;

        // Query for applications under review
        const { count: underReviewCount, error: reviewError } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'under_review');
        
        if (reviewError) throw reviewError;

        // Query for applications returned for revision
        const { count: revisionCount, error: revisionError } = await supabase
          .from('applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'revision_required');
        
        if (revisionError) throw revisionError;

        setStats({
          newSubmissions: newSubmissionsCount || 0,
          pendingAssessment: pendingAssessmentCount || 0,
          underReview: underReviewCount || 0,
          returnedForRevision: revisionCount || 0
        });
      } catch (err) {
        console.error('Error fetching review stats:', err);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchReviewStats();
  }, []);

  const handleStartReview = async (application: ReviewApplication) => {
    try {
      setStartingReview(application.id);
      
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
    
    const getApplicantName = (app: ReviewApplication) => {
      return app.applicant_name || 'Unknown Applicant';
    };

    const getLocationString = (app: ReviewApplication) => {
      return `${app.district || 'N/A'}, ${app.sector || 'N/A'}`;
    };

    const getWaterSourceLabel = (waterSource: string) => {
      const labels: Record<string, string> = {
        'surface_water': 'Surface Water',
        'groundwater': 'Groundwater',
        'borehole': 'Borehole',
        'river': 'River',
        'lake': 'Lake',
        'spring': 'Spring',
        'swamp': 'Swamp',
        'other': 'Other'
      };
      return labels[waterSource] || waterSource;
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
      return labels[purpose] || purpose;
    };

    const getReviewStatusBadge = (status: string) => {
      const statusConfig = {
        'pending_review': {
          label: 'Pending Review',
          className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800'
        },
        'pending_verification': {
          label: 'Pending Verification',
          className: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-400 dark:border-indigo-800'
        },
        'submitted': { 
          label: 'Submitted', 
          className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800' 
        },
        'under_review': { 
          label: 'Under Review', 
          className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800' 
        },
        'pending_assessment': { 
          label: 'Pending Assessment', 
          className: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-400 dark:border-orange-800' 
        },
        'pending_final_approval': { 
          label: 'Pending Approval', 
          className: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800' 
        },
        'revision_required': { 
          label: 'Revision Required', 
          className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800' 
        },
        'approved': { 
          label: 'Approved', 
          className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800' 
        },
        'rejected': { 
          label: 'Rejected', 
          className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800' 
        }
      };
      
      const config = statusConfig[status as keyof typeof statusConfig] || { 
        label: status, 
        className: 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-800' 
      };
      
      return (
        <Badge 
          variant="outline" 
          className={`${config.className} text-xs font-medium px-1.5 py-0.5 rounded-full border backdrop-blur-sm whitespace-nowrap`}
        >
          {config.label}
        </Badge>
      );
    };

    return (
      <Card className="border-slate-200 dark:border-slate-800 shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-slate-900 dark:text-slate-100 font-semibold">
            {emptyMessage} ({filteredApps.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full">
          <TableHeader>
                <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[25%]">Application</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[25%]">Applicant</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[15%]">Status</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-medium w-[35%] hidden md:table-cell">Location & Type</TableHead>
                  <TableHead className="text-right text-slate-700 dark:text-slate-300 font-medium">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
                {filteredApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="text-muted-foreground/50 text-lg">
                          {applications.length === 0 ? "No applications found" : "No applications match your filters"}
                        </div>
                        <div className="text-sm text-muted-foreground/70">
                          {applications.length === 0 ? "Applications will appear here once submitted" : "Try adjusting your search or filter criteria"}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredApps.map((app) => (
                    <TableRow 
                      key={app.id} 
                      className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-150"
                    >
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                          {app.application_number}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {app.project_title || 'No project title'}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">
                          {getApplicantName(app)}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {getWaterPurposeLabel(app.water_purpose || '')}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3">
                        <div className="flex justify-center">
                          {getReviewStatusBadge(app.status)}
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 hidden md:table-cell">
                        <div className="flex items-center gap-1 mb-1">
                          <MapPin className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                            {getLocationString(app)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Droplets className="h-3 w-3 text-slate-500 dark:text-slate-400 shrink-0" />
                          <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                            {getWaterSourceLabel(app.water_source || '')}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="p-2 sm:p-3 text-right">
                  {app.status === 'pending_review' ? (
                    <Button 
                      size="sm" 
                      onClick={() => handleStartReview(app)}
                      disabled={startingReview === app.id}
                            className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-2 py-1 text-xs font-medium"
                    >
                      {startingReview === app.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                              <Eye className="h-3 w-3" />
                      )}
                            <span className="hidden sm:inline">
                      {startingReview === app.id ? 'Starting...' : 'Review'}
                            </span>
                            <span className="sm:hidden">Go</span>
                    </Button>
                  ) : (
                    <Link href={`/review/application/${app.application_number}`}>
                            <Button 
                              size="sm" 
                              className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border-0 shadow-sm hover:shadow-md transition-all duration-200 rounded-lg px-2 py-1 text-xs font-medium"
                            >
                              <Eye className="h-3 w-3" />
                              <span className="hidden sm:inline">
                                {app.status === 'under_review' ? 'Continue' : 'View'}
                              </span>
                              <span className="sm:hidden">Go</span>
                      </Button>
                    </Link>
                  )}
                </TableCell>
              </TableRow>
                  ))
                )}
          </TableBody>
        </Table>
      </div>
        </CardContent>
      </Card>
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
    <ProtectedRoute allowedRoles={['reviewer', 'admin', 'approver']} requireProfile={true}>
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
            <div className="flex items-center gap-2">
              <Link href="/management">
                <Button variant="outline">Management Dashboard</Button>
              </Link>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  New Submissions
                </CardTitle>
                <Clock className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    stats?.newSubmissions || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Awaiting initial review
                </p>
                {!statsLoading && stats && (
                  <div className="flex items-center mt-2">
                    <Badge 
                      variant={stats.newSubmissions === 0 ? "default" : "outline"}
                      className={`text-xs ${
                        stats.newSubmissions === 0 
                          ? "bg-green-100 text-green-800 hover:bg-green-100" 
                          : "bg-blue-100 text-blue-800 hover:bg-blue-100"
                      }`}
                    >
                      {stats.newSubmissions === 0 ? "All caught up" : `${stats.newSubmissions} pending review`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending Assessment
                </CardTitle>
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    stats?.pendingAssessment || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  With inspectors for assessment
                </p>
                {!statsLoading && stats && (
                  <div className="flex items-center mt-2">
                    <Badge 
                      variant="outline"
                      className={`text-xs ${
                        stats.pendingAssessment === 0 
                          ? "bg-green-100 text-green-800 hover:bg-green-100" 
                          : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                      }`}
                    >
                      {stats.pendingAssessment === 0 ? "No pending assessments" : `${stats.pendingAssessment} with inspectors`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Under Review
                </CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    stats?.underReview || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Being reviewed by staff
                </p>
                {!statsLoading && stats && (
                  <div className="flex items-center mt-2">
                    <Badge 
                      variant="outline"
                      className={`text-xs ${
                        stats.underReview === 0 
                          ? "bg-gray-100 text-gray-800 hover:bg-gray-100" 
                          : "bg-green-100 text-green-800 hover:bg-green-100"
                      }`}
                    >
                      {stats.underReview === 0 ? "No active reviews" : `${stats.underReview} in review`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Returned for Revision
                </CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? (
                    <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    stats?.returnedForRevision || 0
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Pending resubmission
                </p>
                {!statsLoading && stats && (
                  <div className="flex items-center mt-2">
                    <Badge 
                      variant="outline"
                      className={`text-xs ${
                        stats.returnedForRevision === 0 
                          ? "bg-green-100 text-green-800 hover:bg-green-100" 
                          : "bg-red-100 text-red-800 hover:bg-red-100"
                      }`}
                    >
                      {stats.returnedForRevision === 0 ? "No revisions pending" : `${stats.returnedForRevision} revisions needed`}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content with Tabs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Review Management
              </CardTitle>
            </CardHeader>
            <CardContent>
                             <Tabs defaultValue="applications_to_review" className="w-full">
                 <TabsList className="grid w-full grid-cols-3">
                   <TabsTrigger value="applications_to_review">Applications for Review</TabsTrigger>
              <TabsTrigger value="all_applications">All Applications</TabsTrigger>
              <TabsTrigger value="map" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Concession Map
              </TabsTrigger>
            </TabsList>

                {/* Tab Contents */}
                <TabsContent value="applications_to_review" className="space-y-4 mt-6">
            {/* Search and Filter Controls */}
                  <div className="flex flex-col md:flex-row gap-4 p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                  <Input
                        placeholder="Search by applicant name, application number, or project title..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
                  />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                      <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="surface">Surface Water</SelectItem>
                  <SelectItem value="groundwater">Groundwater</SelectItem>
                  <SelectItem value="industrial">Industrial</SelectItem>
                  <SelectItem value="agricultural">Agricultural</SelectItem>
                </SelectContent>
              </Select>
            </div>
                  <ApplicationTable 
                    applications={reviewApplications.filter(app => app.status === 'pending_review')}
                    emptyMessage="Applications for Review"
                  />
            </TabsContent>

                <TabsContent value="all_applications" className="space-y-4 mt-6">
                  {/* Search and Filter Controls */}
                  <div className="flex flex-col md:flex-row gap-4 p-6 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900 dark:to-gray-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                      <Input
                        placeholder="Search by applicant name, application number, or project title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm focus:bg-white dark:focus:bg-slate-800 transition-all duration-200 rounded-lg"
                      />
                    </div>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="w-full md:w-48 border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-800 transition-all duration-200 rounded-lg">
                        <SelectValue placeholder="Filter by type" />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg border-slate-200 dark:border-slate-700">
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="surface">Surface Water</SelectItem>
                        <SelectItem value="groundwater">Groundwater</SelectItem>
                        <SelectItem value="industrial">Industrial</SelectItem>
                        <SelectItem value="agricultural">Agricultural</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <ApplicationTable 
                    applications={reviewApplications}
                    emptyMessage="All Applications"
                  />
            </TabsContent>

                <TabsContent value="map" className="space-y-4 mt-6">
              <WaterConcessionMap />
            </TabsContent>
          </Tabs>
            </CardContent>
          </Card>
        </div>
      </motion.div>
      </DashboardLayout>
    </ProtectedRoute>
  );
} 