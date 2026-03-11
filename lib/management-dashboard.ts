"use client";

import { supabase } from "@/lib/supabase";
import {
  consolidatePermitRecords,
  createConsolidatedPermitFromPermit,
  createConsolidatedPermitFromRegistry,
  type ConsolidatedPermitRecord,
  type PermitDashboardPermitRow,
  type PermitDashboardRegistryRow,
} from "@/lib/permit/consolidated-permit-records";
import type { Application, Inspection, Permit, ProvinceType } from "@/types/database";
import type { ManagementDashboardFilters } from "@/hooks/useManagementDashboardQuery";

type KeyCount = { key: string; label: string; count: number; percentage: number };

type KeyCountNoPct = { key: string; label: string; count: number };

type AlertSeverity = "low" | "medium" | "high";
type AlertType = "over_abstraction" | "expired_permit" | "non_reporting" | "other";
type PortalFeedbackRow = {
  id: string;
  application_id: string | null;
  rating: number | null;
  feedback_text: string | null;
  feedback_type: string | null;
  created_at: string;
};

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
      active: number;
      expired: number;
      suspended: number;
      revoked: number;
      expiringSoon: number;
      newPermitsIssued: number;
    };
    distributions: {
      byWaterSource: KeyCount[];
      byUse: KeyCount[];
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
      index: number; // 0..1 normalized (relative)
      flag: "ok" | "watch" | "stressed";
    }>;
  };
  compliance: {
    holders: {
      fullyCompliant: number;
      partiallyCompliant: number;
      nonCompliant: number;
    };
    inspections: {
      conducted: number;
      violationsDetected: number;
      enforcementActionsTaken: number;
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
      type: AlertType;
      severity: AlertSeverity;
      title: string;
      subtitle: string;
    }>;
  };
  feedback: {
    totalSubmissions: number;
    averageRating: number | null;
    ratingBreakdown: Array<{
      rating: number;
      count: number;
    }>;
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
};

