"use client";

import { ReactNode } from "react";
import { RwbDashboardLayout } from "@/components/layout/rwb-dashboard-layout";

interface DashboardLayoutProps {
  children: ReactNode;
  /** Wider page for dashboards with wide tables, maps, or workbenches. */
  wide?: boolean;
}

/**
 * Standard Institutional Dashboard Layout for Rwanda Water Resources Board.
 * Provides the fixed 60px header, collapsible 80px/260px mini-sidebar,
 * fixed blue footer, and full role-based navigation.
 */
export function DashboardLayout({ children, wide = false }: DashboardLayoutProps) {
  return <RwbDashboardLayout wide={wide}>{children}</RwbDashboardLayout>;
}
