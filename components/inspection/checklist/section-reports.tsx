/**
 * Section 9: Reports Submission
 * Inspector verification of required reports
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, CheckCircle, XCircle } from "lucide-react";

interface ReportsSectionProps {
  data: {
    reportsSubmitted?: boolean;
    reportsSubmissionDate?: string;
    reportsReferenceNumber?: string;
    reportsProof?: string;
  };
  onChange: (field: string, value: any) => void;
}

export function ReportsSection({ data, onChange }: ReportsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Section 9: Reports *
        </CardTitle>
        <CardDescription>
          Verification of required report submissions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="reports-submitted">Reports Submitted *</Label>
          <Select 
            value={data.reportsSubmitted === true ? 'yes' : data.reportsSubmitted === false ? 'no' : ''} 
            onValueChange={(value) => onChange('reportsSubmitted', value === 'yes')}
          >
            <SelectTrigger id="reports-submitted">
              <SelectValue placeholder="Have required reports been submitted?" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>✅ Yes - Reports Submitted</span>
                </div>
              </SelectItem>
              <SelectItem value="no">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span>❌ No - Reports Not Submitted</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {data.reportsSubmitted === true && (
          <>
            <div>
              <Label htmlFor="submission-date">Submission Date</Label>
              <Input
                id="submission-date"
                type="date"
                value={data.reportsSubmissionDate || ''}
                onChange={(e) => onChange('reportsSubmissionDate', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="reference-number">Reference Number</Label>
              <Input
                id="reference-number"
                placeholder="Report reference or tracking number"
                value={data.reportsReferenceNumber || ''}
                onChange={(e) => onChange('reportsReferenceNumber', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="reports-proof">Proof of Reception</Label>
              <Textarea
                id="reports-proof"
                placeholder="Details of how reports were received (email confirmation, receipt, acknowledgment letter)..."
                value={data.reportsProof || ''}
                onChange={(e) => onChange('reportsProof', e.target.value)}
                rows={3}
              />
            </div>
          </>
        )}

        {data.reportsSubmitted === false && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-900">
              ⚠️ <strong>Reports Not Submitted:</strong> This is a compliance violation. Document the reason and include in recommendations.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

