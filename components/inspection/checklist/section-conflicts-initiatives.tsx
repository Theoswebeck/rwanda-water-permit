/**
 * Sections 10-11: Water Use Conflicts & Catchment Protection Initiatives
 * Inspector input sections for conflicts and environmental initiatives
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Leaf } from "lucide-react";

interface ConflictsInitiativesSectionProps {
  data: {
    waterUseConflicts?: string;
    conflictSeverity?: string;
    catchmentProtectionInitiatives?: string;
    protectionPhotosTaken?: boolean;
  };
  onChange: (field: string, value: any) => void;
}

export function ConflictsInitiativesSection({ data, onChange }: ConflictsInitiativesSectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Section 10: Water Use Conflicts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Section 10: Water Use Conflicts *
          </CardTitle>
          <CardDescription>
            Description of any water use conflicts in the area
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="conflicts">Conflict Description *</Label>
            <Textarea
              id="conflicts"
              placeholder="Describe any conflicts with other water users, disputes, complaints, or issues identified. If none, write 'None identified'."
              value={data.waterUseConflicts || ''}
              onChange={(e) => onChange('waterUseConflicts', e.target.value)}
              rows={5}
              required
            />
          </div>

          {data.waterUseConflicts && data.waterUseConflicts.toLowerCase() !== 'none' && data.waterUseConflicts.toLowerCase() !== 'none identified' && (
            <div>
              <Label htmlFor="conflict-severity">Conflict Severity</Label>
              <Select 
                value={data.conflictSeverity || ''} 
                onValueChange={(value) => onChange('conflictSeverity', value)}
              >
                <SelectTrigger id="conflict-severity">
                  <SelectValue placeholder="Select severity level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">🟢 Low - Minor disagreements</SelectItem>
                  <SelectItem value="medium">🟡 Medium - Notable disputes</SelectItem>
                  <SelectItem value="high">🔴 High - Serious conflicts requiring intervention</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-xs text-blue-800">
              💡 <strong>Examples:</strong> Downstream impacts, competing uses, access disputes, pollution concerns, seasonal conflicts
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 11: Catchment Protection Initiatives */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Leaf className="h-5 w-5" />
            Section 11: Catchment Protection Initiatives
          </CardTitle>
          <CardDescription>
            Initiatives by the water user to protect the catchment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="initiatives">Protection Initiatives</Label>
            <Textarea
              id="initiatives"
              placeholder="Describe any environmental protection measures, reforestation, erosion control, buffer zones, water quality monitoring, or conservation efforts. If none, write 'None observed'."
              value={data.catchmentProtectionInitiatives || ''}
              onChange={(e) => onChange('catchmentProtectionInitiatives', e.target.value)}
              rows={5}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="protection-photos"
              checked={data.protectionPhotosTaken || false}
              onCheckedChange={(checked) => onChange('protectionPhotosTaken', checked)}
            />
            <Label htmlFor="protection-photos" className="text-sm font-normal cursor-pointer">
              📸 Pictures of protection measures taken
            </Label>
          </div>

          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-xs text-green-800">
              🌱 <strong>Examples:</strong> Tree planting, terracing, wetland restoration, waste management, community awareness programs
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

