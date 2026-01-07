"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function StaffSubTabs({
  value,
  onValueChange,
  tabs,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  tabs: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className={cn("w-full", className)}>
      <TabsList className="w-fit justify-start">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="flex-none px-4">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}


