"use client";

import { useState, useEffect } from "react";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { useDocuments } from "@/hooks/useDocuments";
import { getDocumentUrl } from "@/lib/supabase-storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, RefreshCw, AlertCircle, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { UserRole } from "@/types/database";

interface ApplicationDocumentsProps {
  applicationId: string;
  userRole?: UserRole;
  allowDownload?: boolean;
  allowView?: boolean;
  showStatus?: boolean;
  showRefresh?: boolean;
  className?: string;
}

export function ApplicationDocuments({
  applicationId,
  userRole = 'reviewer',
  allowDownload = true,
  allowView = true,
  showStatus = true,
  showRefresh = true,
  className = ""
}: ApplicationDocumentsProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const { documents, loading, error, getDocuments } = useDocuments();
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [missingDocIds, setMissingDocIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (applicationId && !documentsLoaded) {
      loadDocuments();
    }
  }, [applicationId, documentsLoaded]);

  // Best-effort: ask the server which document records point to files that
  // no longer exist (lost in the 2026-07-08 uploads incident) so we can
  // badge them honestly instead of letting "View" look like a system error.
  // `partial` means the server ran out of probe budget before checking every
  // document, so one retry usually settles the rest (already-probed files are
  // cheap the second time). Unverified documents are never badged — only a
  // confirmed miss is.
  const checkFileHealth = async (attempt = 0) => {
    try {
      const res = await fetch(
        `/api/dashboard/applications/${applicationId}/documents/health`,
        { cache: 'no-store', credentials: 'include' }
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success && Array.isArray(json.missingDocumentIds)) {
        setMissingDocIds(new Set(json.missingDocumentIds as string[]));
        if (json.partial && attempt === 0) {
          setTimeout(() => void checkFileHealth(1), 2000);
        }
      }
    } catch {
      // Health info is advisory only — never block the documents list.
    }
  };

  const loadDocuments = async () => {
    try {
      await getDocuments(applicationId);
      setDocumentsLoaded(true);
      void checkFileHealth();
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const handleRefresh = () => {
    setDocumentsLoaded(false);
    loadDocuments();
  };

  // Role-based permissions
  const getPermissions = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return {
          canView: true,
          canDownload: true,
          canDelete: true,
          showStatus: true,
          showAll: true
        };
      case 'approver':
        return {
          canView: true,
          canDownload: true,
          canDelete: false,
          showStatus: true,
          showAll: true
        };
      case 'reviewer':
        return {
          canView: true,
          canDownload: true,
          canDelete: false,
          showStatus: true,
          showAll: true
        };
      case 'inspector':
        return {
          canView: true,
          canDownload: true,
          canDelete: false,
          showStatus: true,
          showAll: true
        };
      case 'applicant':
        return {
          canView: true,
          canDownload: true,
          canDelete: false,
          showStatus: false,
          showAll: false
        };
      default:
        return {
          canView: true,
          canDownload: allowDownload,
          canDelete: false,
          showStatus: showStatus,
          showAll: true
        };
    }
  };

  const permissions = getPermissions(userRole);

  // Filter documents based on role (if needed)
  const filteredDocuments = permissions.showAll 
    ? documents 
    : documents.filter(doc => doc.verification_status !== 'rejected');

  if (loading && !documentsLoaded) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {tx("Application Documents")}
          </CardTitle>
          <CardDescription>
            {tx("Documents submitted with this application")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">{tx("Loading documents...")}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {tx("Application Documents")}
          </CardTitle>
          <CardDescription>
            {tx("Documents submitted with this application")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium text-red-800">{tx("Error Loading Documents")}</p>
                <p className="text-red-700">{error}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRefresh}
                  className="mt-2"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {tx("Retry")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Application Documents
                {filteredDocuments.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {filteredDocuments.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Documents submitted with this application
              </CardDescription>
            </div>
            {showRefresh && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRefresh}
                disabled={loading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {tx("Refresh")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredDocuments.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{tx("No documents uploaded yet")}</p>
              {userRole === 'applicant' && (
                <p className="text-sm text-muted-foreground mt-2">
                  {tx("Upload documents through the application form")}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDocuments.map((doc, index) => (
                <div 
                  key={doc.id || index} 
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">
                          {doc.name}
                        </p>
                        {permissions.showStatus && doc.verification_status && (
                          <Badge
                            variant={
                              doc.verification_status === 'verified' ? 'default' :
                              doc.verification_status === 'pending' ? 'secondary' :
                              'destructive'
                            }
                            className="text-xs"
                          >
                            {doc.verification_status}
                          </Badge>
                        )}
                        {doc.id && missingDocIds.has(doc.id) && (
                          <Badge
                            variant="outline"
                            className="text-xs gap-1 bg-amber-50 text-amber-800 border-amber-300"
                            title={tx("This document is missing from the server and is being recovered — contact RWB if urgent.")}
                          >
                            <AlertCircle className="h-3 w-3" />
                            {tx("File missing — being recovered")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span>{doc.type?.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>
                          {doc.file_size ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : tx('Size unknown')}
                        </span>
                        <span>•</span>
                        <span>
                          {tx("Uploaded")} {doc.upload_date ? new Date(doc.upload_date).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-3">
                    {permissions.canView && allowView && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2"
                        onClick={() => {
                          const url = getDocumentUrl(doc.file_path);
                          if (url) {
                            window.open(url, "_blank", "noopener,noreferrer");
                          }
                        }}
                        title={tx("View document")}
                      >
                        <FileText className="h-4 w-4" />
                        {tx("View")}
                      </Button>
                    )}
                    
                    {permissions.canDownload && allowDownload && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-2"
                        onClick={() => {
                          const url = getDocumentUrl(doc.file_path);
                          if (url) {
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = doc.name;
                            link.target = "_blank";
                            link.click();
                          }
                        }}
                        title={tx("Download document")}
                      >
                        <Download className="h-4 w-4" />
                        {tx("Download")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
