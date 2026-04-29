"use client";

import { useRef } from "react";
import { Eye, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import type { PermitRegistryEntry } from "@/types/database";

interface RowActionsProps {
  entry: PermitRegistryEntry;
  uploadingDocId: string | null;
  canUpload: boolean;
  canModify: boolean;
  onUploadDoc: (entryId: string, event: ChangeEvent<HTMLInputElement>) => void;
  onEdit: (entry: PermitRegistryEntry) => void;
  onDelete: (entry: PermitRegistryEntry) => void;
}

export function RowActions({
  entry,
  uploadingDocId,
  canUpload,
  canModify,
  onUploadDoc,
  onEdit,
  onDelete,
}: RowActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isUploading = uploadingDocId === entry.id;
  const hasExistingDocs = (entry.documents?.length ?? 0) > 0 || Boolean(entry.uploaded_doc_path);

  if (!canUpload) {
    return (
      <Button
        variant="ghost"
        size="icon"
        asChild
        className="h-8 w-8 rounded-md text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        title="View permit"
      >
        <a href={`/permit/view/${encodeURIComponent(entry.permit_number || "")}`} target="_blank" rel="noopener noreferrer">
          <Eye className="h-3.5 w-3.5" />
          <span className="sr-only">View permit</span>
        </a>
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center justify-end gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
        onChange={(event) => onUploadDoc(entry.id, event)}
        className="hidden"
        disabled={isUploading}
      />
      <Button
        type="button"
        variant={hasExistingDocs ? "secondary" : "outline"}
        size="icon"
        disabled={isUploading}
        className="h-8 w-8 rounded-md"
        title={hasExistingDocs ? "Upload more documents" : "Upload document"}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        <span className="sr-only">{hasExistingDocs ? "Upload more documents" : "Upload document"}</span>
      </Button>
      {canModify ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(entry)}
            title="Edit row"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">Edit row</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 text-red-600 hover:text-red-700"
            onClick={() => onDelete(entry)}
            title="Delete row"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Delete row</span>
          </Button>
        </>
      ) : null}
    </div>
  );
}
