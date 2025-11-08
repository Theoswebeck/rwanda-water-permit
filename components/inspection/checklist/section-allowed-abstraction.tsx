/**
 * Section 5: Allowed Water Abstraction
 * Read-only section displaying permitted water abstraction limits
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Droplets } from "lucide-react";
import { formatQuantity } from "@/lib/inspection-utils";

interface AllowedAbstractionSectionProps {
  data: {
    allowedQuantity?: number;
    allowedUnit?: string;
    authorizedMethod?: string;
  };
}

export function AllowedAbstractionSection({ data }: AllowedAbstractionSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplets className="h-5 w-5" />
          Section 5: Allowed Water Abstraction/Surface Area
        </CardTitle>
        <CardDescription>
          Permitted water usage as per permit conditions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <Label className="text-sm font-medium text-blue-900">Quantity/Surface Area (As Per Permit)</Label>
            <p className="text-2xl font-bold text-blue-600 mt-1">
              {formatQuantity(data.allowedQuantity, data.allowedUnit)}
            </p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Authorized Abstraction Method</Label>
            <p className="text-sm">{data.authorizedMethod || 'As specified in permit conditions'}</p>
          </div>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-xs text-amber-800">
              📋 <strong>Note:</strong> Compare actual abstraction (Section 6) against these permitted limits
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

