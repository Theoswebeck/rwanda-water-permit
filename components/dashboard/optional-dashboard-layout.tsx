"use client";

import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

interface OptionalDashboardLayoutProps {
  children: ReactNode;
  wide?: boolean;
}

/**
 * Wraps pages that can be accessed both by authenticated portal users (who should
 * keep their RWB Header, Role Sidebar Menu, and Institutional Footer) and by
 * unauthenticated public visitors (e.g. via QR code scan on a printed permit).
 */
export function OptionalDashboardLayout({
  children,
  wide = false,
}: OptionalDashboardLayoutProps) {
  const { isAuthenticated, loading } = useAuth();

  if (!loading && isAuthenticated) {
    return <DashboardLayout wide={wide}>{children}</DashboardLayout>;
  }

  return <>{children}</>;
}
