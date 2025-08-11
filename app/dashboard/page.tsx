"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ApplicationsList } from "@/components/dashboard/applications-list";
import { ApplicationStatus } from "@/components/dashboard/application-status";
import { PermitsList, Permit as PermitListItem } from "@/components/dashboard/permits-list";
import { PermitStatus } from "@/components/dashboard/permits-status";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, FileCheck, Loader2, AlertCircle, FileText, BarChart3, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import { usePermits } from "@/hooks/usePermits";
import type { Permit as DatabasePermit } from "@/types/database";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"applications" | "permits">("applications");
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  
  // Check for success parameters from URL
  useEffect(() => {
    const success = searchParams.get('success');
    const tab = searchParams.get('tab');
    
    if (success === 'application-created') {
      setShowSuccessAlert(true);
      // Auto-hide success message after 5 seconds
      setTimeout(() => setShowSuccessAlert(false), 5000);
    }
    
    if (tab === 'applications') {
      setActiveTab('applications');
    } else if (tab === 'permits') {
      setActiveTab('permits');
    }
  }, [searchParams]);
  
  // Fetch applications and permits (without user filtering for now)
  const {
    applications,
    loading: applicationsLoading,
    error: applicationsError,
    refresh: refreshApplications
  } = useApplications({
    // We'll add user filtering later
  });

  const {
    permits: databasePermits,
    loading: permitsLoading,
    error: permitsError,
    refresh: refreshPermits
  } = usePermits({
    autoFetch: true
  });

  // Transform database permits to component format
  const transformPermitForDisplay = (dbPermit: DatabasePermit): PermitListItem => {
    // Calculate status based on expiry date
    const now = new Date();
    const expiryDate = new Date(dbPermit.expiry_date);
    const thirtyDaysFromNow = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    let displayStatus: "active" | "expired" | "expiring-soon" = "active";
    if (expiryDate < now) {
      displayStatus = "expired";
    } else if (expiryDate <= thirtyDaysFromNow) {
      displayStatus = "expiring-soon";
    }

    return {
      id: dbPermit.id,
      title: `${dbPermit.purpose} Water Permit`, // Create a title from purpose
      issueDate: dbPermit.issued_date,
      expiryDate: dbPermit.expiry_date,
      status: displayStatus,
      type: dbPermit.purpose, // Use purpose as type
      location: "N/A", // We'll need to get this from related application
      permitNumber: dbPermit.permit_number,
    };
  };

  const permits = databasePermits.map(transformPermitForDisplay);

  const isLoading = applicationsLoading || permitsLoading;
  const hasError = applicationsError || permitsError;

  return (
    <DashboardLayout>
      <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between space-y-2 mb-8">
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                Water Permit Dashboard
              </h1>
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
                Manage your water permit applications and view permits
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Link href="/dashboard/new-application">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  New Application
                </Button>
              </Link>
            </div>
          </div>

          {/* Success Alert */}
          {showSuccessAlert && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Alert className="mb-6 border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  🎉 <strong>Application Created Successfully!</strong> Your water permit application has been saved as a draft. You can continue editing it or submit it for review.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Error handling */}
          {hasError && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {applicationsError || permitsError}
              </AlertDescription>
            </Alert>
          )}

          {/* Main Content */}
          <Tabs defaultValue="applications" value={activeTab} onValueChange={(value) => setActiveTab(value as "applications" | "permits")} className="space-y-4">
            <TabsList>
              <TabsTrigger value="applications" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Applications ({applications.length})
              </TabsTrigger>
              <TabsTrigger value="permits" className="flex items-center gap-2">
                <FileCheck className="h-4 w-4" />
                Permits ({permits.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="applications" className="space-y-4">
              {/* Applications Status Overview */}
              <ApplicationStatus 
                applications={applications} 
                loading={applicationsLoading}
                onRefresh={refreshApplications}
              />
              
              {/* Applications List */}
              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      All Applications
                    </CardTitle>
                    <CardDescription>
                      View and manage your water permit applications
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ApplicationsList 
                      applications={applications} 
                      loading={applicationsLoading}
                    />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="permits" className="space-y-4">
              {/* Permits Overview */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <PermitStatus permits={permits} />
              </motion.div>
              
              {/* Permits List */}
              <div className="grid gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileCheck className="h-5 w-5" />
                      Active Permits
                    </CardTitle>
                    <CardDescription>
                      View and manage your issued water permits
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <PermitsList permits={permits} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
      
      {/* Terms & Conditions Modal */}
      {/* This modal is now handled by the application detail page */}
    </DashboardLayout>
  );
} 