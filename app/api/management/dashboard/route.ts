import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import {
  detectRegistrySchema,
  fetchRegistrySummary,
  fetchRegistryDistributions,
  fetchRegistryAbstraction,
  countNewlyIssued,
  type RegistryListFilters,
} from "@/lib/permit/registry-counts";
import {
  INSPECTION_RECOMMENDATION_OPTIONS,
  normalizeInspectionRecommendation,
} from "@/lib/inspection-recommendations";

const SUPERUSER_EMAILS = new Set(["nizzogentl1@gmail.com", "nshutidavy@gmail.com"]);
const ALLOWED_ROLES = ["admin", "approver", "reviewer", "verifier", "inspector", "assessor"] as const;

type Period = "monthly" | "quarterly" | "annually";

type ParsedFilters = {
  period: Period;
  from?: Date;
  to?: Date;
  province: string;
  district: string;
  sector: string;
  catchment1: string;
  catchment2: string;
  waterSource: string;
  waterPurpose: string;
};

function parseDateMaybe(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseFilters(req: NextRequest): ParsedFilters {
  const sp = req.nextUrl.searchParams;
  const periodParam = sp.get("period");
  const period: Period = periodParam === "quarterly" || periodParam === "annually" ? periodParam : "monthly";
  return {
    period,
    from: parseDateMaybe(sp.get("from")),
    to: parseDateMaybe(sp.get("to")),
    province: sp.get("province") || "all",
    district: sp.get("district") || "all",
    sector: sp.get("sector") || "all",
    catchment1: sp.get("catchment1") || "all",
    catchment2: sp.get("catchment2") || "all",
    waterSource: sp.get("waterSource") || "all",
    waterPurpose: sp.get("waterPurpose") || "all",
  };
}

function isMissingRelation(err: unknown, table: string): boolean {
  if (!err || typeof err !== "object") return false;
  const msg = String((err as { message?: string }).message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(table.toLowerCase());
}

type ApplicationRow = {
  id: string;
  status: string;
  province: string | null;
  district: string | null;
  sector: string | null;
};

type InspectionRow = {
  id: string;
  application_id: string | null;
  owner_kind: string | null;
  owner_id: string | null;
  status: string | null;
  completed_date: string | null;
  created_at: string;
  volume_limits_respected: boolean | null;
  location_verified: boolean | null;
  reporting_up_to_date: boolean | null;
  reports_submitted: boolean | null;
  fees_paid: boolean | null;
  fees_payment_verified: boolean | null;
  regulatory_compliance: boolean | null;
  actual_quantity: number | null;
  allowed_quantity: number | null;
  recommendations: string | null;
};

type FeedbackRow = {
  id: string;
  application_id: string | null;
  rating: number | null;
  feedback_text: string | null;
  created_at: string;
  application_number: string | null;
  project_title: string | null;
  province: string | null;
  district: string | null;
  sector: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    const userId = claims?.sub;
    if (!userId) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
    }

    const resolvedRoles = await resolveEffectiveRoles({ userId, claimsRole: claims?.role });
    const userEmail = String(claims?.email ?? "").trim().toLowerCase();
    const isSuperuser = SUPERUSER_EMAILS.has(userEmail);
    if (!isSuperuser && !hasAnyRole(resolvedRoles.effectiveRoles, [...ALLOWED_ROLES])) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const filters = parseFilters(req);
    const warnings: string[] = [];

    // ── Permit registry (single source of truth, ignores geo filters) ────
    const schema = await detectRegistrySchema();
    if (!schema.hasRegistry) warnings.push("permit_registry table missing — permit metrics empty");

    const registryFilters: RegistryListFilters = {
      waterSource: filters.waterSource,
      authorizedActivity: filters.waterPurpose,
    };

    const [registrySummary, registryDist, registryAbs, newlyIssued] = await Promise.all([
      fetchRegistrySummary(schema, registryFilters),
      fetchRegistryDistributions(schema, registryFilters),
      fetchRegistryAbstraction(schema, registryFilters),
      countNewlyIssued(schema, registryFilters, filters.from, filters.to, filters.period),
    ]);

    // ── Applications (geo-filtered) ──────────────────────────────────────
    const appWhere: string[] = [`status <> 'draft'`, `status <> 'pending_payment'`];
    const appValues: unknown[] = [];
    const appPush = (v: unknown) => {
      appValues.push(v);
      return `$${appValues.length}`;
    };
    if (filters.province !== "all") appWhere.push(`province::text = ${appPush(filters.province)}`);
    if (filters.district !== "all") appWhere.push(`lower(coalesce(district, '')) = lower(${appPush(filters.district)})`);
    if (filters.sector !== "all") appWhere.push(`lower(coalesce(sector, '')) = lower(${appPush(filters.sector)})`);
    if (filters.catchment1 !== "all") appWhere.push(`lower(coalesce(catchment_name_level_1, '')) = lower(${appPush(filters.catchment1)})`);
    if (filters.catchment2 !== "all") appWhere.push(`lower(coalesce(catchment_name_level_2, '')) = lower(${appPush(filters.catchment2)})`);
    if (filters.waterSource !== "all") appWhere.push(`water_source::text = ${appPush(filters.waterSource)}`);
    if (filters.waterPurpose !== "all") appWhere.push(`water_purpose::text = ${appPush(filters.waterPurpose)}`);
    if (filters.from) appWhere.push(`coalesce(submitted_at, created_at) >= ${appPush(filters.from.toISOString())}`);
    if (filters.to) appWhere.push(`coalesce(submitted_at, created_at) <= ${appPush(filters.to.toISOString())}`);

    const appsRes = await query<ApplicationRow>(
      `
      select id::text, status::text, province::text, district, sector
      from public.applications
      where ${appWhere.join(" AND ")}
      `,
      appValues
    );

    const apps = appsRes.rows;
    const appIdSet = new Set(apps.map((r: ApplicationRow) => r.id));

    const totalApplications = apps.length;
    const submittedApplications = apps.filter((a: ApplicationRow) => a.status === "submitted").length;
    const pendingReviewApplications = apps.filter((a: ApplicationRow) => a.status === "pending_review").length;
    const pendingVerificationApplications = apps.filter((a: ApplicationRow) => a.status === "pending_verification").length;
    const pendingFinalApprovalApplications = apps.filter((a: ApplicationRow) => a.status === "pending_final_approval").length;
    const inProcessApplications = apps.filter((a: ApplicationRow) =>
      ["under_review", "pending_assessment", "pending_inspection"].includes(a.status)
    ).length;

    const stageRows = [
      { key: "submitted", label: "Submitted", count: submittedApplications },
      { key: "pending_assessment", label: "Pending assessment", count: apps.filter((a: ApplicationRow) => a.status === "pending_assessment").length },
      { key: "pending_review", label: "Pending review", count: pendingReviewApplications },
      { key: "pending_verification", label: "Pending verification", count: pendingVerificationApplications },
      { key: "pending_final_approval", label: "Pending final approval", count: pendingFinalApprovalApplications },
    ];

    // ── Inspections (include manual + permit_registry-owned) ─────────────
    let inspectionsRows: InspectionRow[] = [];
    let inspectionsRecsAvailable = true;
    try {
      const insRes = await query<InspectionRow>(
        `
        select
          id::text,
          application_id::text,
          owner_kind,
          owner_id::text,
          status::text,
          completed_date::text,
          created_at::text,
          volume_limits_respected,
          location_verified,
          reporting_up_to_date,
          reports_submitted,
          fees_paid,
          fees_payment_verified,
          regulatory_compliance,
          actual_quantity,
          allowed_quantity,
          recommendations
        from public.inspections
        `
      );
      inspectionsRows = insRes.rows;
    } catch (err) {
      const msg = String((err as { message?: string }).message || "");
      if (msg.toLowerCase().includes("recommendations") && msg.toLowerCase().includes("does not exist")) {
        inspectionsRecsAvailable = false;
        try {
          const fallback = await query<InspectionRow>(
            `
            select
              id::text,
              application_id::text,
              owner_kind,
              owner_id::text,
              status::text,
              completed_date::text,
              created_at::text,
              volume_limits_respected,
              location_verified,
              reporting_up_to_date,
              reports_submitted,
              fees_paid,
              fees_payment_verified,
              regulatory_compliance,
              actual_quantity,
              allowed_quantity,
              null::text as recommendations
            from public.inspections
            `
          );
          inspectionsRows = fallback.rows;
        } catch (err2) {
          if (!isMissingRelation(err2, "inspections")) throw err2;
          warnings.push("inspections table missing — compliance metrics empty");
        }
      } else if (isMissingRelation(err, "inspections")) {
        warnings.push("inspections table missing — compliance metrics empty");
      } else {
        throw err;
      }
    }

    const geoFilterActive =
      filters.province !== "all" ||
      filters.district !== "all" ||
      filters.sector !== "all" ||
      filters.catchment1 !== "all" ||
      filters.catchment2 !== "all";

    const inspectionsFiltered = inspectionsRows.filter((i: InspectionRow) => {
      if (i.application_id) {
        if (!appIdSet.has(i.application_id)) return false;
      } else if (i.owner_kind === "permit_registry" || i.owner_kind === "manual_unpermitted") {
        if (geoFilterActive) return false;
      } else {
        return false;
      }

      const date = i.completed_date ? new Date(i.completed_date) : new Date(i.created_at);
      if (filters.from && date < filters.from) return false;
      if (filters.to && date > filters.to) return false;
      return true;
    });

    const completedInspections = inspectionsFiltered.filter((i: InspectionRow) => i.status === "completed" || Boolean(i.completed_date));

    const latestByOwner = new Map<string, InspectionRow>();
    for (const i of completedInspections) {
      const ownerKey = i.application_id ?? `${i.owner_kind}:${i.owner_id}`;
      const completedAt = i.completed_date ? new Date(i.completed_date) : new Date(i.created_at);
      const prev = latestByOwner.get(ownerKey);
      if (!prev) {
        latestByOwner.set(ownerKey, i);
        continue;
      }
      const prevAt = prev.completed_date ? new Date(prev.completed_date) : new Date(prev.created_at);
      if (completedAt > prevAt) latestByOwner.set(ownerKey, i);
    }

    let fullyCompliant = 0;
    let partiallyCompliant = 0;
    let nonCompliant = 0;
    let violationsDetected = 0;
    let volumeOk = 0;
    let locationOk = 0;
    let reportingOk = 0;
    let feesOk = 0;

    const recCounts: Record<string, number> = {};
    for (const opt of INSPECTION_RECOMMENDATION_OPTIONS) recCounts[opt] = 0;

    for (const insp of latestByOwner.values()) {
      const checks = [
        insp.volume_limits_respected === true,
        insp.location_verified === true,
        insp.reporting_up_to_date === true || insp.reports_submitted === true,
        insp.fees_paid === true || insp.fees_payment_verified === true,
      ];
      const passed = checks.filter(Boolean).length;
      if (passed === checks.length) fullyCompliant += 1;
      else if (passed === 0) nonCompliant += 1;
      else partiallyCompliant += 1;

      const isViolation =
        insp.regulatory_compliance === false ||
        insp.volume_limits_respected === false ||
        insp.location_verified === false ||
        insp.reports_submitted === false ||
        insp.reporting_up_to_date === false ||
        insp.fees_paid === false ||
        insp.fees_payment_verified === false ||
        (typeof insp.actual_quantity === "number" &&
          typeof insp.allowed_quantity === "number" &&
          insp.actual_quantity > insp.allowed_quantity);
      if (isViolation) violationsDetected += 1;

      if (insp.volume_limits_respected === true) volumeOk += 1;
      if (insp.location_verified === true) locationOk += 1;
      if (insp.reporting_up_to_date === true || insp.reports_submitted === true) reportingOk += 1;
      if (insp.fees_paid === true || insp.fees_payment_verified === true) feesOk += 1;

      const normalized = normalizeInspectionRecommendation(insp.recommendations);
      if (normalized) recCounts[normalized] += 1;
    }
    if (!inspectionsRecsAvailable) warnings.push("inspections.recommendations column missing — recommendation counts will be 0");

    const denom = latestByOwner.size;
    const parameters = [
      { key: "volume_limits", label: "Volume limits", numerator: volumeOk, denominator: denom },
      { key: "abstraction_location", label: "Abstraction point location", numerator: locationOk, denominator: denom },
      { key: "meter_reporting", label: "Meter installation & reporting", numerator: reportingOk, denominator: denom },
      { key: "fee_payment", label: "Fee payment status", numerator: feesOk, denominator: denom },
    ].map((p) => ({ ...p, percentage: p.denominator > 0 ? (p.numerator / p.denominator) * 100 : 0 }));

    // ── Feedback ─────────────────────────────────────────────────────────
    let feedbackRows: FeedbackRow[] = [];
    try {
      const fbRes = await query<FeedbackRow>(
        `
        select
          pf.id::text,
          pf.application_id::text,
          pf.rating,
          pf.feedback_text,
          pf.created_at::text,
          a.application_number,
          a.project_title,
          a.province::text,
          a.district,
          a.sector
        from public.portal_feedback pf
        left join public.applications a on a.id = pf.application_id
        where pf.feedback_type = 'terms_acceptance'
        order by pf.created_at desc
        `
      );
      feedbackRows = fbRes.rows;
    } catch (err) {
      if (isMissingRelation(err, "portal_feedback")) {
        warnings.push("portal_feedback table missing — feedback metrics empty");
      } else {
        throw err;
      }
    }

    const feedbackFiltered = feedbackRows.filter((entry: FeedbackRow) => {
      if (!entry.application_id || !appIdSet.has(entry.application_id)) return false;
      const createdAt = new Date(entry.created_at);
      if (filters.from && createdAt < filters.from) return false;
      if (filters.to && createdAt > filters.to) return false;
      return true;
    });

    const ratedFeedback = feedbackFiltered.filter((entry: FeedbackRow) => typeof entry.rating === "number" && entry.rating >= 1 && entry.rating <= 5);
    const averageRating =
      ratedFeedback.length > 0
        ? ratedFeedback.reduce((sum: number, e: FeedbackRow) => sum + Number(e.rating || 0), 0) / ratedFeedback.length
        : null;
    const ratingBreakdown = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: feedbackFiltered.filter((entry: FeedbackRow) => entry.rating === rating).length,
    }));
    const recentFeedback = feedbackFiltered.map((entry: FeedbackRow) => ({
      id: entry.id,
      applicationId: entry.application_id,
      applicationNumber: entry.application_number,
      projectTitle: entry.project_title,
      province: entry.province,
      district: entry.district,
      sector: entry.sector,
      rating: entry.rating,
      feedbackText: entry.feedback_text,
      createdAt: entry.created_at,
    }));

    const totalForWaterSourcePct = registryDist.byWaterSource.reduce((s, r) => s + r.count, 0) || 1;
    const totalForActivityPct = registryDist.byAuthorizedActivity.reduce((s, r) => s + r.count, 0) || 1;

    return NextResponse.json({
      portfolio: {
        kpis: {
          totalApplications,
          submittedApplications,
          inProcessApplications,
          pendingReviewApplications,
          pendingVerificationApplications,
          pendingFinalApprovalApplications,
          totalPermits: registrySummary.total,
          operational: registrySummary.operational,
          expired: registrySummary.expired,
          cancelled: registrySummary.cancelled,
          expiringSoon: registrySummary.expiringSoon,
          newPermitsIssued: newlyIssued,
          // Deprecated, retained for backward type compatibility
          active: registrySummary.operational,
          suspended: 0,
          revoked: 0,
        },
        distributions: {
          byWaterSource: registryDist.byWaterSource.map((r) => ({
            ...r,
            percentage: (r.count / totalForWaterSourcePct) * 100,
          })),
          byUse: registryDist.byAuthorizedActivity.map((r) => ({
            ...r,
            percentage: (r.count / totalForActivityPct) * 100,
          })),
          byStatusBucket: registryDist.byStatusBucket,
          byCatchment1: [],
          byCatchment2: [],
          byProvince: [],
          byDistrict: [],
          bySector: [],
        },
        workflow: { pendingByStage: stageRows },
      },
      abstraction: {
        totalPermittedM3PerDay: registryAbs.totalPermittedM3PerDay,
        totalPermittedM3PerYear: registryAbs.totalPermittedM3PerYear,
        pressureByCatchment: [],
      },
      compliance: {
        holders: { fullyCompliant, partiallyCompliant, nonCompliant },
        inspections: {
          conducted: completedInspections.length,
          violationsDetected,
          enforcementActionsTaken: 0,
          recommendationBreakdown: INSPECTION_RECOMMENDATION_OPTIONS.map((opt) => ({
            key: opt,
            label: opt,
            count: recCounts[opt] || 0,
          })),
        },
        parameters,
        alerts: [],
      },
      feedback: {
        totalSubmissions: feedbackFiltered.length,
        averageRating,
        ratingBreakdown,
        recent: recentFeedback,
      },
      meta: {
        permitsScopeNote:
          "Permit counts reflect the entire permit registry. Province / district / sector / catchment filters apply to applications, inspections, and feedback only.",
        warnings,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (message.includes("Invalid session") || message.includes("JWT")) {
      const res = NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 });
      clearSessionCookie(res);
      return res;
    }
    console.error("❌ /api/management/dashboard error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
