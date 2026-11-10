import React from "react";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

export interface MetricCardData {
  title: string;
  value: string | number;
  change?: {
    value: number;
    trend: "up" | "down" | "neutral";
    label: string;
  };
  iconName: string;
  color?: "blue" | "green" | "amber" | "indigo" | "purple" | "red";
  description?: string;
}

export interface StatsCardProps {
  data: MetricCardData;
  className?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({ data, className }) => {
  const { title, value, change, iconName, color = "blue", description } = data;

  // Dynamically resolve lucide icon safely
  const IconComponent =
    (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[iconName] ||
    LucideIcons.Activity;

  const colorVariants = {
    blue: {
      bg: "bg-blue-50",
      text: "text-[#0072bc]",
      border: "border-blue-100",
      glow: "hover:border-[#0072bc]/40",
    },
    green: {
      bg: "bg-emerald-50",
      text: "text-emerald-600",
      border: "border-emerald-100",
      glow: "hover:border-emerald-300",
    },
    amber: {
      bg: "bg-amber-50",
      text: "text-amber-600",
      border: "border-amber-100",
      glow: "hover:border-amber-300",
    },
    indigo: {
      bg: "bg-indigo-50",
      text: "text-indigo-600",
      border: "border-indigo-100",
      glow: "hover:border-indigo-300",
    },
    purple: {
      bg: "bg-purple-50",
      text: "text-purple-600",
      border: "border-purple-100",
      glow: "hover:border-purple-300",
    },
    red: {
      bg: "bg-rose-50",
      text: "text-rose-600",
      border: "border-rose-100",
      glow: "hover:border-rose-300",
    },
  };

  const scheme = colorVariants[color] || colorVariants.blue;

  return (
    <div
      className={cn(
        "group bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs transition-all duration-200 hover:shadow-md",
        scheme.glow,
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>
        <div
          className={cn(
            "p-2.5 rounded-lg border",
            scheme.bg,
            scheme.text,
            scheme.border
          )}
        >
          <IconComponent className="w-5 h-5 shrink-0" />
        </div>
      </div>

      <div className="mt-3">
        <h3 className="text-2xl font-bold tracking-tight text-slate-900">
          {value}
        </h3>

        {change && (
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            {change.trend === "up" && (
              <span className="flex items-center font-semibold text-emerald-600">
                <LucideIcons.ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                +{change.value}%
              </span>
            )}
            {change.trend === "down" && (
              <span className="flex items-center font-semibold text-rose-600">
                <LucideIcons.ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                -{change.value}%
              </span>
            )}
            {change.trend === "neutral" && (
              <span className="font-semibold text-slate-500">0%</span>
            )}
            <span className="text-slate-400">{change.label}</span>
          </div>
        )}

        {description && (
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        )}
      </div>
    </div>
  );
};

