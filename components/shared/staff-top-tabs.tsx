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
        <div className="border-b-2 border-border">
          <div className="overflow-x-auto">
            <TabsList className="bg-transparent p-0 h-auto rounded-none inline-flex w-max justify-start gap-10">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className={cn(
                    "flex-none",
                    "relative h-auto rounded-none bg-transparent px-1 pb-4 pt-4 text-base font-semibold text-muted-foreground shadow-none border-0 transition-colors duration-150",
                    "hover:text-foreground/80",
                    "data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none",
                    "after:absolute after:left-0 after:right-0 after:-bottom-[2px] after:h-[3px] after:rounded-full after:bg-transparent after:transition-colors after:duration-150",
                    "data-[state=active]:after:bg-primary"
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


