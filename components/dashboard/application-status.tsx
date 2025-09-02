"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import type { Application } from "@/types/database";

interface ApplicationStatusProps {
  applications: Application[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function ApplicationStatus({ applications, loading = false, onRefresh }: ApplicationStatusProps) {
  // Calculate statistics from applications
  const stats = {
    total: applications.length,
    pending: applications.filter(app => ['submitted', 'under_review', 'pending_assessment'].includes(app.status)).length,
    approved: applications.filter(app => app.status === 'approved').length,
    rejected: applications.filter(app => app.status === 'rejected').length,
    draft: applications.filter(app => app.status === 'draft').length,
    revisionRequired: applications.filter(app => app.status === 'revision_required').length,
  };

  // Calculate this month's activity
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const thisMonthApps = applications.filter(app => {
    const appDate = new Date(app.created_at);
    return appDate.getMonth() === currentMonth && appDate.getFullYear() === currentYear;
  }).length;

  // Calculate approval rate
  const totalProcessed = stats.approved + stats.rejected;
  const approvalRate = totalProcessed > 0 ? Math.round((stats.approved / totalProcessed) * 100) : 0;

  const statusCards = [
    {
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
      title: "In Progress",
      value: stats.pending,
      description: "Applications under review",
      detail: "Awaiting processing",
      change: stats.pending > 0 ? `${Math.round((stats.pending / stats.total) * 100)}%` : "0%",
      changeLabel: "Of total applications",
      trend: stats.pending > stats.total * 0.7 ? "down" : "up",
      icon: Clock,
      color: "text-amber-600",
      bgColor: "bg-amber-50",
    },
    {
      title: "Approved",
      value: stats.approved,
      description: "Successfully approved applications",
      detail: "Ready for permit issuance",
      change: approvalRate > 0 ? `${approvalRate}%` : "0%",
      changeLabel: "Approval rate",
      trend: approvalRate > 80 ? "up" : approvalRate > 60 ? "neutral" : "down",
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    // Removed Processing Time panel per RWB request
  ];

  const getRecentApplications = () => {
    return applications
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="bg-gray-100 text-gray-700">Draft</Badge>;
      case "submitted":
        return <Badge variant="outline" className="bg-blue-100 text-blue-700">Submitted</Badge>;
      case "under_review":
        return <Badge variant="outline" className="bg-amber-100 text-amber-700">Under Review</Badge>;
      case "pending_assessment":
        return <Badge variant="outline" className="bg-purple-100 text-purple-700">Pending Assessment</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-100 text-green-700">Approved</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-100 text-red-700">Rejected</Badge>;
      case "revision_required":
        return <Badge variant="outline" className="bg-orange-100 text-orange-700">Revision Required</Badge>;
      case "cancelled":
        return <Badge variant="outline" className="bg-gray-100 text-gray-700">Cancelled</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatApplicationType = (type: string) => {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

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
              <Card>
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

      {/* Recent Applications */}
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-lg font-semibold">Recent Applications</CardTitle>
                <CardDescription>Latest application submissions</CardDescription>
              </div>
              {onRefresh && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRefresh}
                  disabled={loading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {getRecentApplications().length > 0 ? (
                getRecentApplications().map((application) => (
                  <div
                    key={application.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${statusCards[0].bgColor}`}>
                          <FileText className={`h-4 w-4 ${statusCards[0].color}`} />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">
                            {application.project_title}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {application.application_number || application.id.slice(0, 8)} • {formatApplicationType(application.application_type)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {application.district}, {application.province}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(application.status)}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(application.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="leading-relaxed [&:not(:first-child)]:mt-6 font-medium">No applications yet</p>
                  <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-sm">Your applications will appear here once you create them.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>


      </div>
    </div>
  );
} 