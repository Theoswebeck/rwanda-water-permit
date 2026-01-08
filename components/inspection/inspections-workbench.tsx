"use client";

import { useState } from "react";
import { StaffSubTabs } from "@/components/shared/staff-sub-tabs";
import { ActivePermitsInspectionTab } from "@/components/inspection/active-permits-inspection-tab";
import { StaffInspectionsTab } from "@/components/inspection/staff-inspections-tab";
import { useAuth } from "@/contexts/AuthContext";
import { CreateInspectionDialog } from "@/components/inspection/create-inspection-dialog";

export function InspectionsWorkbench() {
  const [tab, setTab] = useState<"permits" | "inspections">("permits");
  const { userProfile } = useAuth();
  const isAssessor = userProfile?.role === "assessor";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <StaffSubTabs
          value={tab}
          onValueChange={(v) => setTab(v as any)}
          tabs={[
            { value: "permits", label: "Permits" },
            { value: "inspections", label: "Inspections" },
          ]}
        />

        {/* Button moved to StaffInspectionsTab */}
      </div>

      {tab === "permits" ? <ActivePermitsInspectionTab /> : <StaffInspectionsTab />}
    </div>
  );
}


