/**
 * Sections 2-3: Activity & Permit Details
 * Read-only sections displaying activity and permit information
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, Calendar } from "lucide-react";
import { formatDate } from "@/lib/inspection-utils";

interface ActivityPermitSectionProps {
  data: {
    activityType: string;
    activityStartingDate?: string;
    permitNumber: string;
    issuanceDate?: string;
    expirationDate?: string;
  };
}

export function ActivityPermitSection({ data }: ActivityPermitSectionProps) {
  const isPermitExpired = data.expirationDate 
    ? new Date(data.expirationDate) < new Date()
    : false;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Section 2: Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Section 2: Activity in Which Water is Used
          </CardTitle>
          <CardDescription>
            Water usage activity information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Type of Activity</Label>
            <p className="text-sm font-medium">{data.activityType}</p>
          </div>
          {data.activityStartingDate && (
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Starting Date</Label>
              <p className="text-sm">{formatDate(data.activityStartingDate)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Permit Particulars */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Section 3: Permit Particulars
          </CardTitle>
          <CardDescription>
            Permit details and validity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Permit Number</Label>
            <p className="text-sm font-medium">{data.permitNumber}</p>
          </div>
          {data.issuanceDate && (
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Issuance Date</Label>
              <p className="text-sm">{formatDate(data.issuanceDate)}</p>
            </div>
          )}
          {data.expirationDate && (
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Expiration Date</Label>
              <div className="flex items-center gap-2">
                <p className="text-sm">{formatDate(data.expirationDate)}</p>
                {isPermitExpired && (
                  <Badge variant="destructive" className="text-xs">Expired</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

