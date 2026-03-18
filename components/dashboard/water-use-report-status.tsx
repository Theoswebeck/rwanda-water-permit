"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ClipboardList,
  FileEdit,
  Send,
  CheckCircle2,
  Loader2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { WaterUseReportWithRelations } from "@/hooks/useWaterUseReports";

export type ReportStatusFilter = "all" | "draft" | "submitted" | "completed";

interface WaterUseReportStatusProps {
  reports: WaterUseReportWithRelations[];
  loading?: boolean;
  activeFilter?: ReportStatusFilter;
  onFilterChange?: (filter: ReportStatusFilter) => void;
}

export function WaterUseReportStatus({
  reports,
  loading = false,
  activeFilter = "all",
  onFilterChange,
}: WaterUseReportStatusProps) {
  const stats = {
    total: reports.length,
    draft: reports.filter((r) => r.status === "draft").length,
    submitted: reports.filter(
      (r) => r.status === "submitted" || r.status === "under_review"
    ).length,
    completed: reports.filter((r) => r.status === "completed").length,
  };

  const currentYear = new Date().getFullYear();
  const thisYearReports = reports.filter(
    (r) => r.reporting_year === currentYear
  ).length;

  const completionRate =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const statusCards = [
    {
      key: "all" as const,
      title: "Total Reports",
      value: stats.total,
      description: "All water use reports",
      change: thisYearReports > 0 ? `+${thisYearReports}` : "0",
      changeLabel: "This year",
      trend: thisYearReports > 0 ? ("up" as const) : ("neutral" as const),
      icon: ClipboardList,
      color: "text-blue-600",
    },
    {
      key: "draft" as const,
      title: "Draft",
      value: stats.draft,
      description: "Reports in progress",
      change:
        stats.total > 0
          ? `${Math.round((stats.draft / stats.total) * 100)}%`
          : "0%",
      changeLabel: "Of total reports",
      trend: stats.draft > 0 ? ("neutral" as const) : ("up" as const),
      icon: FileEdit,
      color: "text-amber-600",
    },
    {
      key: "submitted" as const,
      title: "Submitted",
      value: stats.submitted,
      description: "Submitted & under review",
      change:
        stats.total > 0
          ? `${Math.round((stats.submitted / stats.total) * 100)}%`
          : "0%",
      changeLabel: "Of total reports",
      trend: stats.submitted > 0 ? ("neutral" as const) : ("up" as const),
      icon: Send,
      color: "text-indigo-600",
    },
    {
      key: "completed" as const,
      title: "Completed",
      value: stats.completed,
      description: "Reports reviewed & completed",
      change: completionRate > 0 ? `${completionRate}%` : "0%",
      changeLabel: "Completion rate",
      trend:
        completionRate > 60
          ? ("up" as const)
          : completionRate > 0
            ? ("neutral" as const)
            : ("neutral" as const),
      icon: CheckCircle2,
      color: "text-green-600",
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statusCards.map((card, index) => {
          const Icon = card.icon;
          const TrendIcon =
            card.trend === "up"
              ? TrendingUp
              : card.trend === "down"
                ? TrendingDown
                : TrendingUp;
          const trendColor =
            card.trend === "up"
              ? "text-green-600"
              : card.trend === "down"
                ? "text-red-600"
                : "text-gray-600";

          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card
                role={onFilterChange ? "button" : undefined}
                tabIndex={onFilterChange ? 0 : undefined}
                onClick={() => onFilterChange?.(card.key)}
                onKeyDown={(event) => {
                  if (!onFilterChange) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onFilterChange(card.key);
                  }
                }}
                className={`transition-all duration-200 ${
                  onFilterChange ? "cursor-pointer" : ""
                } ${
                  activeFilter === card.key
                    ? "ring-2 ring-blue-500 border-blue-300 bg-blue-50/30"
                    : "hover:shadow-md"
                }`}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground mt-1">
                    <TrendIcon className={`h-3 w-3 ${trendColor}`} />
                    <span className={trendColor}>{card.change}</span>
                    <span>{card.changeLabel}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
