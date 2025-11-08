/**
 * Section 12: Overall Assessment and Recommendations
 * Final inspector assessment section
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck } from "lucide-react";

interface OverallAssessmentSectionProps {
  data: {
    complianceStatus?: string;
    generalConclusion?: string;
    recommendations?: string;
  };
  onChange: (field: string, value: any) => void;
}

export function OverallAssessmentSection({ data, onChange }: OverallAssessmentSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Section 12: General Conclusion and Recommendations *
        </CardTitle>
        <CardDescription>
          Final assessment and inspector recommendations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="compliance-status">Overall Compliance Status *</Label>
          <Select 
            value={data.complianceStatus || ''} 
            onValueChange={(value) => onChange('complianceStatus', value)}
          >
            <SelectTrigger id="compliance-status">
              <SelectValue placeholder="Select overall compliance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compliant">
                ✅ Fully Compliant - All conditions met
              </SelectItem>
              <SelectItem value="minor_issues">
                🟡 Minor Issues - Small violations, corrective actions needed
              </SelectItem>
              <SelectItem value="major_issues">
                🟠 Major Issues - Significant violations, immediate action required
              </SelectItem>
              <SelectItem value="non_compliant">
                🔴 Non-Compliant - Serious violations, permit suspension recommended
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="general-conclusion">General Conclusion *</Label>
          <Textarea
            id="general-conclusion"
            placeholder="Provide a comprehensive summary of the inspection findings, highlighting key observations, compliance status, and overall assessment of the permit holder's operations..."
            value={data.generalConclusion || ''}
            onChange={(e) => onChange('generalConclusion', e.target.value)}
            rows={5}
            required
          />
          <p className="text-xs text-muted-foreground mt-1">
            Include: site conditions, infrastructure status, water usage compliance, environmental impact, and adherence to permit conditions
          </p>
        </div>

        <div>
          <Label htmlFor="recommendations">Recommendations</Label>
          <Textarea
            id="recommendations"
            placeholder="Provide specific recommendations for corrective actions, improvements, follow-up inspections, permit modifications, or compliance measures..."
            value={data.recommendations || ''}
            onChange={(e) => onChange('recommendations', e.target.value)}
            rows={5}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Be specific about what actions are needed, by when, and what the consequences of non-compliance might be
          </p>
        </div>

        {/* Compliance indicator */}
        {data.complianceStatus && (
          <div className={`p-4 rounded-lg border ${
            data.complianceStatus === 'compliant' ? 'bg-green-50 border-green-200' :
            data.complianceStatus === 'minor_issues' ? 'bg-yellow-50 border-yellow-200' :
            data.complianceStatus === 'major_issues' ? 'bg-orange-50 border-orange-200' :
            'bg-red-50 border-red-200'
          }`}>
            <p className={`text-sm font-medium ${
              data.complianceStatus === 'compliant' ? 'text-green-900' :
              data.complianceStatus === 'minor_issues' ? 'text-yellow-900' :
              data.complianceStatus === 'major_issues' ? 'text-orange-900' :
              'text-red-900'
            }`}>
              {data.complianceStatus === 'compliant' && '✅ Permit holder is compliant with all conditions'}
              {data.complianceStatus === 'minor_issues' && '⚠️ Minor compliance issues identified'}
              {data.complianceStatus === 'major_issues' && '🚨 Major compliance issues requiring immediate attention'}
              {data.complianceStatus === 'non_compliant' && '🛑 Serious violations - consider permit suspension or revocation'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

