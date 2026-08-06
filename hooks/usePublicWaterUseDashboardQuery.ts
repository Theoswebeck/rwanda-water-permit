"use client";

import { useQuery } from "@tanstack/react-query";

export type PublicDashboardBucket = {
  key: string;
  label: string;
  count: number;
  percentage: number;
};

export type PublicWaterUseDashboardResponse = {
  generatedAt: string;
  totals: {
    total: number;
    operational: number;
    expired: number;
    cancelled: number;
    expiringSoon: number;
  };
  byDistrict: PublicDashboardBucket[];
  byCatchment: PublicDashboardBucket[];
  byActivity: PublicDashboardBucket[];
  catchmentAttribution: {
    fromCoordinates: number;
    estimatedFromLocation: number;
    unattributed: number;
  };
};

export function usePublicWaterUseDashboardQuery() {
  return useQuery<PublicWaterUseDashboardResponse, Error>({
    queryKey: ["public-water-use-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/public/water-use-dashboard");
      if (!res.ok) {
        throw new Error(`Failed to load the water use dashboard (${res.status})`);
      }
      const json = await res.json();
      if (json?.error) throw new Error(String(json.error));
      return json as PublicWaterUseDashboardResponse;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
