// Storage compatibility layer for self-hosted mode.
// Files are served from /public/uploads and related API routes.

/**
 * Normalize a stored file path (strip leading slash).
 */
const normalizeStoragePath = (filePath: string) =>
  filePath.startsWith('/') ? filePath.substring(1) : filePath;

/**
 * Get public URL for a document using Supabase CDN
 * @param filePath - The file path stored in the database
 * @returns Public URL for the document
 */
export const getDocumentUrl = (filePath: string | null | undefined): string | null => {
  if (!filePath) return null;
  
  try {
    // Keep already-proxied URLs untouched.
    if (filePath.startsWith('/api/files/view?')) {
      return filePath;
    }

    // Keep in-memory object URLs untouched.
    if (filePath.startsWith('blob:')) {
      return filePath;
    }

    // Route all persisted document paths through the authenticated file proxy.
    // This avoids deployment-specific static /uploads serving issues and keeps
    // document access rules consistent for applicants and staff.
    return `/api/files/view?path=${encodeURIComponent(filePath)}`;
  } catch (error) {
    console.error('Error generating document URL:', error);
    return null;
  }
};

/**
 * Upload a document to Supabase storage
 * @param file - The file to upload
 * @param applicationId - Application ID for folder organization
 * @param documentType - Type of document for naming
 * @returns Upload result with path and URL
 */
export const uploadDocument = async (
  file: File,
  applicationId: string,
  documentType: string,
  owner?: { kind: "permit_registry"; id: string } | { kind: "inspection"; id: string }
): Promise<{ path: string; url: string } | null> => {
  const pathSegment = owner ? owner.id : applicationId;
  const uploadInChunks = async (): Promise<{ path: string; url: string } | null> => {
    const CHUNK_SIZE_BYTES = 256 * 1024; // 256 KB per request to stay below strict proxy limits
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const endpoint = `/api/dashboard/applications/${encodeURIComponent(pathSegment)}/documents/chunked`;
    let finalPath: string | null = null;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * CHUNK_SIZE_BYTES;
      const end = Math.min(start + CHUNK_SIZE_BYTES, file.size);
      const chunkBlob = file.slice(start, end);
      const form = new FormData();
      form.set('chunk', chunkBlob, file.name || `chunk-${chunkIndex}`);
      form.set('uploadId', uploadId);
      form.set('chunkIndex', String(chunkIndex));
      form.set('totalChunks', String(totalChunks));
      form.set('filename', file.name || 'document');
      form.set('mimeType', file.type || 'application/octet-stream');
      form.set('fileSize', String(file.size || 0));
      form.set('documentType', documentType);
      if (owner) {
        form.set('ownerKind', owner.kind);
        form.set('ownerId', owner.id);
      }

      const chunkRes = await fetch(endpoint, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });

      if (!chunkRes.ok) {
        console.error('❌ Chunk upload error:', await chunkRes.text());
        return null;
      }

      const json = (await chunkRes.json()) as { document?: { file_path?: string | null } };
      if (json?.document?.file_path) {
        finalPath = String(json.document.file_path);
      }
    }

    if (!finalPath) return null;
    return { path: finalPath, url: getDocumentUrl(finalPath) || finalPath };
  };

  try {
    const form = new FormData();
    form.set('file', file);
    form.set('documentType', documentType);
    if (owner) {
      form.set('ownerKind', owner.kind);
      form.set('ownerId', owner.id);
    }
    const res = await fetch(`/api/dashboard/applications/${encodeURIComponent(pathSegment)}/documents`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    if (!res.ok) {
      if (res.status === 413) {
        console.warn('⚠️ Upload hit payload limit. Retrying with chunked upload...');
        return await uploadInChunks();
      }
      console.error('❌ Upload error:', await res.text());
      return null;
    }
    const json = (await res.json()) as { document?: { file_path?: string | null } };
    const path = String(json.document?.file_path || '');
    if (!path) return null;
    return { path, url: getDocumentUrl(path) || path };
  } catch (error) {
    console.error('❌ Upload error in catch block:', error);
    return null;
  }
};

/**
 * Delete a document from Supabase storage
 * @param filePath - Path of the file to delete
 * @returns Success status
 */
export const deleteDocument = async (filePath: string): Promise<boolean> => {
  void filePath;
  return false;
};

/**
 * Get document file size and metadata
 * @param filePath - Path of the file
 * @returns File info or null
 */
