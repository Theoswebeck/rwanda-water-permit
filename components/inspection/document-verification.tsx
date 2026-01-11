"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Eye,
  Save,
  Loader2,
  FileImage,
  File
} from "lucide-react";
import { getDocumentUrl } from "@/lib/supabase-storage";
import type { Document } from "@/types/database";

export type VerificationStatus = "verified" | "incomplete" | "missing" | "pending";

export interface DocumentVerification {
  documentId: string;
  documentName: string;
  documentType: string;
  status: VerificationStatus;
  notes: string;
}

interface DocumentVerificationProps {
  documents: Document[];
  verifications: Record<string, { status: VerificationStatus; notes: string }>;
  onVerificationsChange: (verifications: Record<string, { status: VerificationStatus; notes: string }>) => void;
  readOnly?: boolean;
}

// Document type labels for display
const documentTypeLabels: Record<string, string> = {
  identification_doc: "Identification Document",
  land_ownership_doc: "Land Ownership Document",
  technical_drawings: "Technical Drawings",
  environmental_impact_doc: "Environmental Impact Assessment",
  payment_proof: "Payment Proof",
  intake_discharge_map: "Map (Intake/Discharge / Polygon area)",
  water_quality_report: "Water Quality Report",
  geological_survey: "Geological / Hydrological Report",
  business_license: "Business License",
  other: "Other Documents",
  // Activity-specific document types
  identificationDoc: "Identification Document",
  landOwnershipDoc: "Land Ownership Document",
  technicalDrawings: "Technical Drawings",
  environmentalImpactDoc: "Environmental Impact Assessment",
  paymentProof: "Payment Proof",
  intakeDischargeMap: "Intake/Discharge Map",
  waterQualityReport: "Water Quality Report",
  miningLicense: "Mining License",
  miningHydrologicalReport: "Mining Hydrological Report",
  generalRequirements: "General Requirements",
};

const getStatusBadge = (status: VerificationStatus) => {
  switch (status) {
    case "verified":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
          <CheckCircle className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      );
    case "incomplete":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Incomplete
        </Badge>
      );
    case "missing":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
          <XCircle className="h-3 w-3 mr-1" />
          Missing
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-gray-600">
          Pending Review
        </Badge>
      );
  }
};

const getFileIcon = (fileName: string) => {
  const ext = fileName.toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    return <FileImage className="h-5 w-5 text-blue-600" />;
  }
  if (ext === 'pdf') {
    return <FileText className="h-5 w-5 text-red-600" />;
  }
  return <File className="h-5 w-5 text-gray-600" />;
};

export function DocumentVerificationComponent({
  documents,
  verifications,
  onVerificationsChange,
  readOnly = false
}: DocumentVerificationProps) {
  const handleStatusChange = (documentId: string, status: VerificationStatus) => {
    const updatedVerifications = {
      ...verifications,
      [documentId]: {
        ...verifications[documentId],
        status,
        notes: verifications[documentId]?.notes || ""
      }
    };
    onVerificationsChange(updatedVerifications);
  };

  const handleNotesChange = (documentId: string, notes: string) => {
    const updatedVerifications = {
      ...verifications,
      [documentId]: {
        ...verifications[documentId],
        status: verifications[documentId]?.status || "pending",
        notes
      }
    };
    onVerificationsChange(updatedVerifications);
  };

  const handleViewDocument = (doc: Document) => {
    if (doc.file_path) {
      const url = getDocumentUrl(doc.file_path);
      if (url) {
        window.open(url, '_blank');
      }
    }
  };

  const getVerificationStats = () => {
    // Only compute stats for documents that exist on this application.
    // This also lets callers store metadata inside the verifications object (e.g. "__meta")
    // without breaking counts.
    const total = documents.length;
    const statuses = documents.map((doc) => verifications[doc.id]?.status || "pending");
    const verified = statuses.filter((s) => s === "verified").length;
    const incomplete = statuses.filter((s) => s === "incomplete").length;
    const missing = statuses.filter((s) => s === "missing").length;
    const pending = total - verified - incomplete - missing;
    
    return { total, verified, incomplete, missing, pending };
  };

  const stats = getVerificationStats();

  if (documents.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No documents have been uploaded for this application yet.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Verification Summary Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Document Verification Summary
          </CardTitle>
          <CardDescription>
            Review and verify all submitted documents for completeness
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Total Documents</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-2xl font-bold text-green-700">{stats.verified}</p>
              <p className="text-xs text-green-600">Verified</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-2xl font-bold text-yellow-700">{stats.incomplete}</p>
              <p className="text-xs text-yellow-600">Incomplete</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-2xl font-bold text-red-700">{stats.missing}</p>
              <p className="text-xs text-red-600">Missing</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-2xl font-bold text-gray-700">{stats.pending}</p>
              <p className="text-xs text-gray-600">Pending Review</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uploaded Documents</CardTitle>
          <CardDescription>
            Verify each document and add notes where necessary
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {documents.map((doc) => {
            const verification = verifications[doc.id] || { status: "pending", notes: "" };
            const docLabel = documentTypeLabels[doc.type] || doc.type;
            
            return (
              <div
                key={doc.id}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getFileIcon(doc.name)}
                    <div>
                      <p className="font-medium">{doc.name}</p>
                      <p className="text-sm text-muted-foreground">{docLabel}</p>
                      {doc.file_size && (
                        <p className="text-xs text-muted-foreground">
                          Size: {(doc.file_size / 1024).toFixed(1)} KB
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(verification.status as VerificationStatus)}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewDocument(doc)}
                      disabled={!doc.file_path}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  </div>
                </div>

                {!readOnly && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t">
                    <div>
                      <Label htmlFor={`status-${doc.id}`} className="text-sm">
                        Verification Status
                      </Label>
                      <Select
                        value={verification.status}
                        onValueChange={(value) => handleStatusChange(doc.id, value as VerificationStatus)}
                      >
                        <SelectTrigger id={`status-${doc.id}`} className="mt-1">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">⏳ Pending Review</SelectItem>
                          <SelectItem value="verified">✅ Verified</SelectItem>
                          <SelectItem value="incomplete">⚠️ Incomplete</SelectItem>
                          <SelectItem value="missing">❌ Missing/Invalid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`notes-${doc.id}`} className="text-sm">
                        Notes
                      </Label>
                      <Textarea
                        id={`notes-${doc.id}`}
                        placeholder="Add verification notes..."
                        value={verification.notes}
                        onChange={(e) => handleNotesChange(doc.id, e.target.value)}
                        className="mt-1 h-20"
                      />
                    </div>
                  </div>
                )}

                {readOnly && verification.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">
                      <strong>Notes:</strong> {verification.notes}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Verification Guidance */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Verification Guidelines:</strong>
          <ul className="mt-2 space-y-1 text-sm list-disc list-inside">
            <li><strong>Verified:</strong> Document is complete, legible, and meets all requirements</li>
            <li><strong>Incomplete:</strong> Document exists but is missing information or pages</li>
            <li><strong>Missing:</strong> Required document was not submitted or is invalid</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}

