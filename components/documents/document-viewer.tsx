"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  Eye, 
  ExternalLink,
  Image,
  File,
  Archive,
  CheckCircle,
  Clock,
  XCircle
} from 'lucide-react';
import { 
  getDocumentUrl, 
  isViewableInBrowser, 
  getFileIcon, 
  formatFileSize 
} from '@/lib/supabase-storage';
import type { Document } from '@/types/database';

interface DocumentViewerProps {
  documents: Document[];
  title?: string;
  description?: string;
  allowDownload?: boolean;
  allowView?: boolean;
  showStatus?: boolean;
  emptyMessage?: string;
}

export function DocumentViewer({
  documents,
  title = "Documents",
  description = "Uploaded documents",
  allowDownload = true,
  allowView = true,
  showStatus = true,
  emptyMessage = "No documents uploaded yet"
}: DocumentViewerProps) {

  console.log('📄 DocumentViewer received documents:', documents);
  console.log('📄 DocumentViewer documents count:', documents?.length || 0);
  console.log('📄 DocumentViewer first document:', documents?.[0]);

  const handleView = (document: Document) => {
    const url = getDocumentUrl(document.file_path);
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      console.error('❌ Unable to generate document URL');
    }
  };

  const handleDownload = async (document: Document) => {
    const url = getDocumentUrl(document.file_path);
    if (url) {
      try {
        // Create a temporary anchor element for download
        const link = window.document.createElement('a');
        link.href = url;
        link.download = document.name;
        link.target = '_blank';
        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);
      } catch (error) {
        console.error('❌ Download failed:', error);
        // Fallback to opening in new tab
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      console.error('❌ Unable to generate download URL');
    }
  };

  const getDocumentIcon = (mimeType: string | null | undefined) => {
    const iconName = getFileIcon(mimeType);
    const className = "h-5 w-5";
    
    switch (iconName) {
      case 'image':
        return <Image className={`${className} text-green-600`} />;
      case 'archive':
        return <Archive className={`${className} text-orange-600`} />;
      case 'file-text':
        return <FileText className={`${className} text-blue-600`} />;
      default:
        return <File className={`${className} text-gray-600`} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  const formatDocumentType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (!documents || documents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">{emptyMessage}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {documents.map((doc, index) => (
            <div 
              key={doc.id || index} 
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  {getDocumentIcon(doc.mime_type)}
                </div>
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {doc.name}
                    </p>
                    {showStatus && (
                      <div>{getStatusBadge(doc.verification_status)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span>{formatDocumentType(doc.type)}</span>
                    <span>•</span>
                    <span>{formatFileSize(doc.file_size)}</span>
                    <span>•</span>
                    <span>
                      Uploaded {doc.upload_date ? new Date(doc.upload_date).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 ml-3">
                {allowView && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="gap-2"
                    onClick={() => handleView(doc)}
                    title={isViewableInBrowser(doc.mime_type) ? 'View in browser' : 'Download to view'}
                  >
                    {isViewableInBrowser(doc.mime_type) ? (
                      <>
                        <Eye className="h-4 w-4" />
                        View
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4" />
                        Open
                      </>
                    )}
                  </Button>
                )}
                
                {allowDownload && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="gap-2"
                    onClick={() => handleDownload(doc)}
                    title="Download document"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
} 