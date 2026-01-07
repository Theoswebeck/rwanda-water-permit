"use client";

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function StaffTopTabs({
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
    <div className={cn("w-full", className)}>
      <Tabs value={value} onValueChange={onValueChange} className="w-full">
        <div className="border-b">
          <div className="overflow-x-auto">
            <TabsList className="bg-transparent p-0 h-auto rounded-none inline-flex w-max justify-start gap-8">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className={cn(
                    // override shadcn TabsTrigger flex-1 so tabs do NOT stretch full width
                    "flex-none",
                    "relative h-auto rounded-none bg-transparent px-0 pb-3 pt-3 text-sm font-medium text-muted-foreground shadow-none border-0",
                    "data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                    "after:absolute after:left-0 after:right-0 after:-bottom-[1px] after:h-[2px] after:bg-transparent",
                    "data-[state=active]:after:bg-foreground"
                  )}
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>
      </Tabs>
    </div>
  );
}


