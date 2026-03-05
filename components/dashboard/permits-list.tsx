"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, AlertCircle, Search, Loader2, List, FileText } from "lucide-react";
import { downloadFromDocumentsBucket, uploadPermitPdf } from "@/lib/supabase-storage";
import { generateDigitalWaterPermitBlob } from "@/lib/pdf-generator";

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
   * Denormalized modification tagging fields from `permits`.
   * If > 0, we show a "Modified" tag on the permit.
   */
  modifiedCount?: number;
  lastModifiedAt?: string | null;
  /**
   * Back-compat: older permits may have `is_modification=true` but `modification_count=0`
   * (e.g. modified before the history trigger was deployed).
   */
  isModification?: boolean;
  /**
   * Storage path or URL for the generated permit PDF.
   * Expected to match `permits.permit_pdf_url` (storage path preferred).
   */
  pdfPath?: string | null;
}

interface PermitsListProps {
  permits: Permit[];
}

type PermitApplicationListItem = {
  id: string;
  application_number?: string | null;
  project_title?: string | null;
  status?: string | null;
  application_type?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  is_renewal?: boolean | null;
  is_modification?: boolean | null;
  kind: "original" | "renewal" | "modification" | "transfer";
};

export function PermitsList({ permits }: PermitsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busyPermitId, setBusyPermitId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"view" | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  // Applications dialog state (permit-linked applications list)
  const [appsDialogOpen, setAppsDialogOpen] = useState(false);
  const [appsPermit, setAppsPermit] = useState<Permit | null>(null);
  const [appsBusyPermitId, setAppsBusyPermitId] = useState<string | null>(null);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [appsList, setAppsList] = useState<PermitApplicationListItem[]>([]);

  const appSelectFields =
    "id, application_number, project_title, status, application_type, created_at, submitted_at, is_renewal, is_modification";

  const fetchPermitApplications = async (permitId: string) => {
    const response = await fetch(`/api/dashboard/permits/${permitId}/applications`, {
      method: "GET",
      cache: "no-store",
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.message || "Failed to fetch permit applications");
    }
    return (json.applications || []) as PermitApplicationListItem[];
  };

  const openApplicationsDialog = async (permit: Permit) => {
    setAppsPermit(permit);
    setAppsDialogOpen(true);
    setAppsLoading(true);
    setAppsError(null);
    setAppsList([]);
    setAppsBusyPermitId(permit.id);

    try {
      const list = await fetchPermitApplications(permit.id);
      setAppsList(list);
    } catch (e) {
      console.error("❌ Failed to load permit applications:", e);
      setAppsError("Failed to load applications for this permit. Please try again.");
    } finally {
      setAppsLoading(false);
      setAppsBusyPermitId(null);
    }
  };

  /**
   * Generate permit PDF on-demand if it doesn't exist.
   * Returns the PDF blob and updates the permit_pdf_url in the database.
   */
  const generatePermitPdfOnDemand = async (permit: Permit): Promise<Blob | null> => {
    try {
      setGeneratingPdf(permit.id);
      console.log("📄 Generating PDF on-demand for permit:", permit.permitNumber);

      // Fetch permit with application data + modification flag
      const metadataRes = await fetch(`/api/dashboard/permits/${permit.id}/pdf`, {
        method: "GET",
        cache: "no-store",
      });
      const metadataJson = await metadataRes.json().catch(() => null);
      if (!metadataRes.ok || !metadataJson?.success) {
        throw new Error(metadataJson?.message || "Failed to fetch permit data for PDF generation");
      }

      const permitData = metadataJson.permit as Record<string, unknown>;
      const application = metadataJson.application as Record<string, unknown> | null;
      if (!application) {
        throw new Error("No application data found for this permit");
      }
      const canonicalIssueDate =
        (typeof application.terms_accepted_at === "string" && application.terms_accepted_at.trim()) ||
        (typeof permitData.issued_date === "string" && permitData.issued_date.trim()) ||
        permit.issueDate;

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

      // Determine if this permit has been modified
      const isModified =
        (permitData as any).is_modification === true ||
        ((permitData as any).modification_count ?? 0) > 0 ||
        (permit.modifiedCount ?? 0) > 0;

      // Generate PDF blob (with "MODIFIED PERMIT" badge when applicable)
      const pdfBlob = await generateDigitalWaterPermitBlob(
        application as any,
        permit.permitNumber,
        conditions,
        5, // Default validity years
        isModified,
        {
          issuedDate: canonicalIssueDate,
          expiryDate: (permitData as any).expiry_date ?? permit.expiryDate,
        }
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
        const updateRes = await fetch(`/api/dashboard/permits/${permit.id}/pdf`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permitPdfUrl: upload.path }),
        });
        const updateJson = await updateRes.json().catch(() => null);
        if (!updateRes.ok || !updateJson?.success) {
          console.warn("⚠️ Failed to update permit_pdf_url:", updateJson?.message || updateRes.statusText);
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
    // If the permit has been modified we MUST regenerate so the "MODIFIED PERMIT"
    // badge is stamped on the PDF — the stored version was created before modification.
    const permitIsModified = (permit.modifiedCount ?? 0) > 0 || permit.isModification === true;

    if (!permitIsModified && permit.pdfPath) {
      // Non-modified: try to download existing PDF from storage first
      console.log("📥 Attempting to download PDF from:", permit.pdfPath);
      const blob = await downloadFromDocumentsBucket(permit.pdfPath);
      if (blob) {
        return blob;
      }
      console.warn("⚠️ PDF not found in storage, will generate on-demand...");
    }

    if (permitIsModified) {
      console.log("🔧 Permit is modified — regenerating PDF with MODIFIED badge");
    }

    // PDF doesn't exist or couldn't be downloaded (or is modified) - generate on-demand
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
                  <TableCell className="font-medium text-gray-900 py-4 px-6">
                    <div className="flex items-center gap-2">
                      <span>{permit.permitNumber}</span>
                      {(permit.modifiedCount ?? 0) > 0 || permit.isModification === true ? (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                          Modified{permit.modifiedCount && permit.modifiedCount > 1 ? ` (${permit.modifiedCount})` : ''}
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
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
                        disabled={appsBusyPermitId === permit.id}
                        onClick={async () => {
                          await openApplicationsDialog(permit);
                        }}
                      >
                        {appsBusyPermitId === permit.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <List className="h-4 w-4" />
                        )}
                        <span className="sr-only">Applications</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-600 hover:text-gray-900"
                            disabled={busyPermitId === permit.id || generatingPdf === permit.id}
                          >
                            {generatingPdf === permit.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                            <span className="sr-only">View options</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel>View</DropdownMenuLabel>
                          <DropdownMenuItem
                            onSelect={async () => {
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
                            <Eye className="mr-2 h-4 w-4" />
                            View permit PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`https://rwandawaterpermit.com/contract/terms/${encodeURIComponent(permit.permitNumber)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              View terms
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {(busyPermitId === permit.id || generatingPdf === permit.id) ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {generatingPdf === permit.id 
                          ? "Generating PDF…" 
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
      <Dialog
        open={appsDialogOpen}
        onOpenChange={(open) => {
          setAppsDialogOpen(open);
          if (!open) {
            setAppsPermit(null);
            setAppsError(null);
            setAppsList([]);
            setAppsLoading(false);
            setAppsBusyPermitId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Applications linked to permit {appsPermit?.permitNumber ?? ""}
            </DialogTitle>
            <DialogDescription>
              This includes the original application and any renewal, modification, or transfer requests associated with this permit.
            </DialogDescription>
          </DialogHeader>

          {appsLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading applications…
            </div>
          ) : appsError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {appsError}
            </div>
          ) : appsList.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No applications are linked to this permit yet.
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-auto rounded-md border">
              <div className="divide-y">
                {appsList.map((app) => {
                  const title = app.project_title || "Untitled application";
                  const number = app.application_number || app.id.slice(0, 8);
                  const kindLabel =
                    app.kind === "original"
                      ? "Original"
                      : app.kind === "renewal"
                        ? "Renewal"
                        : app.kind === "modification"
                          ? "Modification"
                          : "Transfer";

                  return (
                    <div key={app.id} className="flex items-start justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900">{number}</span>
                          <Badge variant="outline" className="text-xs">
                            {kindLabel}
                          </Badge>
                          {app.status ? (
                            <Badge variant="secondary" className="text-xs">
                              {String(app.status).replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                          {app.application_type ? (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              {String(app.application_type).replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">{title}</div>
                        {app.submitted_at || app.created_at ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {app.submitted_at
                              ? `Submitted: ${new Date(app.submitted_at).toLocaleDateString()}`
                              : app.created_at
                                ? `Created: ${new Date(app.created_at).toLocaleDateString()}`
                                : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/application/${app.id}`}>Open</Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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