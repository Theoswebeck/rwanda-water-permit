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
        size="sm"
        asChild
        className="h-8 rounded-md text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      >
        <a href={`/permit/view/${encodeURIComponent(entry.permit_number || "")}`} target="_blank" rel="noopener noreferrer">
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          View
        </a>
      </Button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <label className="inline-flex cursor-pointer">
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          onChange={(event) => onUploadDoc(entry.id, event)}
          className="hidden"
          disabled={uploadingDocId === entry.id}
        />
        <Button
          variant={entry.uploaded_doc_path ? "secondary" : "outline"}
          size="sm"
          asChild
          disabled={uploadingDocId === entry.id}
          className="h-8 rounded-md"
        >
          <span>
            {uploadingDocId === entry.id ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5 mr-1.5" />
            )}
            {entry.uploaded_doc_path ? "Replace" : "Upload"}
          </span>
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
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Delete row</span>
          </Button>
        </>
      ) : null}
    </div>
  );
}
