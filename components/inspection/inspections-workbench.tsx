"use client";

import { useState } from "react";
import { StaffSubTabs } from "@/components/shared/staff-sub-tabs";
import { ActivePermitsInspectionTab } from "@/components/inspection/active-permits-inspection-tab";
import { StaffInspectionsTab } from "@/components/inspection/staff-inspections-tab";

export function InspectionsWorkbench() {
  const [tab, setTab] = useState<"permits" | "inspections">("permits");

  return (
    <div className="space-y-6">
      <StaffSubTabs
        value={tab}
        onValueChange={(v) => setTab(v as any)}
        tabs={[
          { value: "permits", label: "Permits" },
          { value: "inspections", label: "Inspections" },
        ]}
      />

      {tab === "permits" ? <ActivePermitsInspectionTab /> : <StaffInspectionsTab />}
    </div>
  );
}


