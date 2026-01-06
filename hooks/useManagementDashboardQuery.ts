"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProvinceType, WaterPurpose, WaterSourceType } from "@/types/database";
import { getManagementDashboardData, type ManagementDashboardData } from "@/lib/management-dashboard";

export type ManagementPeriod = "monthly" | "quarterly" | "annually";

export type ManagementDashboardFilters = {
  period: ManagementPeriod;
  from?: string;
  to?: string;
  province: ProvinceType | "all";
  district: string | "all";
  sector: string | "all";
  catchment1: string | "all";
  catchment2: string | "all";
  waterSource: WaterSourceType | "all";
  waterPurpose: WaterPurpose | "all";
};

export function useManagementDashboardQuery(filters: ManagementDashboardFilters) {
  return useQuery<ManagementDashboardData, Error>({
    queryKey: ["management-dashboard", filters],
    queryFn: async () => getManagementDashboardData(filters),
  });
}


