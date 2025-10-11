"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  FileText, 
  Calendar,
  User,
  MapPin,
  Loader2,
  Download,
  Eye
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

interface TechnicalAssessment {
  id: string;
  assessment_number: string;
  field_report_summary: string;
  location_verified: boolean;
  water_source_accessible: boolean;
  environmental_impact_assessed: boolean;
  technical_feasibility_confirmed: boolean;
  recommendation: 'yes' | 'no';
  explanation_text?: string;
  inspector_name: string;
  inspection_date: string;
  uploaded_files: string[];
  created_at: string;
  assessor?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface AssessorRecommendationProps {
  applicationId: string;
}

export function AssessorRecommendation({ applicationId }: AssessorRecommendationProps) {
  const [assessment, setAssessment] = useState<TechnicalAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssessment();
  }, [applicationId]);

  const fetchAssessment = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('technical_assessments')
        .select(`
          *,
          assessor:users!assessor_id(first_name, last_name, email)
        `)
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      setAssessment(data);
    } catch (err) {
      console.error('Error fetching technical assessment:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch assessment');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading assessor recommendation...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!assessment) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No technical assessment has been completed for this application yet. The application must undergo 
          field assessment before final approval.
        </AlertDescription>
      </Alert>
    );
  }

  const getRecommendationBadge = (recommendation: 'yes' | 'no') => {
    if (recommendation === 'yes') {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
          <CheckCircle className="h-4 w-4 mr-1" />
          Recommended for Approval
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
          <XCircle className="h-4 w-4 mr-1" />
          Not Recommended
        </Badge>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Assessment Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Technical Assessment Summary
            </CardTitle>
            {getRecommendationBadge(assessment.recommendation)}
          </div>
          <CardDescription>
            Assessment Number: {assessment.assessment_number}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>Inspector</span>
              </div>
              <p className="font-medium">{assessment.inspector_name}</p>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Inspection Date</span>
              </div>
              <p className="font-medium">
                {new Date(assessment.inspection_date).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>

            {assessment.assessor && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="h-4 w-4" />
                  <span>Assessor</span>
                </div>
                <p className="font-medium">
                  {assessment.assessor.first_name} {assessment.assessor.last_name}
                </p>
                <p className="text-sm text-muted-foreground">{assessment.assessor.email}</p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Assessment Submitted</span>
              </div>
              <p className="font-medium">
                {new Date(assessment.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Field Report */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Field Report Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{assessment.field_report_summary}</p>
        </CardContent>
      </Card>

      {/* Assessment Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assessment Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Location Verified</span>
              {assessment.location_verified ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Yes
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-100 text-gray-800">
                  <XCircle className="h-3 w-3 mr-1" />
                  No
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Water Source Accessible</span>
              {assessment.water_source_accessible ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Yes
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-100 text-gray-800">
                  <XCircle className="h-3 w-3 mr-1" />
                  No
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Environmental Impact Assessed</span>
              {assessment.environmental_impact_assessed ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Yes
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-100 text-gray-800">
                  <XCircle className="h-3 w-3 mr-1" />
                  No
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Technical Feasibility Confirmed</span>
              {assessment.technical_feasibility_confirmed ? (
                <Badge className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Yes
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-gray-100 text-gray-800">
                  <XCircle className="h-3 w-3 mr-1" />
                  No
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assessor Recommendation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Recommendation:</span>
            {getRecommendationBadge(assessment.recommendation)}
          </div>

          {assessment.recommendation === 'no' && assessment.explanation_text && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Explanation:</h4>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="whitespace-pre-wrap">
                  {assessment.explanation_text}
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded Files */}
      {assessment.uploaded_files && assessment.uploaded_files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Supporting Documents</CardTitle>
            <CardDescription>
              Detailed reports and photographic evidence from field assessment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assessment.uploaded_files.map((filePath, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {filePath.toLowerCase().includes('.pdf') ? (
                      <FileText className="h-4 w-4 text-red-600" />
                    ) : (
                      <Eye className="h-4 w-4 text-blue-600" />
                    )}
                    <span className="text-sm font-medium">
                      Document {index + 1}: {filePath.split('/').pop()}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Handle file download/view
                      window.open(`/api/documents/view?path=${encodeURIComponent(filePath)}`, '_blank');
                    }}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    View
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Important Notice for Approver */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Important:</strong> Please review the assessor's recommendation and supporting documentation 
          carefully before making a final approval decision. The technical assessment provides critical 
          information about field conditions, environmental impact, and technical feasibility.
        </AlertDescription>
      </Alert>
    </div>
  );
}

