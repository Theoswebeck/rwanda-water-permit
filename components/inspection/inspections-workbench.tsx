"use client";

import { StaffInspectionsTab } from "@/components/inspection/staff-inspections-tab";

interface InspectionsWorkbenchProps {
  roleContext?: string;
}

export function InspectionsWorkbench({ roleContext }: InspectionsWorkbenchProps) {
  return (
    <div className="space-y-6">
      <StaffInspectionsTab roleContext={roleContext} />
    </div>
  );
}


