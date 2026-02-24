import { supabase } from './supabase';

/**
 * Utility functions for Supabase Storage operations
 */

// Default storage bucket for documents
const DOCUMENTS_BUCKET = 'application-documents';

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
    // Check if it's already a full URL
    if (filePath.startsWith('http')) {
      return filePath;
    }
    
    // Remove leading slash if present to avoid double slashes
    let normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
    
    // Handle legacy paths that start with "uploads/" - convert them to use storage bucket
    if (normalizedPath.startsWith('uploads/')) {
      // For legacy paths, we'll construct a storage URL
      // You may need to adjust this based on your actual storage setup
      normalizedPath = normalizedPath.replace('uploads/', 'legacy/');
    }
    
    // Generate public URL using Supabase storage
    const { data } = supabase.storage
      .from(DOCUMENTS_BUCKET)
      .getPublicUrl(normalizedPath);
      
    return data.publicUrl;
  } catch (error) {
    console.error('Error generating document URL:', error);
    // Fallback: return a placeholder or the original path
    return filePath;
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
  documentType: string
): Promise<{ path: string; url: string } | null> => {
  try {
    console.log(`🔧 uploadDocument called with:`, { fileName: file.name, applicationId, documentType });
    
    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${documentType}-${Date.now()}.${fileExt}`;
    const filePath = `applications/${applicationId}/${fileName}`;
    
    console.log(`🔧 Generated file path: ${filePath}`);
    console.log(`🔧 Using bucket: ${DOCUMENTS_BUCKET}`);
    
    // Upload file
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
      
    if (error) {
      console.error('❌ Upload error:', error);
      return null;
    }
    
    console.log(`✅ Storage upload successful:`, data);
    
    // Get public URL
    const url = getDocumentUrl(data.path);
    console.log(`🔧 Generated URL: ${url}`);
    
    const result = {
      path: data.path,
      url: url || ''
    };
    
    console.log(`✅ uploadDocument returning:`, result);
    return result;
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
  try {
    const normalizedPath = normalizeStoragePath(filePath);
    
    const { error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove([normalizedPath]);
      
    if (error) {
      console.error('Delete error:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting document:', error);
    return false;
  }
};

/**
 * Get document file size and metadata
 * @param filePath - Path of the file
 * @returns File info or null
 */
export const getDocumentInfo = async (filePath: string) => {
  try {
    const normalizedPath = normalizeStoragePath(filePath);
    
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .list(normalizedPath.split('/').slice(0, -1).join('/'), {
        search: normalizedPath.split('/').pop()
      });
      
    if (error || !data || data.length === 0) {
      return null;
    }
    
    return data[0];
  } catch (error) {
    console.error('Error getting document info:', error);
    return null;
  }
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
    const safePermitNumber = permitNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
    const filePath = `permits/${permitId}/permit-${safePermitNumber}.pdf`;

    console.log("📤 Uploading permit PDF to storage:", { bucket: DOCUMENTS_BUCKET, filePath });

    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filePath, pdfBlob, {
        cacheControl: "3600",
        upsert: true,
        contentType: "application/pdf",
      });

    if (error || !data?.path) {
      console.error("❌ Failed to upload permit PDF:", error);
      return null;
    }

    const url = getDocumentUrl(data.path) || "";
    return { path: data.path, url };
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
    const safeContractNumber = String(contractNumber || "contract").replace(/[^a-zA-Z0-9-_]/g, "_");
    const filePath = `permits/${permitId}/terms-${safeContractNumber}.pdf`;

    console.log("📤 Uploading terms PDF to storage:", { bucket: DOCUMENTS_BUCKET, filePath });

    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filePath, pdfBlob, {
        cacheControl: "3600",
        upsert: true,
        contentType: "application/pdf",
      });

    if (error || !data?.path) {
      console.error("❌ Failed to upload terms PDF:", error);
      return null;
    }

    const url = getDocumentUrl(data.path) || "";
    return { path: data.path, url };
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
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(normalizedPath);
    if (error || !data) {
      console.error("❌ Storage download failed:", error);
      return null;
    }
    return data;
  } catch (error) {
    console.error("❌ Error downloading from storage:", error);
    return null;
  }
}