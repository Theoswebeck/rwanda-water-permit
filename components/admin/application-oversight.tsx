"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, 
  Eye, 
  MoreHorizontal, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  XCircle,
  FileText,
  User,
  Download,
  Loader2,
  CheckCircle2,
  Circle
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface Application {
  id: string;
  applicantName: string;
  applicantType: "company" | "individual";
  applicationType: string;
  waterSource: string;
  location: string;
  district: string;
  province: string;
  status: "submitted" | "under_review" | "pending_assessment" | "pending_final_approval" | "approved" | "rejected" | "revision_required" | "draft" | "cancelled";
  submittedDate: string;
  lastUpdated: string;
  assignedReviewer?: string;
  assignedInspector?: string;
  slaStatus: "on_time" | "due_soon" | "overdue";
  daysRemaining: number;
  estimatedValue: number;
  applicationNumber?: string;
  projectTitle: string;
}

export function ApplicationOversight() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      
      // Simplified query to avoid join issues with nullable foreign keys
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          applicant:users!applicant_id(
            first_name,
            last_name,
            company_name,
            account_type
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Fetched applications:', data?.length || 0, 'applications');
      
      // Transform database data to component format
      const transformedApps: Application[] = (data || []).map((app) => {
        const applicant = Array.isArray(app.applicant) ? app.applicant[0] : app.applicant;
        
        const applicantName = applicant?.company_name || 
                            `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim() || 
                            'Unknown';
        
        // For now, we'll skip the assigned reviewer/inspector names since they caused query issues
        // These can be added later with separate queries if needed
        const reviewerName = undefined;
        const inspectorName = undefined;

        // Calculate SLA status and days remaining (mock calculation)
        const submittedDate = new Date(app.created_at);
        const now = new Date();
        const daysSinceSubmitted = Math.floor((now.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24));
        const slaTarget = 30; // 30 days SLA
        const daysRemaining = slaTarget - daysSinceSubmitted;
        
        let slaStatus: "on_time" | "due_soon" | "overdue";
        if (daysRemaining < 0) {
          slaStatus = "overdue";
        } else if (daysRemaining <= 5) {
          slaStatus = "due_soon";
        } else {
          slaStatus = "on_time";
        }

        return {
          id: app.id,
          applicantName,
          applicantType: applicant?.account_type === 'individual' ? 'individual' : 'company',
          applicationType: app.application_type || 'Unknown',
          waterSource: app.water_source || 'Unknown',
          location: `${app.district || 'Unknown'}, ${app.province || 'Unknown'}`,
          district: app.district || 'Unknown',
          province: app.province || 'Unknown',
          status: app.status,
          submittedDate: app.created_at.split('T')[0],
          lastUpdated: app.updated_at.split('T')[0],
          assignedReviewer: reviewerName,
          assignedInspector: inspectorName,
          slaStatus,
          daysRemaining,
          estimatedValue: app.project_value || 0,
          applicationNumber: app.application_number,
          projectTitle: app.project_title || 'Untitled Project'
        };
      });
      
      setApplications(transformedApps);
    } catch (err) {
      console.error('Failed to fetch applications:', err);
      setError('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  // Filter applications based on search and filters (matching dashboard logic)
  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch = 
        app.projectTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.applicationNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.applicantName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.district?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.province?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesType = filterType === "all" || app.applicationType === filterType;
      const matchesStatus = filterStatus === "all" || app.status === filterStatus;
      
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [applications, searchTerm, filterType, filterStatus]);

  // Function to get the appropriate status with icon and color (matching dashboard)
  const getStatusConfig = (status: string) => {
    switch (status) {
      case "draft":
        return {
          label: "Draft",
          icon: <Circle className="h-4 w-4" />,
          className: "bg-gray-100 text-gray-700 border-0 hover:bg-gray-100 px-3 py-2 rounded-full font-medium"
        };
      case "submitted":
        return {
          label: "Submitted",
          icon: <Clock className="h-4 w-4" />,
          className: "bg-blue-100 text-blue-700 border-0 hover:bg-blue-100 px-3 py-2 rounded-full font-medium"
        };
      case "under_review":
        return {
          label: "Under Review",
          icon: <AlertTriangle className="h-4 w-4" />,
          className: "bg-amber-100 text-amber-700 border-0 hover:bg-amber-100 px-3 py-2 rounded-full font-medium"
        };
      case "pending_assessment":
        return {
          label: "Pending Assessment",
          icon: <Eye className="h-4 w-4" />,
          className: "bg-purple-100 text-purple-700 border-0 hover:bg-purple-100 px-3 py-2 rounded-full font-medium"
        };
      case "pending_final_approval":
        return {
          label: "Pending Final Approval",
          icon: <CheckCircle className="h-4 w-4" />,
          className: "bg-indigo-100 text-indigo-700 border-0 hover:bg-indigo-100 px-3 py-2 rounded-full font-medium"
        };
      case "approved":
        return {
          label: "Approved",
          icon: <CheckCircle2 className="h-4 w-4" />,
          className: "bg-green-100 text-green-700 border-0 hover:bg-green-100 px-3 py-2 rounded-full font-medium"
        };
      case "rejected":
        return {
          label: "Rejected",
          icon: <XCircle className="h-4 w-4" />,
          className: "bg-red-100 text-red-700 border-0 hover:bg-red-100 px-3 py-2 rounded-full font-medium"
        };
      case "revision_required":
        return {
          label: "Revision Required",
          icon: <AlertTriangle className="h-4 w-4" />,
          className: "bg-orange-100 text-orange-700 border-0 hover:bg-orange-100 px-3 py-2 rounded-full font-medium"
        };
      case "cancelled":
        return {
          label: "Cancelled",
          icon: <XCircle className="h-4 w-4" />,
          className: "bg-gray-100 text-gray-700 border-0 hover:bg-gray-100 px-3 py-2 rounded-full font-medium"
        };
      default:
        return {
          label: "Unknown",
          icon: <Circle className="h-4 w-4" />,
          className: "bg-gray-100 text-gray-700 border-0 hover:bg-gray-100 px-3 py-2 rounded-full font-medium"
        };
    }
  };

  const getStatusBadge = (status: string) => {
    const config = getStatusConfig(status);
    return (
      <div className={`inline-flex items-center gap-2 text-sm ${config.className}`}>
        {config.icon}
        {config.label}
      </div>
    );
  };

  // Format date to be more readable (matching dashboard)
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short", 
      day: "numeric",
    });
  };

  // Format application type for display (matching dashboard)
  const formatApplicationType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Calculate stats like dashboard
  const stats = {
    total: applications.length,
    pending: applications.filter(app => ['submitted', 'under_review', 'pending_assessment', 'pending_final_approval'].includes(app.status)).length,
    approved: applications.filter(app => app.status === 'approved').length,
    overdue: applications.filter(app => app.slaStatus === "overdue").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading applications...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mb-2">Error Loading Applications</h2>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Statistics - Match dashboard style */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Applications</CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                Active in system
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">
                Awaiting processing
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approved}</div>
              <p className="text-xs text-muted-foreground">
                Successfully processed
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Overdue</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <p className="text-xs text-muted-foreground">
                Require immediate attention
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Search and Filters - Match dashboard layout exactly */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search applications..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Filter by:</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="domestic">Domestic</SelectItem>
                <SelectItem value="industrial">Industrial</SelectItem>
                <SelectItem value="agricultural">Agricultural</SelectItem>
                <SelectItem value="commercial">Commercial</SelectItem>
                <SelectItem value="municipal">Municipal</SelectItem>
                <SelectItem value="mining_water_use">Mining Water Use</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="pending_assessment">Pending Assessment</SelectItem>
                <SelectItem value="pending_final_approval">Pending Final Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="revision_required">Revision Required</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      {/* Applications Table - Match dashboard design exactly */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="rounded-lg border bg-white shadow-sm overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-gray-50/50">
              <TableHead className="font-semibold text-gray-700 px-6 py-4">Date</TableHead>
              <TableHead className="font-semibold text-gray-700 px-6 py-4">Application ID</TableHead>
              <TableHead className="font-semibold text-gray-700 px-6 py-4">Project Title</TableHead>
              <TableHead className="font-semibold text-gray-700 px-6 py-4">Type</TableHead>
              <TableHead className="font-semibold text-gray-700 px-6 py-4">Status</TableHead>
              <TableHead className="font-semibold text-gray-700 px-6 py-4">Location</TableHead>
              <TableHead className="font-semibold text-gray-700 px-6 py-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredApplications.length > 0 ? (
              filteredApplications.map((application) => (
                <TableRow key={application.id} className="hover:bg-blue-50/30 transition-colors duration-150 border-b border-gray-100">
                  <TableCell className="font-medium text-gray-900 px-6 py-4">
                    <div className="text-sm">
                      {formatDate(application.submittedDate)}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600 px-6 py-4">
                    <span className="font-mono text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-md font-medium">
                      {application.applicationNumber || `RWB-${application.id.slice(-6)}`}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-gray-900 px-6 py-4 max-w-xs">
                    <div className="truncate" title={application.projectTitle}>
                      {application.projectTitle}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600 px-6 py-4">
                    <div className="text-sm">
                      {formatApplicationType(application.applicationType)}
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    {getStatusBadge(application.status)}
                  </TableCell>
                  <TableCell className="text-gray-600 px-6 py-4">
                    <div className="text-sm">
                      {application.district}, {application.province}
                    </div>
                  </TableCell>
                  <TableCell className="text-right px-6 py-4">
                    <div className="flex justify-end gap-1.5">
                      <Link href={`/dashboard/application/${application.id}`}>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                          title="View Application"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 p-0 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                            title="More Actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          {/* Only show reassign for non-finalized applications */}
                          {application.status !== 'approved' && application.status !== 'rejected' && (
                            <>
                              <DropdownMenuItem>
                                <User className="mr-2 h-4 w-4" />
                                Reassign
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem>
                            <Download className="mr-2 h-4 w-4" />
                            Export Data
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-16 text-gray-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-gray-100 rounded-full">
                      <FileText className="h-6 w-6 text-gray-400" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 mb-1">
                        {applications.length === 0 ? "No applications yet" : "No matches found"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {applications.length === 0 
                          ? "Applications will appear here once they are submitted."
                          : "Try adjusting your search or filter criteria."
                        }
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  );
} 