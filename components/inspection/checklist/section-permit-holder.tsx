/**
 * Section 1: Permit Holder Identification
 * Read-only section displaying permit holder information
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { User } from "lucide-react";

interface PermitHolderSectionProps {
  data: {
    permitHolderName: string;
    permitHolderId: string;
    residence: string;
    representative: string;
    contacts: string;
  };
}

export function PermitHolderSection({ data }: PermitHolderSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Section 1: Permit Holder Identification
        </CardTitle>
        <CardDescription>
          Information from application records
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Name</Label>
            <p className="text-sm font-medium">{data.permitHolderName}</p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">ID / TIN Number</Label>
            <p className="text-sm">{data.permitHolderId}</p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Residence / Address</Label>
            <p className="text-sm">{data.residence}</p>
          </div>
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Representative</Label>
            <p className="text-sm">{data.representative}</p>
          </div>
          <div className="md:col-span-2">
            <Label className="text-sm font-medium text-muted-foreground">Contacts (Tel & Email)</Label>
            <p className="text-sm">{data.contacts}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


