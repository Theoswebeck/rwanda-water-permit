"use client";

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
      <label
        className="inline-flex cursor-pointer"
        title={entry.uploaded_doc_path ? "Replace document" : "Upload document"}
      >
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          onChange={(event) => onUploadDoc(entry.id, event)}
          className="hidden"
          disabled={uploadingDocId === entry.id}
        />
        <Button
          variant={entry.uploaded_doc_path ? "secondary" : "outline"}
          type="button"
          size="icon"
          disabled={uploadingDocId === entry.id}
          className="h-8 w-8 rounded-md"
        >
          {uploadingDocId === entry.id ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          <span className="sr-only">{entry.uploaded_doc_path ? "Replace document" : "Upload document"}</span>
        </Button>
      </label>
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
