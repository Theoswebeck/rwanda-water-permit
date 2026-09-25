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
    // UAT: Inspection Registry is prod-only, so it is intentionally left out here.
  ];
}

/**
 * Staff dashboard shell: a sticky sidebar menu on wide screens (xl+) that collapses
 * to a horizontally scrollable strip below that, so tables keep their full width. The active section's content
 * is rendered as children.
 */
export function StaffSidebar({
  value,
  onValueChange,
  items,
  children,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: StaffNavItem[];
  children: React.ReactNode;
  className?: string;
}) {
  const groups: Array<{ label?: string; items: StaffNavItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.label === item.group) last.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }

  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      orientation="vertical"
      className={cn("flex flex-col gap-6 xl:flex-row xl:items-start", className)}
    >
      <nav aria-label="Dashboard sections" className="xl:sticky xl:top-24 xl:w-56 xl:shrink-0">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border bg-card p-2 shadow-sm xl:flex-col xl:items-stretch xl:overflow-visible">
          {groups.map((group, i) => (
            <div
              key={group.label ?? i}
              className={cn("contents xl:flex xl:flex-col xl:gap-0.5", i > 0 && "xl:mt-3")}
            >
              {group.label && (
                <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground xl:block">
                  {group.label}
                </p>
              )}
              {group.items.map(({ value: v, label, icon: Icon, badge }) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="h-9 flex-none justify-start gap-2.5 px-3 text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0"
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{label}</span>
                  {badge != null && <span className="ml-auto pl-2">{badge}</span>}
                </TabsTrigger>
              ))}
            </div>
          ))}
        </TabsList>
      </nav>

      <div className="min-w-0 flex-1 space-y-6">{children}</div>
    </Tabs>
  );
}
