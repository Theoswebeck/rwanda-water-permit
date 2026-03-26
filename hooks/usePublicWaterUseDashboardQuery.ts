"use client";

import { useQuery } from "@tanstack/react-query";

export type PublicWaterUseDashboardQuery = {
  q?: string;
  province?: string;
  district?: string;
  sector?: string;
  water_source?: string;
  purpose?: string;
  status?: string;
  includeExpired?: boolean;
  from?: string;
  to?: string;
};

export type PublicWaterUseDashboardResponse = {
  snapshot: {
    totalPermitsIssued: number;
    statusCounts: Record<string, number>;
    waterUseBySector: Array<{ key: string; label: string; percentage: number; count: number }>;
    permitsByWaterSource: Array<{ key: string; label: string; percentage: number; count: number }>;
    permitsByProvince: Array<{ key: string; label: string; count: number; percentage: number }>;
    permitsByCatchment: Array<{ key: string; label: string; count: number; percentage: number }>;
    permitsByDistrict: Array<{
      province: string;
      districts: Array<{ key: string; label: string; count: number; percentage: number }>;
    }>;
    trend: Array<{ month: string; permitsIssued: number }>;
    permitsIssuedThisMonth: number;
    permitsIssuedLastMonth: number;
    permitsIssuedMoMPercent: number | null;
    permitsIssuedYoYPercent: number | null;
  };
  map: {
    catchments: Array<{
      catchment: string;
      count: number;
      lat: number;
      lng: number;
      topWaterSource: string | null;
      topPurpose: string | null;
    }>;
  };
  generatedAt: string;
};

function toSearchParams(q: PublicWaterUseDashboardQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  return params.toString();
}

export function usePublicWaterUseDashboardQuery(query: PublicWaterUseDashboardQuery) {
  return useQuery<PublicWaterUseDashboardResponse, Error>({
    queryKey: ["public-water-use-dashboard", query],
    queryFn: async () => {
      const qs = toSearchParams(query);
      const res = await fetch(`/api/public/water-use-dashboard?${qs}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to load public dashboard");
      }
      return (await res.json()) as PublicWaterUseDashboardResponse;
    },
  });
}


