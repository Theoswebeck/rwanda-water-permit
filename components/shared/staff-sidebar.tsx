"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ClipboardCheck,
  Droplets,
  FileCheck,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type StaffNavItem = {
  value: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  badge?: React.ReactNode;
};

// The section menu shared by the reviewer / assessor / verifier / approver dashboards.
export function staffNavItems(permittingValue: string): StaffNavItem[] {
  return [
    { value: permittingValue, label: "Permitting", icon: FileCheck, group: "Workflow" },
    { value: "inspections", label: "Inspections", icon: ClipboardCheck, group: "Workflow" },
    { value: "water-reports", label: "Water Use Reports", icon: Droplets, group: "Workflow" },
    { value: "permit-registry", label: "Permit Registry", icon: BookOpen, group: "Registries" },
  ];
}

/**
 * Staff dashboard navigation shell: renders as a clean, full-width horizontal tab strip
 * so data tables, maps, and workbenches always have 100% full-screen width.
 */
export function StaffSidebar({
  value,
  onValueChange,
  items,
  children,
  className,
  showTopNav = false,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: StaffNavItem[];
  children: React.ReactNode;
  className?: string;
  showTopNav?: boolean;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      className={cn("flex flex-col gap-6 w-full", className)}
    >
      {showTopNav && (
        <nav aria-label="Dashboard sections" className="w-full">
          <TabsList className="h-auto w-full flex flex-wrap items-center justify-start gap-1.5 overflow-x-auto rounded-xl border border-slate-200/80 bg-white p-2 shadow-xs">
            {items.map(({ value: v, label, icon: Icon, badge }) => (
              <TabsTrigger
                key={v}
                value={v}
                className="h-10 flex-none inline-flex items-center gap-2 px-3.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 data-[state=active]:bg-[#0072bc] data-[state=active]:text-white data-[state=active]:shadow-xs transition-all cursor-pointer"
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                {badge != null && <span className="ml-1.5">{badge}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </nav>
      )}

      <div className="w-full min-w-0 space-y-6">{children}</div>
    </Tabs>
  );
}
