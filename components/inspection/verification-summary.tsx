"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown
} from "lucide-react";

export interface VerificationChecklist {
  locationVerified: boolean;
  waterSourceAccessible: boolean;
  environmentalImpactAssessed: boolean;
  technicalFeasibilityConfirmed: boolean;
  infrastructureAdequate: boolean;
}

export interface RecommendationData {
  recommendation: "yes" | "no" | null;
  explanationText: string;
}

interface VerificationSummaryProps {
  checklist: VerificationChecklist;
  recommendation: RecommendationData;
  onChecklistChange: (checklist: VerificationChecklist) => void;
  onRecommendationChange: (recommendation: RecommendationData) => void;
  readOnly?: boolean;
}

export function VerificationSummary({
  recommendation,
  onRecommendationChange,
  readOnly = false
}: VerificationSummaryProps) {
  const handleRecommendationChange = (value: "yes" | "no") => {
    onRecommendationChange({
      ...recommendation,
      recommendation: value,
      // Clear explanation if recommending yes
      explanationText: value === "yes" ? "" : recommendation.explanationText
    });
  };

  const handleExplanationChange = (text: string) => {
    onRecommendationChange({
      ...recommendation,
      explanationText: text
    });
  };

  return (
    <div className="space-y-6">
      {/* Recommendation Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ThumbsUp className="h-5 w-5" />
            Assessor Recommendation
          </CardTitle>
          <CardDescription>
            Based on your field assessment, provide your recommendation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recommendation Radio Group */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Your Recommendation *</Label>
            <RadioGroup
              value={recommendation.recommendation || ""}
              onValueChange={(value) => handleRecommendationChange(value as "yes" | "no")}
              disabled={readOnly}
              className="space-y-3"
            >
              <div
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                  recommendation.recommendation === "yes"
                    ? 'border-green-500 bg-green-50'
                    : 'border-muted hover:border-green-300'
                }`}
              >
                <RadioGroupItem 
                  value="yes" 
                  id="recommend-yes"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="recommend-yes"
                    className={`font-medium cursor-pointer flex items-center gap-2 ${
                      recommendation.recommendation === "yes" ? 'text-green-900' : ''
                    }`}
                  >
                    <ThumbsUp className={`h-5 w-5 ${
                      recommendation.recommendation === "yes" ? 'text-green-600' : 'text-muted-foreground'
                    }`} />
                    Yes - Recommend for Approval
                  </Label>
                  <p className={`text-sm ${
                    recommendation.recommendation === "yes" ? 'text-green-700' : 'text-muted-foreground'
                  }`}>
                    The application meets all requirements and should proceed to final approval
                  </p>
                </div>
              </div>

              <div
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                  recommendation.recommendation === "no"
                    ? 'border-red-500 bg-red-50'
                    : 'border-muted hover:border-red-300'
                }`}
              >
                <RadioGroupItem value="no" id="recommend-no" />
                <div className="flex-1">
                  <Label
                    htmlFor="recommend-no"
                    className={`font-medium cursor-pointer flex items-center gap-2 ${
                      recommendation.recommendation === "no" ? 'text-red-900' : ''
                    }`}
                  >
                    <ThumbsDown className={`h-5 w-5 ${
                      recommendation.recommendation === "no" ? 'text-red-600' : 'text-muted-foreground'
                    }`} />
                    No - Do Not Recommend for Approval
                  </Label>
                  <p className={`text-sm ${
                    recommendation.recommendation === "no" ? 'text-red-700' : 'text-muted-foreground'
                  }`}>
                    The application has issues that need to be addressed before approval
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Explanation Text (required if "No") */}
          {recommendation.recommendation === "no" && (
            <div className="space-y-2">
              <Label htmlFor="explanation" className="text-base font-medium">
                Explanation for Recommendation *
              </Label>
              <Textarea
                id="explanation"
                value={recommendation.explanationText}
                onChange={(e) => handleExplanationChange(e.target.value)}
                placeholder="Please explain the reasons for not recommending approval. Include specific issues, missing requirements, or concerns identified during the assessment..."
                rows={5}
                disabled={readOnly}
                required
              />
              <p className="text-xs text-muted-foreground">
                This explanation will be shared with the approver and may be communicated to the applicant.
              </p>
            </div>
          )}

          {/* Summary Banner */}
          {recommendation.recommendation && (
            <div className={`p-4 rounded-lg ${
              recommendation.recommendation === "yes"
                ? 'bg-green-100 border border-green-300'
                : 'bg-red-100 border border-red-300'
            }`}>
              <div className="flex items-center gap-2">
                {recommendation.recommendation === "yes" ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-700" />
                    <span className="font-medium text-green-900">
                      You are recommending this application for approval
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-700" />
                    <span className="font-medium text-red-900">
                      You are NOT recommending this application for approval
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Important Notice */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Important:</strong> Your recommendation will be reviewed by the approver before a final 
          decision is made. Ensure your recommendation is based on complete field assessment data.
        </AlertDescription>
      </Alert>
    </div>
  );
}
