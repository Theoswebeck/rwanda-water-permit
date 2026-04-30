"use client";

import type { ManagementDashboardFilters } from "@/hooks/useManagementDashboardQuery";

type KeyCount = { key: string; label: string; count: number; percentage: number };
type KeyCountNoPct = { key: string; label: string; count: number };

export type ManagementDashboardData = {
  portfolio: {
    kpis: {
      totalApplications: number;
      submittedApplications: number;
      inProcessApplications: number;
      pendingReviewApplications: number;
      pendingVerificationApplications: number;
      pendingFinalApprovalApplications: number;
      totalPermits: number;
      operational: number;
      expired: number;
      cancelled: number;
      expiringSoon: number;
      newPermitsIssued: number;
      // Deprecated, retained for type compatibility (always 0 or aliased to operational)
      active: number;
      suspended: number;
      revoked: number;
    };
    distributions: {
      byWaterSource: KeyCount[];
      byUse: KeyCount[];
      byStatusBucket: Array<{
        key: "operational" | "expired" | "cancelled" | "expiring_soon";
        label: string;
        count: number;
      }>;
      byCatchment1: KeyCountNoPct[];
      byCatchment2: KeyCountNoPct[];
      byProvince: KeyCountNoPct[];
      byDistrict: KeyCountNoPct[];
      bySector: KeyCountNoPct[];
    };
    workflow: {
      pendingByStage: KeyCountNoPct[];
    };
  };
  abstraction: {
    totalPermittedM3PerDay: number;
    totalPermittedM3PerYear: number;
    pressureByCatchment: Array<{
      key: string;
      label: string;
      permittedM3PerDay: number;
      index: number;
      flag: "ok" | "watch" | "stressed";
    }>;
  };
  compliance: {
    holders: { fullyCompliant: number; partiallyCompliant: number; nonCompliant: number };
    inspections: {
      conducted: number;
      violationsDetected: number;
      enforcementActionsTaken: number;
      recommendationBreakdown: Array<{ key: string; label: string; count: number }>;
    };
    parameters: Array<{
      key: string;
      label: string;
      numerator: number;
      denominator: number;
      percentage: number;
    }>;
    alerts: Array<{
      id: string;
      type: "over_abstraction" | "expired_permit" | "non_reporting" | "other";
      severity: "low" | "medium" | "high";
      title: string;
      subtitle: string;
    }>;
  };
  feedback: {
    totalSubmissions: number;
    averageRating: number | null;
    ratingBreakdown: Array<{ rating: number; count: number }>;
    recent: Array<{
      id: string;
      applicationId: string | null;
      applicationNumber: string | null;
      projectTitle: string | null;
      province: string | null;
      district: string | null;
      sector: string | null;
      rating: number | null;
      feedbackText: string | null;
      createdAt: string;
    }>;
  };
  meta: {
    permitsScopeNote: string;
    warnings: string[];
  };
};

function buildSearchParams(filters: ManagementDashboardFilters): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set("period", filters.period);
  if (filters.from) sp.set("from", filters.from);
  if (filters.to) sp.set("to", filters.to);
  if (filters.province !== "all") sp.set("province", String(filters.province));
  if (filters.district !== "all") sp.set("district", String(filters.district));
  if (filters.sector !== "all") sp.set("sector", String(filters.sector));
  if (filters.catchment1 !== "all") sp.set("catchment1", String(filters.catchment1));
  if (filters.catchment2 !== "all") sp.set("catchment2", String(filters.catchment2));
  if (filters.waterSource !== "all") sp.set("waterSource", String(filters.waterSource));
  if (filters.waterPurpose !== "all") sp.set("waterPurpose", String(filters.waterPurpose));
  return sp;
}

export async function getManagementDashboardData(
  filters: ManagementDashboardFilters
): Promise<ManagementDashboardData> {
  const sp = buildSearchParams(filters);
  const res = await fetch(`/api/management/dashboard?${sp.toString()}`, {
    credentials: "include",
  });
  if (!res.ok) {
    let message = `Failed to load management dashboard (${res.status})`;
    try {
      const json = (await res.json()) as { message?: string };
      if (json?.message) message = json.message;
    } catch {
      // body wasn't JSON; fall through with default message
    }
    throw new Error(message);
  }
  return (await res.json()) as ManagementDashboardData;
}
