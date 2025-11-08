/**
 * Section 6: Actual Water Abstraction
 * Inspector input section for actual water usage
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, AlertTriangle, CheckCircle } from "lucide-react";
import { formatQuantity, getUsageStatus } from "@/lib/inspection-utils";

interface ActualAbstractionSectionProps {
  data: {
    actualQuantity?: number;
    actualUnit?: string;
    actualAbstractionMethod?: string;
    measurementDeviceType?: string;
    measurementDeviceNotes?: string;
    measurementDevicePhotoTaken?: boolean;
  };
  allowedQuantity?: number;
  allowedUnit?: string;
  onChange: (field: string, value: any) => void;
}

export function ActualAbstractionSection({ data, allowedQuantity, allowedUnit, onChange }: ActualAbstractionSectionProps) {
  const usageStatus = getUsageStatus(data.actualQuantity, allowedQuantity);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Section 6: Actual Water Abstracted/Surface Area Covered *
        </CardTitle>
        <CardDescription>
          Inspector verification of actual water usage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comparison with allowed */}
        {allowedQuantity && (
          <div className="p-3 bg-gray-50 border rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Allowed (from permit)</p>
                <p className="text-sm font-semibold">{formatQuantity(allowedQuantity, allowedUnit)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={
                  usageStatus.status === 'compliant' ? 'default' : 
                  usageStatus.status === 'warning' ? 'secondary' : 'destructive'
                }>
                  {usageStatus.message}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Actual quantity */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="actual-quantity">Actual Quantity/Area *</Label>
            <Input
              id="actual-quantity"
              type="number"
              step="0.01"
              placeholder="Enter actual quantity"
              value={data.actualQuantity || ''}
              onChange={(e) => onChange('actualQuantity', parseFloat(e.target.value) || undefined)}
              required
            />
          </div>
          <div>
            <Label htmlFor="actual-unit">Unit *</Label>
            <Select value={data.actualUnit || allowedUnit || ''} onValueChange={(value) => onChange('actualUnit', value)}>
              <SelectTrigger id="actual-unit">
                <SelectValue placeholder="Select unit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m³/day">m³/day</SelectItem>
                <SelectItem value="m³/month">m³/month</SelectItem>
                <SelectItem value="m³/year">m³/year</SelectItem>
                <SelectItem value="liters/hour">liters/hour</SelectItem>
                <SelectItem value="liters/day">liters/day</SelectItem>
                <SelectItem value="m²">m² (surface area)</SelectItem>
                <SelectItem value="hectares">hectares</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Warning if exceeded */}
        {usageStatus.status === 'exceeded' && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-900">Permit Limit Exceeded</p>
              <p className="text-xs text-red-700">
                Actual usage exceeds the permitted limit. This should be documented in the compliance assessment.
              </p>
            </div>
          </div>
        )}

        {/* Actual abstraction method */}
        <div>
          <Label htmlFor="actual-method">Actual Abstraction Method</Label>
          <Input
            id="actual-method"
            placeholder="e.g., pump, gravity, manual"
            value={data.actualAbstractionMethod || ''}
            onChange={(e) => onChange('actualAbstractionMethod', e.target.value)}
          />
        </div>

        {/* Measurement device */}
        <div>
          <Label htmlFor="measurement-device">Type of Water Measurement Device in Place *</Label>
          <Input
            id="measurement-device"
            placeholder="e.g., flow meter, water meter, manual gauge"
            value={data.measurementDeviceType || ''}
            onChange={(e) => onChange('measurementDeviceType', e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="device-notes">Measurement Device Notes</Label>
          <Textarea
            id="device-notes"
            placeholder="Describe device condition, accuracy, calibration status, readings observed..."
            value={data.measurementDeviceNotes || ''}
            onChange={(e) => onChange('measurementDeviceNotes', e.target.value)}
            rows={3}
          />
        </div>

        {/* Photo checkbox */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="device-photo"
            checked={data.measurementDevicePhotoTaken || false}
            onCheckedChange={(checked) => onChange('measurementDevicePhotoTaken', checked)}
          />
          <Label htmlFor="device-photo" className="text-sm font-normal cursor-pointer">
            📸 Picture of measurement device taken
          </Label>
        </div>
      </CardContent>
    </Card>
  );
}

