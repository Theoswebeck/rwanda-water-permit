"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  FileText,
  FileImage,
  File,
  X,
  Eye,
  Loader2,
  AlertTriangle,
  User
} from "lucide-react";
import { getDocumentUrl, uploadDocument } from "@/lib/supabase-storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp"
];

const ACCEPTED_EXTENSIONS = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp";

export interface FieldReportFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface FieldReportUploadProps {
  applicationId: string;
  existingFiles: FieldReportFile[];
  summary: string;
  inspectorName: string;
  inspectionDate: string;
  assessmentSubmittedDate?: string;
  onFilesChange: (files: FieldReportFile[]) => void;
  onSummaryChange: (summary: string) => void;
  onInspectorNameChange: (name: string) => void;
  onInspectionDateChange: (date: string) => void;
  inspectorNameReadOnly?: boolean;
  readOnly?: boolean;
  /** Title for the document upload section */
  documentsTitle?: string;
  /** Whether at least one document is required (controls asterisk + validation messaging only) */
  documentsRequired?: boolean;
  /** Optional description shown under the document upload title */
  documentsDescription?: string;
  /** Optional content inserted after Field Visit Details and before Field Report Documents */
  betweenDetailsAndDocuments?: React.ReactNode;
  /** Optional content rendered after the Field Report Documents card (and after summary, if shown) */
  afterDocuments?: React.ReactNode;
  /** Hide the built-in Field Report Summary card (useful if summary is captured elsewhere) */
  hideSummary?: boolean;
  /** If false, do not show inline validation alerts (useful when validation should only happen on submit) */
  showInlineValidation?: boolean;
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    return <FileImage className="h-5 w-5 text-blue-600" />;
  }
  if (ext === 'pdf') {
    return <FileText className="h-5 w-5 text-red-600" />;
  }
  if (['doc', 'docx'].includes(ext || '')) {
    return <FileText className="h-5 w-5 text-blue-800" />;
  }
  return <File className="h-5 w-5 text-gray-600" />;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export function FieldReportUpload({
  applicationId,
  existingFiles,
  summary,
  inspectorName,
  inspectionDate,
  assessmentSubmittedDate,
  onFilesChange,
  onSummaryChange,
  onInspectorNameChange,
  onInspectionDateChange,
  inspectorNameReadOnly = false,
  readOnly = false,
  documentsTitle = "Field Report Documents",
  documentsRequired = true,
  documentsDescription,
  betweenDetailsAndDocuments,
  afterDocuments,
  hideSummary = false,
  showInlineValidation = true
}: FieldReportUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSummaryMissing = !summary.trim();
  const isFilesMissing = existingFiles.length === 0;
  const displayedAssessmentDate =
    readOnly && assessmentSubmittedDate ? assessmentSubmittedDate : inspectionDate;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (readOnly) return;
    
    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      await handleFiles(files);
    }
  };

  const handleFiles = async (files: File[]) => {
    setUploadError(null);
    
    // Validate files
    const validFiles: File[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setUploadError(`File "${file.name}" exceeds maximum size of 10MB`);
        continue;
      }
      if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
        setUploadError(`File "${file.name}" has an unsupported format`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    setUploading(true);

    try {
      const uploadedFiles: FieldReportFile[] = [];

      for (const file of validFiles) {
        const uploadResult = await uploadDocument(file, applicationId, "fieldReport");
        if (!uploadResult) {
          setUploadError(`Failed to upload "${file.name}"`);
          continue;
        }

        uploadedFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          path: uploadResult.path,
          size: file.size,
          type: file.type,
          uploadedAt: new Date().toISOString()
        });
      }

      // Add new files to existing files
      onFilesChange([...existingFiles, ...uploadedFiles]);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadError('Failed to upload files. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    onFilesChange(existingFiles.filter(f => f.id !== fileId));
  };

  const handleViewFile = (file: FieldReportFile) => {
    const url = getDocumentUrl(file.path);
    if (url) {
      window.open(url, '_blank');
    }
  };

  const isImage = (fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '');
  };

  return (
    <div className="space-y-6">
      {/* Assessment Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="h-5 w-5" />
            Field Visit Details
          </CardTitle>
          <CardDescription>
            Enter information about the field assessment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inspector-name">Assessment Name *</Label>
              <Input
                id="inspector-name"
                value={inspectorName}
                onChange={(e) => onInspectorNameChange(e.target.value)}
                placeholder="Enter assessment name"
                readOnly={readOnly || inspectorNameReadOnly}
                aria-readonly={readOnly || inspectorNameReadOnly}
                disabled={readOnly}
                className={`mt-1${!readOnly && inspectorNameReadOnly ? " bg-muted/50" : ""}`}
              />
            </div>
            <div>
              <Label htmlFor="inspection-date">Assessment Date *</Label>
              <Input
                id="inspection-date"
                type="date"
                value={displayedAssessmentDate}
                onChange={(e) => onInspectionDateChange(e.target.value)}
                disabled={readOnly}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {betweenDetailsAndDocuments}

      {/* Field Report Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            {documentsTitle}
            {documentsRequired && <span className="text-destructive">*</span>}
          </CardTitle>
          <CardDescription>
            {documentsDescription ??
              (documentsRequired
                ? "Upload field visit report (PDF, Word) and supporting photos"
                : "Upload supporting documents (optional): PDFs, Word docs, and photos")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {documentsRequired && showInlineValidation && !readOnly && isFilesMissing && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {documentsTitle} are required. Please upload at least one file.
              </AlertDescription>
            </Alert>
          )}

          {/* Upload Area */}
          {!readOnly && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading}
              />
              
              <div className="flex flex-col items-center gap-3">
                {uploading ? (
                  <>
                    <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">Uploading files...</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        Drag and drop files here, or{" "}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-primary underline hover:no-underline"
                        >
                          browse
                        </button>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supported: PDF, Word (.doc, .docx), Images (JPG, PNG, GIF, WebP) - Max 10MB each
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {uploadError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{uploadError}</AlertDescription>
            </Alert>
          )}

          {/* Uploaded Files List */}
          {existingFiles.length > 0 && (
            <div className="space-y-2">
              <Label>Uploaded Files ({existingFiles.length})</Label>
              <div className="space-y-2">
                {existingFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      {isImage(file.name) ? (
                        <div className="h-12 w-12 rounded overflow-hidden border bg-background flex-shrink-0">
                          <img 
                            src={getDocumentUrl(file.path) || ""} 
                            alt={file.name}
                            className="h-full w-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => handleViewFile(file)}
                          />
                        </div>
                      ) : (
                        getFileIcon(file.name)
                      )}
                      <div>
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)} • Uploaded {new Date(file.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewFile(file)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(file.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {existingFiles.length === 0 && readOnly && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No {documentsTitle.toLowerCase()} have been uploaded yet.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Field Report Summary */}
      {!hideSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Field Report Summary <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              Provide a brief summary of the field visit findings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showInlineValidation && !readOnly && isSummaryMissing && (
              <Alert variant="destructive" className="mb-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Field report summary is required. Please provide a brief summary before proceeding.
                </AlertDescription>
              </Alert>
            )}
            <Textarea
              value={summary}
              onChange={(e) => onSummaryChange(e.target.value)}
              placeholder="Enter a summary of the field visit findings, observations, and any issues identified during the inspection..."
              rows={6}
              disabled={readOnly}
              aria-required={!readOnly}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Include key observations about site conditions, water source accessibility, infrastructure status, and any environmental concerns.
            </p>
          </CardContent>
        </Card>
      )}

      {afterDocuments}
    </div>
  );
}

