"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Calendar, Download, FileCheck, Clock, AlertCircle, MapPin } from "lucide-react";
import Link from "next/link";
import { generatePermitPDF } from "@/lib/pdf-generator";

export default function PermitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [permit, setPermit] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  
  useEffect(() => {
    // Simulate API call to fetch permit details
    const fetchPermitDetails = async () => {
      setIsLoading(true);
      
      // Mock data - in a real app, this would be an API call
      setTimeout(() => {
        // Simulate different permit data based on ID
        const permitId = params.id as string;
        let mockPermit;
        
        if (permitId === "PER-001") {
          mockPermit = {
            id: "PER-001",
            title: "Commercial Water Extraction",
            issueDate: "2023-05-15",
            expiryDate: "2025-05-15", // Valid for 2 years
            status: "active",
            type: "Commercial",
            location: "Kigali, Gasabo",
            permitNumber: "WP-2023-05-001",
            waterSource: "Groundwater",
            purpose: "Commercial Supply",
            waterAllowance: "150 m³/day",
            issuingAuthority: "Rwanda Water Resources Board",
            applicationDetails: {
              applicantName: "Kigali Business Group",
              applicantType: "Corporation",
              contactEmail: "info@kbg.rw",
              contactPhone: "+250 78 123 4567",
              landOwnership: "Property Deed #KG-2022-04-123",
              environmentalAssessment: "Approved on April 10, 2023"
            },
            conditions: [
              "Monthly water quality testing required",
              "Quarterly reporting of extraction volumes",
              "Annual environmental impact assessment",
              "No extraction during drought periods as notified by the Authority"
            ],
            inspections: [
              { date: "2023-08-10", status: "Passed", notes: "All conditions met. Water quality within acceptable parameters." },
              { date: "2023-11-15", status: "Scheduled", notes: "Routine quarterly inspection" }
            ]
          };
        } else if (permitId === "PER-002") {
          mockPermit = {
            id: "PER-002",
            title: "Industrial Water Usage",
            issueDate: "2022-11-10",
            expiryDate: "2023-11-10", // Valid for 1 year - expired
            status: "expired",
            type: "Industrial",
            location: "Musanze, Northern Province",
            permitNumber: "WP-2022-11-002",
            waterSource: "River",
            purpose: "Manufacturing Process",
            waterAllowance: "350 m³/day",
            issuingAuthority: "Rwanda Water Resources Board",
            applicationDetails: {
              applicantName: "Musanze Industrial Ltd",
              applicantType: "Corporation",
              contactEmail: "operations@musanzeindustrial.rw",
              contactPhone: "+250 78 987 6543",
              landOwnership: "Industrial Zone Allocation #MZ-2021-09-078",
              environmentalAssessment: "Approved on October 5, 2022"
            },
            conditions: [
              "Daily effluent monitoring",
              "Treatment of all wastewater before discharge",
              "Monthly water quality reporting",
              "Maintenance of 50-meter riparian buffer zone"
            ],
            inspections: [
              { date: "2023-01-20", status: "Passed", notes: "All conditions met." },
              { date: "2023-05-15", status: "Warning", notes: "Effluent treatment not meeting standards. Corrective action required within 30 days." },
              { date: "2023-06-20", status: "Passed", notes: "Corrective actions implemented successfully." }
            ],
            renewalStatus: "Pending",
            renewalSubmitted: "2023-10-05"
          };
        } else if (permitId === "PER-003") {
          mockPermit = {
            id: "PER-003",
            title: "Agricultural Irrigation",
            issueDate: "2023-08-25",
            expiryDate: "2024-02-25", // Expires in less than 30 days
            status: "expiring-soon",
            type: "Agricultural",
            location: "Nyagatare, Eastern Province",
            permitNumber: "WP-2023-08-003",
            waterSource: "Lake",
            purpose: "Crop Irrigation",
            waterAllowance: "500 m³/day (seasonal)",
            issuingAuthority: "Rwanda Water Resources Board",
            applicationDetails: {
              applicantName: "Nyagatare Farms Cooperative",
              applicantType: "Cooperative",
              contactEmail: "info@nyagatarefarms.rw",
              contactPhone: "+250 73 456 7890",
              landOwnership: "Community Land Title #NG-2023-02-345",
              environmentalAssessment: "Approved on July 30, 2023"
            },
            conditions: [
              "No irrigation during rainy season (March-May, September-November)",
              "Implementation of water-efficient irrigation techniques",
              "Maintenance of lake buffer zone",
              "Quarterly water quality testing"
            ],
            inspections: [
              { date: "2023-09-30", status: "Passed", notes: "Irrigation systems comply with efficiency requirements." }
            ],
            renewalReminder: "Permit expires in less than 30 days. Please submit a renewal application as soon as possible."
          };
        } else if (permitId === "PER-004") {
          mockPermit = {
            id: "PER-004",
            title: "Residential Water Supply",
            issueDate: "2023-03-05",
            expiryDate: "2024-03-05", // Expiring in about 3 months
            status: "active",
            type: "Residential",
            location: "Rubavu, Western Province",
            permitNumber: "WP-2023-03-004",
            waterSource: "Groundwater",
            purpose: "Community Water Supply",
            waterAllowance: "75 m³/day",
            issuingAuthority: "Rwanda Water Resources Board",
            applicationDetails: {
              applicantName: "Rubavu Community Association",
              applicantType: "Community Organization",
              contactEmail: "water@rubavucommunity.rw",
              contactPhone: "+250 78 234 5678",
              landOwnership: "Community Trust Land #RB-2022-12-567",
              environmentalAssessment: "Approved on February 15, 2023"
            },
            conditions: [
              "Weekly water quality testing",
              "Maintenance of community access points",
              "Monthly reporting of extraction volumes",
              "Implementation of water conservation measures during dry seasons"
            ],
            inspections: [
              { date: "2023-06-15", status: "Passed", notes: "All conditions met." },
              { date: "2023-09-20", status: "Passed", notes: "Water quality tests within acceptable parameters." }
            ]
          };
        } else if (permitId === "PER-005") {
          mockPermit = {
            id: "PER-005",
            title: "Mining Operation Water Usage",
            issueDate: "2021-10-15",
            expiryDate: "2023-10-15", // Recently expired
            status: "expired",
            type: "Industrial",
            location: "Rulindo, Northern Province",
            permitNumber: "WP-2021-10-005",
            waterSource: "Groundwater",
            purpose: "Mining Operations",
            waterAllowance: "200 m³/day",
            issuingAuthority: "Rwanda Water Resources Board",
            applicationDetails: {
              applicantName: "Rulindo Mining Corporation",
              applicantType: "Corporation",
              contactEmail: "operations@rulindomining.rw",
              contactPhone: "+250 72 345 6789",
              landOwnership: "Mining Concession #RL-2021-07-123",
              environmentalAssessment: "Approved on September 30, 2021"
            },
            conditions: [
              "Continuous monitoring of groundwater levels",
              "Treatment of all process water before discharge",
              "Rehabilitation of water sources upon mine closure",
              "Quarterly environmental impact assessment"
            ],
            inspections: [
              { date: "2022-01-20", status: "Passed", notes: "All conditions met." },
              { date: "2022-05-15", status: "Warning", notes: "Groundwater levels dropping below acceptable threshold. Reduced extraction required." },
              { date: "2022-08-10", status: "Passed", notes: "Corrective actions implemented." },
              { date: "2023-01-25", status: "Passed", notes: "Compliance with all conditions." },
              { date: "2023-06-30", status: "Passed", notes: "Final inspection before permit expiry." }
            ],
            renewalStatus: "Not Submitted",
            expiryNotice: "Your permit has expired. Operations must cease until a new permit is granted."
          };
        } else {
          // Default generic permit
          mockPermit = {
            id: permitId,
            title: "Water Permit",
            issueDate: "2023-01-01",
            expiryDate: "2024-01-01",
            status: "active",
            type: "Unknown",
            location: "Unknown",
            permitNumber: "WP-XXXX-XX-XXX",
            waterSource: "Unknown",
            purpose: "Unknown",
            waterAllowance: "Unknown",
            issuingAuthority: "Rwanda Water Resources Board",
            applicationDetails: {
              applicantName: "Unknown",
              applicantType: "Unknown",
              contactEmail: "unknown@example.com",
              contactPhone: "Unknown",
              landOwnership: "Unknown",
              environmentalAssessment: "Unknown"
            },
            conditions: [],
            inspections: []
          };
        }
        
        setPermit(mockPermit);
        setIsLoading(false);
      }, 1000);
    };
    
    fetchPermitDetails();
  }, [params.id]);
  
  // Handle permit download
  const handleDownloadPermit = async () => {
    if (!permit) return;
    
    try {
      setIsDownloading(true);
      await generatePermitPDF(permit);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again later.');
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
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Expires Soon
          </Badge>
        );
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
                  {isDownloading ? "Generating PDF..." : "Download Permit"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    } else if (permit.status === "expiring-soon") {
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
                    {isDownloading ? "Generating PDF..." : "Download Permit"}
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
                    {isDownloading ? "Generating PDF..." : "Download Expired Permit"}
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
            <Button asChild className="mt-6">
              <Link href="/dashboard">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
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
                      <dd className="mt-1">{permit.waterSource}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Purpose</dt>
                      <dd className="mt-1">{permit.purpose}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Water Allowance</dt>
                      <dd className="mt-1">{permit.waterAllowance}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">Type</dt>
                      <dd className="mt-1">{permit.type}</dd>
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
                          : permit.status === "expiring-soon" 
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
                    {isDownloading ? "Generating PDF..." : "Download Permit"}
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
                  <Link href={`/contact-us?permit=${permit?.permitNumber || params.id}&category=permit`}>
                    <Button className="w-full">Contact Support</Button>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 