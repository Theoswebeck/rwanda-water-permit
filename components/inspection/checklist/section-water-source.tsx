/**
 * Section 4: Water Source Details
 * Read-only section displaying water source information
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";

interface WaterSourceSectionProps {
  data: {
    waterSourceName: string;
    waterSourceLocation: string;
    coordinates?: string;
    district: string;
    sector: string;
    cell: string;
    village?: string;
  };
}

export function WaterSourceSection({ data }: WaterSourceSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Section 4: Water Source
        </CardTitle>
        <CardDescription>
          Water source location and details
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Water Source Name/Type</Label>
            <p className="text-sm font-medium">{data.waterSourceName}</p>
          </div>
          {data.coordinates && (
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Coordinates</Label>
              <p className="text-sm font-mono text-xs">{data.coordinates}</p>
            </div>
          )}
          <div>
            <Label className="text-sm font-medium text-muted-foreground">District</Label>
            <p className="text-sm">{data.district}</p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Sector</Label>
            <p className="text-sm">{data.sector}</p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Cell</Label>
            <p className="text-sm">{data.cell}</p>
          </div>
          {data.village && (
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Village</Label>
              <p className="text-sm">{data.village}</p>
            </div>
          )}
          <div className="md:col-span-2">
            <Label className="text-sm font-medium text-muted-foreground">Full Location</Label>
            <p className="text-sm">{data.waterSourceLocation}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


