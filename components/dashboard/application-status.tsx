"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import type { Application } from "@/types/database";

interface ApplicationStatusProps {
  applications: Application[];
  loading?: boolean;
  onRefresh?: () => void;
  activeFilter?: "all" | "in_progress" | "approved" | "expired";
  onFilterChange?: (filter: "all" | "in_progress" | "approved" | "expired") => void;
}

export function ApplicationStatus({
  applications,
  loading = false,
  activeFilter = "all",
  onFilterChange,
}: ApplicationStatusProps) {
  const getDisplayStatus = (app: Application): string => {
    // UI-only status mapping from parent (e.g., applicant dashboard).
    // Fall back to raw status if not provided.
    // Critical: when the raw status is approved_pending_permit, always show it (do not map to under_review).
    if (app.status === "approved_pending_permit") return "approved_pending_permit";
    return (app as any).display_status ?? app.status;
  };

  // Calculate statistics from applications
  const stats = {
    total: applications.length,
    inProgress: applications.filter(app => ['submitted', 'under_review', 'revision_required', 'pending_payment'].includes(getDisplayStatus(app))).length,
    approved: applications.filter(app => ['approved', 'approved_pending_permit'].includes(getDisplayStatus(app))).length,
    expired: applications.filter(app => getDisplayStatus(app) === 'expired').length,
  };

  // Calculate this month's activity
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const thisMonthApps = applications.filter(app => {
    const appDate = new Date(app.created_at);
    return appDate.getMonth() === currentMonth && appDate.getFullYear() === currentYear;
  }).length;

  // Applicants only see: submitted, under_review, approved, expired.
  // Keep the "Approved" card metric meaningful without relying on internal-only statuses.
  const approvedRateOfTotal = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;

  const statusCards = [
    {
      key: "all" as const,
      title: "Total Applications",
      value: stats.total,
      description: "All applications submitted",
      detail: "Complete application history",
      change: thisMonthApps > 0 ? `+${thisMonthApps}` : "0",
      changeLabel: "This month",
      trend: thisMonthApps > 0 ? "up" : "neutral",
      icon: FileText,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      key: "in_progress" as const,
      title: "In Progress",
      value: stats.inProgress,
      description: "Applications under review",
      detail: "Awaiting processing",
      change: stats.inProgress > 0 ? `${Math.round((stats.inProgress / stats.total) * 100)}%` : "0%",
      changeLabel: "Of total applications",
      trend: stats.inProgress > stats.total * 0.7 ? "down" : "up",
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      key: "approved" as const,
      title: "Approved",
      value: stats.approved,
      description: "Successfully approved applications",
      detail: "Ready for permit issuance",
      change: approvedRateOfTotal > 0 ? `${approvedRateOfTotal}%` : "0%",
      changeLabel: "Of total applications",
      trend: approvedRateOfTotal > 80 ? "up" : approvedRateOfTotal > 60 ? "neutral" : "down",
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      key: "expired" as const,
      title: "Expired",
      value: stats.expired,
      description: "Expired applications",
      detail: "Past validity period",
      change: stats.expired > 0 ? `${Math.round((stats.expired / stats.total) * 100)}%` : "0%",
      changeLabel: "Of total applications",
      trend: stats.expired > 0 ? "down" : "neutral",
      icon: AlertCircle,
      color: "text-slate-700",
      bgColor: "bg-slate-50",
    },
    // Removed Processing Time panel per RWB request
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
      {/* Main Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statusCards.map((card, index) => {
          const Icon = card.icon;
          const TrendIcon = card.trend === "up" ? TrendingUp : card.trend === "down" ? TrendingDown : TrendingUp;
          const trendColor = card.trend === "up" ? "text-green-600" : card.trend === "down" ? "text-red-600" : "text-gray-600";
          
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
                  <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
} 