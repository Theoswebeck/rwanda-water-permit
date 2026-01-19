"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Download, AlertCircle, Search, Loader2 } from "lucide-react";
import { downloadFromDocumentsBucket, uploadPermitPdf } from "@/lib/supabase-storage";
import { generateDigitalWaterPermitBlob } from "@/lib/pdf-generator";
import { supabase } from "@/lib/supabase";

export interface Permit {
  id: string;
  title: string;
  issueDate: string;
  expiryDate: string;
  status: "active" | "expired" | "expiring-soon";
  type: string;
  location: string;
  permitNumber: string;
  /**
   * Storage path or URL for the generated permit PDF.
   * Expected to match `permits.permit_pdf_url` (storage path preferred).
   */
  pdfPath?: string | null;
}

interface PermitsListProps {
  permits: Permit[];
}

export function PermitsList({ permits }: PermitsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyPermitId, setBusyPermitId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"view" | "download" | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  /**
   * Generate permit PDF on-demand if it doesn't exist.
   * Returns the PDF blob and updates the permit_pdf_url in the database.
   */
  const generatePermitPdfOnDemand = async (permit: Permit): Promise<Blob | null> => {
    try {
      setGeneratingPdf(permit.id);
      console.log("📄 Generating PDF on-demand for permit:", permit.permitNumber);

      // Fetch permit with application data
      const { data: permitData, error: permitError } = await supabase
        .from("permits")
        .select(`
          id,
          permit_number,
          conditions,
          application_id,
          application:applications!application_id(
            *,
            applicant:users!applicant_id(*)
          )
        `)
        .eq("id", permit.id)
        .single();

      if (permitError || !permitData) {
        console.error("❌ Failed to fetch permit data:", permitError);
        throw new Error("Failed to fetch permit data for PDF generation");
      }

      const application = (permitData as any).application;
      if (!application) {
        throw new Error("No application data found for this permit");
      }

      // Parse conditions
      let conditions: string[] = [];
      if (permitData.conditions) {
        if (Array.isArray(permitData.conditions)) {
          conditions = permitData.conditions as string[];
        } else if (typeof permitData.conditions === "string") {
          try {
            const parsed = JSON.parse(permitData.conditions);
            conditions = Array.isArray(parsed) ? parsed : [];
          } catch {
            conditions = [];
          }
        }
      }

      // Generate PDF blob
      const pdfBlob = await generateDigitalWaterPermitBlob(
        application,
        permit.permitNumber,
        conditions,
        5 // Default validity years
      );

      // Upload to storage
      const upload = await uploadPermitPdf({
        permitId: permit.id,
        permitNumber: permit.permitNumber,
        pdfBlob,
      });

      if (upload?.path) {
        console.log("✅ PDF uploaded:", upload.path);

        // Update permit record with PDF path
        const { error: updateError } = await supabase
          .from("permits")
          .update({
            permit_pdf_url: upload.path,
            updated_at: new Date().toISOString(),
          })
          .eq("id", permit.id);

        if (updateError) {
          console.warn("⚠️ Failed to update permit_pdf_url:", updateError);
        } else {
          console.log("✅ permit_pdf_url saved on permit record");
          // Update the permit's pdfPath in the local state (won't affect props, but logs are useful)
        }
      }

      return pdfBlob;
    } catch (error) {
      console.error("❌ Failed to generate PDF on-demand:", error);
      return null;
    } finally {
      setGeneratingPdf(null);
    }
  };

  /**
   * Get PDF blob - either from storage or by generating on-demand
   */
  const getPermitPdfBlob = async (permit: Permit): Promise<Blob | null> => {
    // First try to download from storage if path exists
    if (permit.pdfPath) {
      console.log("📥 Attempting to download PDF from:", permit.pdfPath);
      const blob = await downloadFromDocumentsBucket(permit.pdfPath);
      if (blob) {
        return blob;
      }
      console.warn("⚠️ PDF not found in storage, will generate on-demand...");
    }

    // PDF doesn't exist or couldn't be downloaded - generate on-demand
    return await generatePermitPdfOnDemand(permit);
  };

  // Filter permits based on search and filters
  const filteredPermits = useMemo(() => {
    return permits.filter((permit) => {
      const matchesSearch = 
        permit.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        permit.permitNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        permit.location.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = typeFilter === "all" || permit.type.toLowerCase() === typeFilter.toLowerCase();
      const matchesStatus = statusFilter === "all" || permit.status.toLowerCase() === statusFilter.toLowerCase();
      
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [permits, searchQuery, typeFilter, statusFilter]);

  const activePermits = filteredPermits.filter(permit => 
    permit.status === "active" || permit.status === "expiring-soon"
  );
  const expiredPermits = filteredPermits.filter(permit => permit.status === "expired");
  
  // Function to get the appropriate badge color based on permit status
  const getStatusBadge = (status: string, expiryDate: string) => {
    // Check if expiring within 30 days
    const daysUntilExpiry = getDaysUntilExpiry(expiryDate);
    
    switch (status) {
      case "active":
        if (daysUntilExpiry <= 30 && daysUntilExpiry > 0) {
          return (
            <Badge variant="outline" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Expires Soon
            </Badge>
          );
        }
        return <Badge variant="outline" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Active</Badge>;
      case "expiring-soon":
        return (
          <Badge variant="outline" className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> Expires Soon
          </Badge>
        );
      case "expired":
        return <Badge variant="outline" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Expired</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Format date to be more readable
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  
  // Calculate days until expiry
  const getDaysUntilExpiry = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };
  
  // Format expiry time in a human-friendly way
  const formatExpiryTime = (expiryDate: string) => {
    const days = getDaysUntilExpiry(expiryDate);
    
    if (days < 0) {
      return `Expired ${Math.abs(days)} days ago`;
    } else if (days === 0) {
      return "Expires today";
    } else if (days === 1) {
      return "Expires tomorrow";
    } else if (days <= 30) {
      return `Expires in ${days} days`;
    } else {
      return `Expires on ${formatDate(expiryDate)}`;
    }
  };

  const renderPermitsTable = (permitsList: Permit[]) => {
    return (
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow className="border-b border-gray-200">
              <TableHead className="font-semibold text-gray-900 py-4 px-6">Permit Number</TableHead>
              <TableHead className="font-semibold text-gray-900 py-4 px-6">Title</TableHead>
              <TableHead className="font-semibold text-gray-900 py-4 px-6">Type</TableHead>
              <TableHead className="font-semibold text-gray-900 py-4 px-6">Issue Date</TableHead>
              <TableHead className="font-semibold text-gray-900 py-4 px-6">Expiration</TableHead>
              <TableHead className="font-semibold text-gray-900 py-4 px-6">Status</TableHead>
              <TableHead className="font-semibold text-gray-900 py-4 px-6 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="bg-white">
            {permitsList.length > 0 ? (
              permitsList.map((permit) => (
                <TableRow 
                  key={permit.id} 
                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <TableCell className="font-medium text-gray-900 py-4 px-6">{permit.permitNumber}</TableCell>
                  <TableCell className="text-gray-700 py-4 px-6">{permit.title}</TableCell>
                  <TableCell className="text-gray-700 py-4 px-6">{permit.type}</TableCell>
                  <TableCell className="text-gray-700 py-4 px-6">{formatDate(permit.issueDate)}</TableCell>
                  <TableCell className="py-4 px-6">
                    <span className={`text-sm ${
                      permit.status === "expired" 
                        ? "text-red-600" 
                        : getDaysUntilExpiry(permit.expiryDate) <= 30 
                          ? "text-amber-600" 
                          : "text-green-600"
                    }`}>
                      {formatExpiryTime(permit.expiryDate)}
                    </span>
                  </TableCell>
                  <TableCell className="py-4 px-6">{getStatusBadge(permit.status, permit.expiryDate)}</TableCell>
                  <TableCell className="text-center py-4 px-6">
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-600 hover:text-gray-900"
                        disabled={busyPermitId === permit.id || generatingPdf === permit.id}
                        onClick={async () => {
                          try {
                            setBusyPermitId(permit.id);
                            setBusyAction("download");
                            
                            const blob = await getPermitPdfBlob(permit);
                            if (!blob) throw new Error("Failed to get permit PDF");

                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `permit-${permit.permitNumber}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            setTimeout(() => URL.revokeObjectURL(url), 60_000);
                          } catch (e) {
                            console.error("❌ Failed to download permit PDF:", e);
                            alert("Failed to download permit PDF. Please try again.");
                          } finally {
                            setBusyPermitId(null);
                            setBusyAction(null);
                          }
                        }}
                      >
                        {generatingPdf === permit.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        <span className="sr-only">Download</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-600 hover:text-gray-900"
                        disabled={busyPermitId === permit.id || generatingPdf === permit.id}
                        onClick={async () => {
                          try {
                            setBusyPermitId(permit.id);
                            setBusyAction("view");
                            
                            const blob = await getPermitPdfBlob(permit);
                            if (!blob) throw new Error("Failed to get permit PDF");

                            const url = URL.createObjectURL(blob);
                            window.open(url, "_blank");
                            setTimeout(() => URL.revokeObjectURL(url), 60_000);
                          } catch (e) {
                            console.error("❌ Failed to open permit PDF:", e);
                            alert("Failed to open permit PDF. Please try again.");
                          } finally {
                            setBusyPermitId(null);
                            setBusyAction(null);
                          }
                        }}
                      >
                        {generatingPdf === permit.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        <span className="sr-only">View</span>
                      </Button>
                    </div>
                    {(busyPermitId === permit.id || generatingPdf === permit.id) ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {generatingPdf === permit.id 
                          ? "Generating PDF…" 
                          : busyAction === "download" 
                            ? "Downloading…" 
                            : "Opening…"}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {permits.length === 0 
                    ? "No permits found in this category."
                    : "No permits match your current filters. Try adjusting your search or filters."
                  }
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-0 shadow-sm">
        <CardHeader className="px-6 pt-6 pb-3">
          <CardTitle>Your Permits</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="active" className="w-full">
            <div className="mb-6">
              <TabsList className="grid w-[400px] grid-cols-2">
                <TabsTrigger value="active">Active Permits ({activePermits.length})</TabsTrigger>
                <TabsTrigger value="expired">Expired Permits ({expiredPermits.length})</TabsTrigger>
              </TabsList>
            </div>
            
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mb-6">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search permits..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">Filter by:</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="industrial">Industrial</SelectItem>
                    <SelectItem value="agricultural">Agricultural</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="expiring-soon">Expiring Soon</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <TabsContent value="active" className="mt-0">
              {renderPermitsTable(activePermits)}
            </TabsContent>
            
            <TabsContent value="expired" className="mt-0">
              {renderPermitsTable(expiredPermits)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
} 