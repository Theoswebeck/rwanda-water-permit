"use client";

import { useRef, useState } from "react";
import { getDocumentUrl, uploadDocument } from "@/lib/supabase-storage";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Eye, File, FileImage, FileText, Loader2, Upload, X } from "lucide-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

const ACCEPTED_EXTENSIONS = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp";

export interface InspectionDocumentFile {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  uploadedAt: string;
}

function isImage(fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop();
  return ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
}

function getFileIcon(fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop();
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "")) return <FileImage className="h-5 w-5 text-blue-600" />;
  if (ext === "pdf") return <FileText className="h-5 w-5 text-red-600" />;
  if (["doc", "docx"].includes(ext || "")) return <FileText className="h-5 w-5 text-blue-800" />;
  return <File className="h-5 w-5 text-gray-600" />;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function InspectionDocumentsUpload({
  applicationId,
  files,
  onFilesChange,
  readOnly = false,
}: {
  applicationId: string;
  files: InspectionDocumentFile[];
  onFilesChange: (files: InspectionDocumentFile[]) => void;
  readOnly?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (readOnly) return;
    const dropped = Array.from(e.dataTransfer.files);
    await handleFiles(dropped);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await handleFiles(Array.from(e.target.files));
  };

  const handleFiles = async (incoming: File[]) => {
    setUploadError(null);
    if (incoming.length === 0) return;

    const valid: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_FILE_SIZE) {
        setUploadError(`File "${f.name}" exceeds maximum size of 10MB`);
        continue;
      }
      if (!ACCEPTED_FILE_TYPES.includes(f.type)) {
        setUploadError(`File "${f.name}" has an unsupported format`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;

    setUploading(true);
    try {
      const uploaded: InspectionDocumentFile[] = [];
      for (const file of valid) {
        const uploadResult = await uploadDocument(file, applicationId, "inspection-document");
        if (!uploadResult) {
          setUploadError(`Failed to upload "${file.name}"`);
          continue;
        }

        uploaded.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          name: file.name,
          path: uploadResult.path,
          size: file.size,
          type: file.type,
          uploadedAt: new Date().toISOString(),
        });
      }

      if (uploaded.length > 0) onFilesChange([...files, ...uploaded]);
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("Failed to upload files. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    onFilesChange(files.filter((x) => x.id !== fileId));
  };

  const handleViewFile = (file: InspectionDocumentFile) => {
    const url = getDocumentUrl(file.path);
    if (url) window.open(url, "_blank");
  };

  return (
    <Card className="border-slate-200 dark:border-slate-800">
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between gap-3">
          <span>Uploaded documents</span>
          <Badge variant="secondary">{files.length}</Badge>
        </CardTitle>
        <CardDescription>
          Upload photos, proof documents, and any supporting files (PDF/Word/Images). Max 10MB each.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!readOnly ? (
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
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
                  <p className="text-sm text-muted-foreground">Uploading files…</p>
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
                      Supported: PDF, Word (.doc, .docx), Images (JPG, PNG, GIF, WebP)
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {uploadError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{uploadError}</AlertDescription>
          </Alert>
        ) : null}

        {files.length > 0 ? (
          <div className="space-y-2">
            <Label>Files</Label>
            <div className="space-y-2">
              {files.map((file) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
                  <div className="flex items-center gap-3 min-w-0">
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
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)} • Uploaded {new Date(file.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleViewFile(file)}>
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                    {!readOnly ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFile(file.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>No documents uploaded yet.</AlertDescription>
          </Alert>
        )}

        {/* Keep an invisible input to avoid layout shift from browser autofill */}
        <Input className="hidden" />
      </CardContent>
    </Card>
  );
}