function parseDateMaybe(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function withinDateRange(date: Date | undefined, from: Date | undefined, to: Date | undefined) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function labelWaterSource(source: string): string {
  const map: Record<string, string> = {
    river: "Stream/River",
    stream: "Stream/River",
    lake: "Lake",
    groundwater: "Groundwater",
    borehole: "Groundwater (Borehole)",
    surface_water: "Dam/Reservoir",
    dam: "Dam/Reservoir",
    reservoir: "Dam/Reservoir",
    spring: "Spring",
    wetland: "Wetland",
    other: "Other",
  };
  return map[source] || source;
}

function labelWaterPurpose(purpose: string): string {
  const map: Record<string, string> = {
    domestic: "Domestic supply",
    irrigation: "Irrigation",
    industrial: "Industry",
    electricity_generation: "Hydropower",
    mining: "Mining",
    aquaculture: "Fish farming",
    fish_farming_lakes: "Fish farming (lakes)",
    fish_farming_ponds: "Fish farming (ponds)",
    recreation: "Recreation",
    municipal_supply: "Municipal supply",
    livestock: "Livestock",
    other: "Other",
  };
  return map[purpose] || purpose;
}

function labelProvince(province: ProvinceType | string | null | undefined): string {
  if (!province) return "Unknown";
  return String(province);
}

function toKeyCount(items: Array<{ key: string; label: string; count: number }>): KeyCount[] {
  const total = items.reduce((s, x) => s + x.count, 0) || 1;
  return items
    .map((x) => ({ ...x, percentage: (x.count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

function toKeyCountNoPct(items: Array<{ key: string; label: string; count: number }>): KeyCountNoPct[] {
  return items.sort((a, b) => b.count - a.count);
}

function normalizeUnit(unitRaw: string | null | undefined) {
  return (unitRaw || "").toLowerCase().replace(/\s+/g, "");
}

function convertAllowanceToM3PerDay(value: number, unitRaw: string | null | undefined): number | null {
  const unit = normalizeUnit(unitRaw);
  if (!Number.isFinite(value)) return null;

  // Common patterns we see in UIs: m³/day, m3/day, m3_per_day, m³/day (with unicode)
  if (unit.includes("m3/day") || unit.includes("m³/day") || unit.includes("m3perday") || unit.includes("m³perday")) return value;
  if (unit.includes("m3/year") || unit.includes("m³/year") || unit.includes("m3peryear") || unit.includes("m³peryear")) return value / 365;
  if (unit.includes("m3/month") || unit.includes("m³/month") || unit.includes("m3permonth") || unit.includes("m³permonth")) return value / 30;

  // L/s to m3/day: (L/s * 0.001 m3/L) * 86400 s/day
  if (unit.includes("l/s") || unit.includes("lps") || unit.includes("litre/second") || unit.includes("liter/second")) return value * 0.001 * 86400;

  // m3/s to m3/day
  if (unit.includes("m3/s") || unit.includes("m³/s") || unit.includes("m3persecond") || unit.includes("m³persecond")) return value * 86400;

  return null;
}

function sumPermittedM3PerDay(permits: Array<{ waterAllowance: number | null; allowanceUnit: string | null }>) {
  return permits.reduce((sum, p) => {
    const converted = convertAllowanceToM3PerDay(p.waterAllowance ?? Number.NaN, p.allowanceUnit);
    return sum + (converted ?? 0);
  }, 0);
}

function permitAlertLocation(permit: ConsolidatedPermitRecord): string {
  if (permit.district || permit.sector) {
    return `${permit.district ?? "N/A"}, ${permit.sector ?? "N/A"}`;
  }
  return permit.locationSummary || permit.permitHolder || "N/A";
}

function uniqueLatestCompletedInspectionsByApplication(inspections: Inspection[]): Map<string, Inspection> {
  const byApp = new Map<string, Inspection>();
  for (const insp of inspections) {
    const completedAt = insp.completed_date ? new Date(insp.completed_date) : new Date(insp.updated_at || insp.created_at);
    const prev = byApp.get(insp.application_id);
    if (!prev) {
      byApp.set(insp.application_id, insp);
      continue;
    }
    const prevCompletedAt = prev.completed_date ? new Date(prev.completed_date) : new Date(prev.updated_at || prev.created_at);
    if (completedAt > prevCompletedAt) byApp.set(insp.application_id, insp);
  }
  return byApp;
}

function classifyCompliance(insp: Inspection): "fully" | "partial" | "non" {
  const checks = [
    insp.volume_limits_respected === true,
    insp.location_verified === true,
    insp.reporting_up_to_date === true || insp.reports_submitted === true,
    insp.fees_paid === true || insp.fees_payment_verified === true,
  ];
  const passed = checks.filter(Boolean).length;
  if (passed === checks.length) return "fully";
  if (passed === 0) return "non";
  return "partial";
}

function isViolation(insp: Inspection): boolean {
  if (insp.regulatory_compliance === false) return true;
  if (insp.volume_limits_respected === false) return true;
  if (insp.location_verified === false) return true;
  if (insp.reports_submitted === false || insp.reporting_up_to_date === false) return true;
  if (insp.fees_paid === false || insp.fees_payment_verified === false) return true;

  if (typeof insp.actual_quantity === "number" && typeof insp.allowed_quantity === "number") {
    if (insp.actual_quantity > insp.allowed_quantity) return true;
  }
  return false;
}

function isMissingRelationError(err: unknown, tableName: string): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { message?: string; details?: string; hint?: string };
  const msg = `${maybe.message ?? ""} ${maybe.details ?? ""} ${maybe.hint ?? ""}`.toLowerCase();
  // Typical Postgres error: relation "public.<table>" does not exist
  return msg.includes("does not exist") && msg.includes(tableName.toLowerCase());
}

export async function getManagementDashboardData(filters: ManagementDashboardFilters): Promise<ManagementDashboardData> {
  const from = parseDateMaybe(filters.from);
  const to = parseDateMaybe(filters.to);

  const { data: applicationsRaw, error: appsError } = await supabase
    .from("applications")
    .select(
      "id,application_number,project_title,status,province,district,sector,catchment_name_level_1,catchment_name_level_2,water_source,water_purpose,created_at,submitted_at"
    )
    .order("created_at", { ascending: false });

  if (appsError) throw appsError;
  const applications = (applicationsRaw || []) as unknown as Application[];

  const filteredApplications = applications.filter((a) => {
    if (filters.province !== "all" && a.province !== filters.province) return false;
    if (filters.district !== "all" && (a.district || "").toLowerCase() !== String(filters.district).toLowerCase()) return false;
    if (filters.sector !== "all" && (a.sector || "").toLowerCase() !== String(filters.sector).toLowerCase()) return false;
    if (filters.catchment1 !== "all" && (a.catchment_name_level_1 || "").toLowerCase() !== String(filters.catchment1).toLowerCase()) return false;
    if (filters.catchment2 !== "all" && (a.catchment_name_level_2 || "").toLowerCase() !== String(filters.catchment2).toLowerCase()) return false;
    if (filters.waterSource !== "all" && a.water_source !== filters.waterSource) return false;
    if (filters.waterPurpose !== "all" && a.water_purpose !== filters.waterPurpose) return false;

    const date = new Date(a.submitted_at || a.created_at);
    if ((from || to) && !withinDateRange(date, from, to)) return false;
    return true;
  });

  const applicationIdSet = new Set(filteredApplications.map((a) => a.id));
  const applicationById = new Map(filteredApplications.map((a) => [a.id, a]));

  const totalApplications = filteredApplications.length;
  const submittedApplications = filteredApplications.filter((a) => String(a.status) === "submitted").length;
  const pendingReviewApplications = filteredApplications.filter((a) => String(a.status) === "pending_review").length;
  const pendingVerificationApplications = filteredApplications.filter((a) => String(a.status) === "pending_verification").length;
  const pendingFinalApprovalApplications = filteredApplications.filter((a) => String(a.status) === "pending_final_approval").length;
  const inProcessApplications = filteredApplications.filter((a) => {
    const s = String(a.status);
    return ["under_review", "pending_assessment", "pending_inspection"].includes(s);
  }).length;

  // Permits table may be absent in early setups; degrade gracefully.
  let permitsAll: Permit[] = [];
  const { data: permitsRaw, error: permitsError } = await supabase
    .from("permits")
    .select("id,application_id,permit_number,status,water_source,purpose,water_allowance,allowance_unit,issued_date,expiry_date,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (permitsError) {
    if (!isMissingRelationError(permitsError, "permits")) {
      throw permitsError;
    }
    console.warn("ℹ️ management-dashboard: permits table missing; permit metrics will be empty until created.");
  } else {
    permitsAll = (permitsRaw || []) as unknown as Permit[];
  }

  let registryAll: PermitDashboardRegistryRow[] = [];
  const { data: registryRaw, error: registryError } = await supabase
    .from("permit_registry")
    .select("id,permit_number,status,water_source,authorized_activity,volume_or_area,issuance_date,expiration_date,created_at,updated_at,latitude,longitude,permit_holder,location")
    .order("created_at", { ascending: false });

  if (registryError) {
    if (!isMissingRelationError(registryError, "permit_registry")) {
      throw registryError;
    }
    console.warn("ℹ️ management-dashboard: permit_registry table missing; registry-backed permit metrics will be empty.");
  } else {
    registryAll = (registryRaw || []) as PermitDashboardRegistryRow[];
  }

  const permitDashboardRows: PermitDashboardPermitRow[] = permitsAll.map((permit) => {
    const app = applicationById.get(permit.application_id);
    return {
      id: permit.id,
      application_id: permit.application_id,
      permit_number: permit.permit_number,
      status: permit.status,
      water_source: permit.water_source,
      purpose: permit.purpose,
      water_allowance: permit.water_allowance,
      allowance_unit: permit.allowance_unit,
      issued_date: permit.issued_date,
      expiry_date: permit.expiry_date,
      created_at: permit.created_at,
      updated_at: permit.updated_at,
      province: app?.province ?? null,
      district: app?.district ?? null,
      sector: app?.sector ?? null,
      catchment_name_level_1: app?.catchment_name_level_1 ?? null,
      catchment_name_level_2: app?.catchment_name_level_2 ?? null,
      lat: null,
      lng: null,
      permit_holder: app?.project_title ?? null,
      location: [app?.district, app?.sector, app?.province].filter(Boolean).join(", ") || null,
    };
  });

  const permits = consolidatePermitRecords(
    [
      ...permitDashboardRows.map(createConsolidatedPermitFromPermit),
      ...registryAll.map(createConsolidatedPermitFromRegistry),
    ].filter((record): record is ConsolidatedPermitRecord => Boolean(record))
  ).filter((permit) => {
    if (filters.province !== "all" && permit.province !== filters.province) return false;
    if (filters.district !== "all" && (permit.district || "").toLowerCase() !== String(filters.district).toLowerCase()) return false;
    if (filters.sector !== "all" && (permit.sector || "").toLowerCase() !== String(filters.sector).toLowerCase()) return false;
    if (filters.catchment1 !== "all" && (permit.catchment1 || "").toLowerCase() !== String(filters.catchment1).toLowerCase()) return false;
    if (filters.catchment2 !== "all" && (permit.catchment2 || "").toLowerCase() !== String(filters.catchment2).toLowerCase()) return false;
    if (filters.waterSource !== "all" && permit.waterSource !== filters.waterSource) return false;
    if (filters.waterPurpose !== "all" && permit.purpose !== filters.waterPurpose) return false;

    const permitDate = parseDateMaybe(permit.issuedDate || permit.createdAt || undefined);
    if ((from || to) && permitDate && !withinDateRange(permitDate, from, to)) return false;
    return true;
  });

  // Inspections table may not exist in some deployments yet. In that case, treat as empty
  // so the rest of the dashboard still renders (portfolio/workflow/permits).
  let inspectionsAll: Inspection[] = [];
  const { data: inspectionsRaw, error: inspectionsError } = await supabase
    .from("inspections")
    .select(
      "id,application_id,status,result,created_at,updated_at,completed_date,volume_limits_respected,location_verified,reporting_up_to_date,reports_submitted,fees_paid,fees_payment_verified,regulatory_compliance,actual_quantity,actual_unit,allowed_quantity,allowed_unit"
    )
    .order("created_at", { ascending: false });

  if (inspectionsError) {
    if (!isMissingRelationError(inspectionsError, "inspections")) {
      throw inspectionsError;
    }
    console.warn("ℹ️ management-dashboard: inspections table missing; compliance metrics will be empty until created.");
  } else {
    inspectionsAll = (inspectionsRaw || []) as unknown as Inspection[];
  }

  const inspections = inspectionsAll.filter((i) => {
    if (!applicationIdSet.has(i.application_id)) return false;
    const date = i.completed_date ? new Date(i.completed_date) : new Date(i.created_at);
    if ((from || to) && !withinDateRange(date, from, to)) return false;
    return true;
  });

  const { data: feedbackRaw, error: feedbackError } = await supabase
    .from("portal_feedback")
    .select("id,application_id,rating,feedback_text,feedback_type,created_at")
    .eq("feedback_type", "terms_acceptance")
    .order("created_at", { ascending: false });

  if (feedbackError) throw feedbackError;

  const feedbackEntries = ((feedbackRaw || []) as PortalFeedbackRow[]).filter((entry) => {
    if (!entry.application_id || !applicationIdSet.has(entry.application_id)) return false;
    const createdAt = parseDateMaybe(entry.created_at);
    if ((from || to) && !withinDateRange(createdAt, from, to)) return false;
    return true;
  });

  // =========================
  // A) Portfolio
  // =========================
  const permitStatusCounts = permits.reduce(
    (acc, p) => {
      const key = String(p.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalPermits = permits.length;
  const newPermitsIssued = permits.filter((p) => {
    const issued = p.issuedDate ? new Date(p.issuedDate) : undefined;
    if (!issued) return false;
    if (from || to) return withinDateRange(issued, from, to);

    // If no explicit range, interpret by "period" as "current period"
    const now = new Date();
    if (filters.period === "monthly") return issued.getFullYear() === now.getFullYear() && issued.getMonth() === now.getMonth();
    if (filters.period === "quarterly") {
      const q = Math.floor(now.getMonth() / 3);
      const iq = Math.floor(issued.getMonth() / 3);
      return issued.getFullYear() === now.getFullYear() && iq === q;
    }
    return issued.getFullYear() === now.getFullYear();
  }).length;

  const byWaterSourceMap = new Map<string, { key: string; label: string; count: number }>();
  for (const p of permits) {
    const key = String(p.waterSource);
    const row = byWaterSourceMap.get(key) || { key, label: labelWaterSource(key), count: 0 };
    row.count += 1;
    byWaterSourceMap.set(key, row);
  }

  const byUseMap = new Map<string, { key: string; label: string; count: number }>();
  for (const p of permits) {
    const key = String(p.purpose);
    const row = byUseMap.get(key) || { key, label: labelWaterPurpose(key), count: 0 };
    row.count += 1;
    byUseMap.set(key, row);
  }

  const byCatchment1Map = new Map<string, { key: string; label: string; count: number }>();
  const byCatchment2Map = new Map<string, { key: string; label: string; count: number }>();
  const byProvinceMap = new Map<string, { key: string; label: string; count: number }>();
  const byDistrictMap = new Map<string, { key: string; label: string; count: number }>();
  const bySectorMap = new Map<string, { key: string; label: string; count: number }>();

  for (const p of permits) {
    const c1 = p.catchment1 || "Unknown";
    const c2 = p.catchment2 || "Unknown";
    const prov = labelProvince(p.province);
    const dist = p.district || "Unknown";
    const sect = p.sector || "Unknown";

    const r1 = byCatchment1Map.get(c1) || { key: c1, label: c1, count: 0 };
    r1.count += 1;
    byCatchment1Map.set(c1, r1);

    const r2 = byCatchment2Map.get(c2) || { key: c2, label: c2, count: 0 };
    r2.count += 1;
    byCatchment2Map.set(c2, r2);

    const rp = byProvinceMap.get(prov) || { key: prov, label: prov, count: 0 };
    rp.count += 1;
    byProvinceMap.set(prov, rp);

    const rd = byDistrictMap.get(dist) || { key: dist, label: dist, count: 0 };
    rd.count += 1;
    byDistrictMap.set(dist, rd);

    const rs = bySectorMap.get(sect) || { key: sect, label: sect, count: 0 };
    rs.count += 1;
    bySectorMap.set(sect, rs);
  }

  const stageCounts: Array<{ key: string; label: string; statuses: string[] }> = [
    { key: "submitted", label: "Submitted", statuses: ["submitted"] },
    { key: "pending_assessment", label: "Pending assessment", statuses: ["pending_assessment"] },
    { key: "pending_review", label: "Pending review", statuses: ["pending_review"] },
    { key: "pending_verification", label: "Pending verification", statuses: ["pending_verification"] },
    { key: "pending_final_approval", label: "Pending final approval", statuses: ["pending_final_approval"] },
  ];

  const pendingByStage = stageCounts.map((s) => {
    const count = filteredApplications.filter((a) => s.statuses.includes(String(a.status))).length;
    return { key: s.key, label: s.label, count };
  });

  // =========================
  // B) Abstraction
  // =========================
  const totalPermittedM3PerDay = sumPermittedM3PerDay(permits);
  const totalPermittedM3PerYear = totalPermittedM3PerDay * 365;

  const permittedByCatchment: Record<string, number> = {};
  for (const p of permits) {
    const c1 = p.catchment1 || "Unknown";
    const m3Day = convertAllowanceToM3PerDay(p.waterAllowance ?? Number.NaN, p.allowanceUnit) ?? 0;
    permittedByCatchment[c1] = (permittedByCatchment[c1] || 0) + m3Day;
  }
  const maxCatchment = Math.max(0, ...Object.values(permittedByCatchment));
  const pressureByCatchment = Object.entries(permittedByCatchment)
    .map(([key, permittedM3PerDay]) => {
      const index = maxCatchment > 0 ? permittedM3PerDay / maxCatchment : 0;
      const flag: "ok" | "watch" | "stressed" = index >= 0.8 ? "stressed" : index >= 0.5 ? "watch" : "ok";
      return { key, label: key, permittedM3PerDay, index, flag };
    })
    .sort((a, b) => b.permittedM3PerDay - a.permittedM3PerDay);

  // =========================
  // C) Compliance
  // =========================
  const completedInspections = inspections.filter((i) => i.status === "completed" || Boolean(i.completed_date));
  const latestByApp = uniqueLatestCompletedInspectionsByApplication(completedInspections);
  let fullyCompliant = 0;
  let partiallyCompliant = 0;
  let nonCompliant = 0;

  let violationsDetected = 0;

  const denom = latestByApp.size;
  let volumeOk = 0;
  let locationOk = 0;
  let reportingOk = 0;
  let feesOk = 0;

  for (const insp of latestByApp.values()) {
    const cls = classifyCompliance(insp);
    if (cls === "fully") fullyCompliant += 1;
    else if (cls === "partial") partiallyCompliant += 1;
    else nonCompliant += 1;

    if (isViolation(insp)) violationsDetected += 1;

    if (insp.volume_limits_respected === true) volumeOk += 1;
    if (insp.location_verified === true) locationOk += 1;
    if (insp.reporting_up_to_date === true || insp.reports_submitted === true) reportingOk += 1;
    if (insp.fees_paid === true || insp.fees_payment_verified === true) feesOk += 1;
  }

  const parameters = [
    { key: "volume_limits", label: "Volume limits", numerator: volumeOk, denominator: denom },
    { key: "abstraction_location", label: "Abstraction point location", numerator: locationOk, denominator: denom },
    { key: "meter_reporting", label: "Meter installation & reporting", numerator: reportingOk, denominator: denom },
    { key: "fee_payment", label: "Fee payment status", numerator: feesOk, denominator: denom },
  ].map((p) => ({
    ...p,
    percentage: p.denominator > 0 ? (p.numerator / p.denominator) * 100 : 0,
  }));

  const alerts: ManagementDashboardData["compliance"]["alerts"] = [];

  // Expired/expiring permits
  for (const p of permits) {
    if (p.status === "expired" || p.status === "expiring_soon") {
      alerts.push({
        id: `permit:${p.permitId}:${p.status}`,
        type: "expired_permit",
        severity: p.status === "expired" ? "high" : "medium",
        title: p.status === "expired" ? "Expired permit" : "Permit expiring soon",
        subtitle: `${p.permitNumber} • ${permitAlertLocation(p)}`,
      });
    }
  }

  // Over-abstraction + non-reporting from latest inspections
  for (const [appId, insp] of latestByApp.entries()) {
    const app = applicationById.get(appId);

    if (typeof insp.actual_quantity === "number" && typeof insp.allowed_quantity === "number" && insp.actual_quantity > insp.allowed_quantity) {
      alerts.push({
        id: `insp:${insp.id}:over`,
        type: "over_abstraction",
        severity: "high",
        title: "Over-abstraction detected",
        subtitle: `${app?.district ?? "N/A"}, ${app?.sector ?? "N/A"} • actual ${insp.actual_quantity} > allowed ${insp.allowed_quantity}`,
      });
    }

    if (insp.reports_submitted === false || insp.reporting_up_to_date === false) {
      alerts.push({
        id: `insp:${insp.id}:nonreport`,
        type: "non_reporting",
        severity: "medium",
        title: "Non-reporting user",
        subtitle: `${app?.district ?? "N/A"}, ${app?.sector ?? "N/A"} • reports missing/out of date`,
      });
    }
  }

  const ratedFeedback = feedbackEntries.filter((entry) => typeof entry.rating === "number" && entry.rating >= 1 && entry.rating <= 5);
  const averageRating = ratedFeedback.length > 0
    ? ratedFeedback.reduce((sum, entry) => sum + Number(entry.rating || 0), 0) / ratedFeedback.length
    : null;

  const ratingBreakdown = [5, 4, 3, 2, 1].map((rating) => ({
    rating,
    count: feedbackEntries.filter((entry) => entry.rating === rating).length,
  }));

  const recentFeedback = feedbackEntries.map((entry) => {
    const application = entry.application_id ? applicationById.get(entry.application_id) : undefined;
    return {
      id: entry.id,
      applicationId: entry.application_id,
      applicationNumber: application?.application_number || null,
      projectTitle: application?.project_title || null,
      province: application?.province || null,
      district: application?.district || null,
      sector: application?.sector || null,
      rating: entry.rating,
      feedbackText: entry.feedback_text,
      createdAt: entry.created_at,
    };
  });

  return {
    portfolio: {
      kpis: {
        totalApplications,
        submittedApplications,
        inProcessApplications,
        pendingReviewApplications,
        pendingVerificationApplications,
        pendingFinalApprovalApplications,
        totalPermits,
        active: permitStatusCounts["active"] || 0,
        expired: permitStatusCounts["expired"] || 0,
        suspended: permitStatusCounts["suspended"] || 0,
        revoked: permitStatusCounts["revoked"] || 0,
        expiringSoon: permitStatusCounts["expiring_soon"] || 0,
        newPermitsIssued,
      },
      distributions: {
        byWaterSource: toKeyCount(Array.from(byWaterSourceMap.values())),
        byUse: toKeyCount(Array.from(byUseMap.values())),
        byCatchment1: toKeyCountNoPct(Array.from(byCatchment1Map.values())),
        byCatchment2: toKeyCountNoPct(Array.from(byCatchment2Map.values())),
        byProvince: toKeyCountNoPct(Array.from(byProvinceMap.values())),
        byDistrict: toKeyCountNoPct(Array.from(byDistrictMap.values())),
        bySector: toKeyCountNoPct(Array.from(bySectorMap.values())),
      },
      workflow: { pendingByStage },
    },
    abstraction: {
      totalPermittedM3PerDay,
      totalPermittedM3PerYear,
      pressureByCatchment,
    },
    compliance: {
      holders: { fullyCompliant, partiallyCompliant, nonCompliant },
      inspections: {
        conducted: completedInspections.length,
        violationsDetected,
        enforcementActionsTaken: 0,
      },
      parameters,
      alerts: alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1)),
    },
    feedback: {
      totalSubmissions: feedbackEntries.length,
      averageRating,
      ratingBreakdown,
      recent: recentFeedback,
    },
  };
}


