/**
 * Section 7: Wastewater Management System
 * Inspector input section for wastewater system assessment
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Recycle } from "lucide-react";

interface WastewaterSectionProps {
  data: {
    wastewaterSystemType?: string;
    wastewaterSystemEffectiveness?: string;
    wastewaterSystemPhotosTaken?: boolean;
    wastewaterNotes?: string;
  };
  onChange: (field: string, value: any) => void;
}

export function WastewaterSection({ data, onChange }: WastewaterSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Recycle className="h-5 w-5" />
          Section 7: Wastewater Management System
        </CardTitle>
        <CardDescription>
          Assessment of wastewater treatment and disposal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="system-type">Type of Wastewater System</Label>
          <Input
            id="system-type"
            placeholder="e.g., septic tank, treatment plant, natural filtration, none"
            value={data.wastewaterSystemType || ''}
            onChange={(e) => onChange('wastewaterSystemType', e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="system-effectiveness">Effectiveness of the System</Label>
          <Select 
            value={data.wastewaterSystemEffectiveness || ''} 
            onValueChange={(value) => onChange('wastewaterSystemEffectiveness', value)}
          >
            <SelectTrigger id="system-effectiveness">
              <SelectValue placeholder="Select effectiveness rating" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="excellent">🟢 Excellent - Fully functional</SelectItem>
              <SelectItem value="good">🟡 Good - Minor issues</SelectItem>
              <SelectItem value="fair">🟠 Fair - Needs improvement</SelectItem>
              <SelectItem value="poor">🔴 Poor - Major issues</SelectItem>
              <SelectItem value="none">❌ No system in place</SelectItem>
              <SelectItem value="not_applicable">⚪ Not Applicable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="wastewater-notes">Additional Notes</Label>
          <Textarea
            id="wastewater-notes"
            placeholder="Describe system condition, capacity, discharge points, environmental impact, maintenance status..."
            value={data.wastewaterNotes || ''}
            onChange={(e) => onChange('wastewaterNotes', e.target.value)}
            rows={4}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="wastewater-photos"
            checked={data.wastewaterSystemPhotosTaken || false}
            onCheckedChange={(checked) => onChange('wastewaterSystemPhotosTaken', checked)}
          />
          <Label htmlFor="wastewater-photos" className="text-sm font-normal cursor-pointer">
            📸 Pictures of wastewater system taken
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}