export const getDocumentInfo = async (filePath: string) => {
  void filePath;
  return null;
};

/**
 * Check if file type is viewable in browser
 * @param mimeType - MIME type of the file
 * @returns Whether file can be viewed in browser
 */
export const isViewableInBrowser = (mimeType: string | null | undefined): boolean => {
  if (!mimeType) return false;
  
  const viewableMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/svg+xml',
    'text/plain',
    'text/csv'
  ];
  
  return viewableMimeTypes.includes(mimeType.toLowerCase());
};

/**
 * Get file icon based on MIME type
 * @param mimeType - MIME type of the file
 * @returns Icon name for UI
 */
export const getFileIcon = (mimeType: string | null | undefined): string => {
  if (!mimeType) return 'file-text';
  
  const type = mimeType.toLowerCase();
  
  if (type.includes('pdf')) return 'file-text';
  if (type.includes('image')) return 'image';
  if (type.includes('word') || type.includes('document')) return 'file-text';
  if (type.includes('excel') || type.includes('spreadsheet')) return 'file-text';
  if (type.includes('powerpoint') || type.includes('presentation')) return 'file-text';
  if (type.includes('zip') || type.includes('compressed')) return 'archive';
  
  return 'file';
};

/**
 * Format file size for display
 * @param bytes - File size in bytes
 * @returns Formatted size string
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return 'Unknown size';
  
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}; 

/**
 * Upload a generated permit PDF to Supabase Storage.
 *
 * We store it in the same bucket as other documents to avoid additional setup.
 * Path format:
 *   permits/{permitId}/permit-{permitNumber}.pdf
 */
export const uploadPermitPdf = async (opts: {
  permitId: string;
  permitNumber: string;
  pdfBlob: Blob;
}): Promise<{ path: string; url: string } | null> => {
  const { permitId, permitNumber, pdfBlob } = opts;

  try {
    const file = new File([pdfBlob], `permit-${permitNumber}.pdf`, { type: 'application/pdf' });
    const form = new FormData();
    form.set('file', file);
    form.set('permitId', permitId);
    form.set('kind', 'permit');
    form.set('label', permitNumber);
    const res = await fetch('/api/files/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('❌ Failed to upload permit PDF:', await res.text());
      return null;
    }
    const json = (await res.json()) as { path?: string; url?: string };
    if (!json.path || !json.url) return null;
    return { path: json.path, url: json.url };
  } catch (error) {
    console.error("❌ Error uploading permit PDF:", error);
    return null;
  }
};

/**
 * Upload a generated Terms & Conditions (Contract) PDF to Supabase Storage.
 *
 * We store it in the same bucket as other documents to avoid additional setup.
 * Path format:
 *   permits/{permitId}/terms-{contractNumber}.pdf
 */
export const uploadTermsPdf = async (opts: {
  permitId: string;
  contractNumber: string;
  pdfBlob: Blob;
}): Promise<{ path: string; url: string } | null> => {
  const { permitId, contractNumber, pdfBlob } = opts;

  try {
    const file = new File([pdfBlob], `terms-${contractNumber || 'contract'}.pdf`, { type: 'application/pdf' });
    const form = new FormData();
    form.set('file', file);
    form.set('permitId', permitId);
    form.set('kind', 'terms');
    form.set('label', contractNumber || 'contract');
    const res = await fetch('/api/files/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    if (!res.ok) {
      console.error('❌ Failed to upload terms PDF:', await res.text());
      return null;
    }
    const json = (await res.json()) as { path?: string; url?: string };
    if (!json.path || !json.url) return null;
    return { path: json.path, url: json.url };
  } catch (error) {
    console.error("❌ Error uploading terms PDF:", error);
    return null;
  }
};

/**
 * Download a file from the documents bucket (works for private buckets too if policies allow).
 */
export async function downloadFromDocumentsBucket(filePath: string): Promise<Blob | null> {
  try {
    // If this is a full URL, fetch it directly.
    // (Useful if older rows stored a CDN URL instead of a storage path.)
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      const res = await fetch(filePath);
      if (!res.ok) {
        console.error("❌ Direct fetch failed:", res.status, res.statusText);
        return null;
      }
      return await res.blob();
    }

    const normalizedPath = normalizeStoragePath(filePath);
    const url = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("❌ Storage download failed:", res.status, res.statusText);
      return null;
    }
    return await res.blob();
  } catch (error) {
    console.error("❌ Error downloading from storage:", error);
    return null;
  }
}