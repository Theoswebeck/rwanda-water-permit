/**
 * Full application dossier download (RWB archiving points 4 & 8).
 *
 * Staff (assessor and above) download ONE ZIP per application containing:
 *   - every uploaded supporting document (public.documents),
 *   - the assessment report PDF (rendered server-side from the saved
 *     technical_assessments.assessment_report_data snapshot),
 *   - the approved permit PDF (re-rendered via the canonical
 *     lib/pdf-permit-server renderer, mirroring the public PDF route),
 *   - the signed contract / terms PDF (stored file, generated client-side at
 *     approval time),
 *   - the inspection report PDF of every approved inspection (rendered from the
 *     saved inspections row by lib/pdf-inspection-report-server),
 *   - documents of approved inspections (inspections.inspection_documents +
 *     inspection-owned rows in public.documents).
 *
 * MISSING FILES NEVER FAIL THE ZIP (a 2026-07 incident lost some uploads):
 * unavailable items are skipped and listed in MANIFEST.txt alongside the
 * included ones, so the archive is honest about what it contains.
 *
 * RESOURCE BOUNDS (single-instance on-prem server — an unbounded dossier can
 * OOM the whole portal): every stored file is size-checked BEFORE it is read
 * into memory, and the finished archive is streamed to the response instead of
 * being materialised as one big Buffer (and then copied again).
 *
 * PACKING ORDER — every stored file is *planned* (path + size only) first, and
 * only then packed SMALLEST-FIRST. That ordering is what makes the archive
 * trustworthy: a document can only be excluded if every document already in the
 * ZIP is smaller than it, so a couple of huge scanned annexes can never push
 * out the small but legally essential items (signed application form,
 * land-ownership annex, payment proof). Document category is only a tie-break
 * between files of identical size. Everything left out is listed in MANIFEST.txt
 * under "EXCLUDED (SIZE LIMITS)" with its size and the reason.
 */
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { query } from "@/lib/db/postgres";
import {
  clearSessionCookie,
  readSessionTokenFromRequest,
  verifySessionToken,
} from "@/lib/auth/session";
import { hasAnyRole, resolveEffectiveRoles } from "@/lib/auth/effective-roles";
import { generatePermitPdfBuffer, type PermitApplication } from "@/lib/pdf-permit-server";
import { isConcessionApplication } from "@/lib/permit-variant";
import { generateAssessmentReportPdfBuffer } from "@/lib/pdf-assessment-report-server";
import { generateInspectionReportPdfBuffer } from "@/lib/pdf-inspection-report-server";
import { loadInspectionReportContext } from "@/lib/inspections/report-context-server";
import { determineReportType, type AssessmentReportData } from "@/lib/assessment-report-utils";
import { resolvePermitIssueDate } from "@/lib/permit/resolve-issue-date";

export const runtime = "nodejs";

/** Same staff gate as the sibling permit-preview route. */
const ALLOWED_STAFF_ROLES = [
  "admin",
  "reviewer",
  "approver",
  "verifier",
  "inspector",
  "assessor",
] as const;

type ManifestEntry = { label: string; detail?: string };

/**
 * Per-file cap. Real dossier uploads (scanned PDFs, site photos, drawings)
 * sit well under this; anything bigger is an outlier that staff can fetch
 * individually from the application page.
 */
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
/**
 * Cumulative budget for everything placed in the ZIP. JSZip holds every
 * entry in memory until the archive is generated, so this is the real heap
 * ceiling for a dossier download. 150 MB comfortably covers the largest
 * dossiers seen in production (dozens of scans + generated PDFs) while
 * keeping worst-case heap bounded on the single-instance server.
 */
const MAX_TOTAL_BYTES = 150 * 1024 * 1024; // 150 MB

/**
 * Tie-break only (see the packing note at the top of this file): files are
 * ordered by size first, and by this category ordering when two files are the
 * same size.
 */
const PRIORITY = {
  legal: 0, // contract / terms, stored permit PDF
  submitted: 1, // the applicant's own supporting documents
  assessment: 2, // assessor field-report attachments
  inspection: 3, // inspection attachments
} as const;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "unknown size";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} bytes`;
}

function parseNotes(raw: unknown): Record<string, any> | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {
      // ignore malformed JSON
    }
  }
  return null;
}

/** Outcome of a bounded stored-file read. */
type StoredFile =
  | { kind: "ok"; bytes: Buffer }
  | { kind: "missing" }
  | { kind: "too-large"; size: number };

/**
 * Locate a stored upload on disk. Same candidate-root strategy as
 * /api/files/view (files live under public/uploads/... but some deployments
 * resolve them one level up). Returns null when the file is gone — the
 * caller records it in the manifest instead of failing.
 */
async function resolveLocalFile(relativePath: string): Promise<{ path: string; size: number } | null> {
  const trimmed = String(relativePath || "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (normalized.includes("..")) return null;
  const relNoSlash = normalized.replace(/^\/+/, "");

  const candidateRoots = [
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), "..", "public"),
    path.resolve(process.cwd(), ".."),
  ];

  for (const root of candidateRoots) {
    const resolved = path.resolve(root, relNoSlash);
    if (!resolved.startsWith(root)) continue;
    try {
      const info = await stat(resolved);
      if (info.isFile()) return { path: resolved, size: info.size };
    } catch {
      // Continue to next candidate root.
    }
  }

  return null;
}

/**
 * Where a planned file lives and how big it is — resolved BEFORE any bytes are
 * pulled into memory, so the packer can order files by size.
 *
 * Legacy rows may store an absolute URL instead of a relative path; a remote
 * server may not answer HEAD or may omit Content-Length, in which case the size
 * is `null` (unknown) and the file is packed last, under the remaining budget.
 */
type StoredProbe =
  | { kind: "local"; path: string; size: number }
  | { kind: "remote"; url: string; size: number | null }
  | { kind: "missing" };

async function probeStoredFile(filePath: string): Promise<StoredProbe> {
  const trimmed = String(filePath || "").trim();
  if (!trimmed) return { kind: "missing" };
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const res = await fetch(trimmed, { method: "HEAD", signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const declared = Number(res.headers.get("content-length"));
        return {
          kind: "remote",
          url: trimmed,
          size: Number.isFinite(declared) && declared >= 0 ? declared : null,
        };
      }
    } catch {
      // HEAD may be unsupported — fall through and let the GET decide.
    }
    return { kind: "remote", url: trimmed, size: null };
  }
  const local = await resolveLocalFile(trimmed);
  if (!local) return { kind: "missing" };
  return { kind: "local", path: local.path, size: local.size };
}

/**
 * `maxBytes` is enforced BEFORE the bytes are pulled into memory (via the size
 * from the probe, Content-Length over HTTP) so an oversized scan never lands on
 * the heap.
 */
async function loadStoredFile(probe: StoredProbe, maxBytes: number): Promise<StoredFile> {
  if (probe.kind === "missing") return { kind: "missing" };
  if (probe.kind === "remote") {
    if (probe.size !== null && probe.size > maxBytes) {
      return { kind: "too-large", size: probe.size };
    }
    try {
      const res = await fetch(probe.url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { kind: "missing" };
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxBytes) {
        try {
          await res.body?.cancel();
        } catch {
          // ignore
        }
        return { kind: "too-large", size: declared };
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      // Remote servers may omit Content-Length — re-check after the fact.
      if (bytes.length > maxBytes) return { kind: "too-large", size: bytes.length };
      return { kind: "ok", bytes };
    } catch {
      return { kind: "missing" };
    }
  }
  if (probe.size > maxBytes) return { kind: "too-large", size: probe.size };
  try {
    return { kind: "ok", bytes: await readFile(probe.path) };
  } catch {
    return { kind: "missing" };
  }
}

/**
 * Inspection documents store viewer URLs like
 * "/api/files/view?path=%2Fuploads%2F..." — unwrap back to the storage path.
 */
function toStoragePath(rawUrlOrPath: string | null | undefined): string | null {
  const raw = String(rawUrlOrPath || "").trim();
  if (!raw) return null;
  if (raw.startsWith("/api/files/view")) {
    const idx = raw.indexOf("path=");
    if (idx === -1) return null;
    try {
      return decodeURIComponent(raw.slice(idx + 5).split("&")[0]);
    } catch {
      return null;
    }
  }
  return raw;
}

/** Safe ZIP entry / download file name. */
function safeFileName(value: string, fallback: string): string {
  const cleaned = String(value || "")
    .replace(/[\/\\]/g, "-")
    .replace(/[\r\n"]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

function formatDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value.trim()) return value.slice(0, 10);
  return "";
}

function parseIsoLikeDate(input: unknown): Date | undefined {
  if (input instanceof Date) return input;
  if (typeof input !== "string" || !input.trim()) return undefined;
  const raw = input.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/** Map the application row to the canonical renderer input (mirrors permit-preview). */
function buildPermitApplication(row: Record<string, unknown>): PermitApplication {
  const application: PermitApplication = {
    id: String(row.id ?? ""),
    application_number: String(row.application_number ?? ""),
    project_title: String(row.project_title ?? ""),
    status: String(row.status ?? ""),
    application_type: String(row.application_type ?? ""),
    water_source: String(row.water_source ?? ""),
    water_purpose: String(row.water_purpose ?? ""),
    estimated_usage_volume: Number(row.estimated_usage_volume) || 0,
    usage_unit: String(row.usage_unit ?? ""),
    intended_activities: row.intended_activities ?? undefined,
    province: String(row.province ?? ""),
    district: String(row.district ?? ""),
    sector: String(row.sector ?? ""),
    cell: String(row.cell ?? ""),
    village: row.village != null ? String(row.village) : undefined,
    concession_area:
      row.concession_area != null ? Number(row.concession_area) : undefined,
    proposed_duration_years:
      row.proposed_duration_years != null ? Number(row.proposed_duration_years) : undefined,
    assessor_recommended_volume_m3:
      row.assessor_recommended_volume_m3 != null
        ? Number(row.assessor_recommended_volume_m3)
        : undefined,
    max_daily_volume_m3:
      row.max_daily_volume_m3 != null ? Number(row.max_daily_volume_m3) : undefined,
    max_yearly_volume_m3:
      row.max_yearly_volume_m3 != null ? Number(row.max_yearly_volume_m3) : undefined,
    internal_notes: row.internal_notes != null ? (row.internal_notes as string) : undefined,
    water_taking_method:
      row.water_taking_method != null ? String(row.water_taking_method) : undefined,
    // GeoJSON geometry — feeds resolveLatLng's Point fallback so the archived
    // permit PDF shows the same coordinates as the official public PDF.
    coordinates: row.coordinates ?? undefined,
    applicant: {
      first_name: row.first_name != null ? String(row.first_name) : undefined,
      last_name: row.last_name != null ? String(row.last_name) : undefined,
      company_name: row.company_name != null ? String(row.company_name) : undefined,
      email: String(row.email ?? ""),
      phone: row.phone != null ? String(row.phone) : undefined,
      account_type: String(row.account_type ?? "individual"),
      id_number: row.id_number != null ? String(row.id_number) : undefined,
      company_tin: row.company_tin != null ? String(row.company_tin) : undefined,
      company_address: row.company_address != null ? String(row.company_address) : undefined,
    },
  };
  (application.applicant as any).company_phone =
    row.company_phone != null ? String(row.company_phone) : undefined;
  (application as any).water_body_name =
    row.water_body_name != null ? String(row.water_body_name) : undefined;
  (application as any).is_bulk = row.is_bulk === true;
  (application as any).bulk_networks = Array.isArray(row.bulk_networks)
    ? row.bulk_networks
    : [];
  return application;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    // ── Auth: any staff role (assessor and above); applicants never ──────────
    const token = readSessionTokenFromRequest(req);
    const claims = token ? await verifySessionToken(token) : null;
    const userId = claims?.sub;
    if (!userId) {
      return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
    }
    const resolvedRoles = await resolveEffectiveRoles({ userId, claimsRole: claims?.role });
    if (!hasAnyRole(resolvedRoles.effectiveRoles, ALLOWED_STAFF_ROLES)) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    if (!id || typeof id !== "string" || id.length < 10) {
      return NextResponse.json({ success: false, message: "Invalid application id" }, { status: 400 });
    }

    // ── Application + applicant ──────────────────────────────────────────────
    const appRes = await query<Record<string, unknown>>(
      `
      SELECT
        a.id,
        a.application_number,
        a.project_title,
        a.status,
        a.application_type,
        a.water_source,
        a.water_purpose,
        a.water_body_name,
        a.estimated_usage_volume,
        a.usage_unit,
        a.intended_activities,
        a.province,
        a.district,
        a.sector,
        a.cell,
        a.village,
        a.concession_area,
        a.proposed_duration_years,
        a.assessor_recommended_volume_m3,
        a.max_daily_volume_m3,
        a.max_yearly_volume_m3,
        a.internal_notes::text AS internal_notes,
        a.water_taking_method,
        ST_AsGeoJSON(a.coordinates)::json AS coordinates,
        a.is_modification,
        a.approved_at,
        a.is_bulk,
        a.bulk_networks,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.account_type,
        u.id_number,
        u.company_name,
        u.company_tin,
        u.company_address,
        u.company_phone
      FROM public.applications a
      JOIN public.users u ON u.id = a.applicant_id
      WHERE a.id = $1
      LIMIT 1
      `,
      [id],
    );
    if (!appRes.rows.length) {
      return NextResponse.json({ success: false, message: "Application not found" }, { status: 404 });
    }
    const appRow = appRes.rows[0];
    const notes = parseNotes(appRow.internal_notes);
    const applicationNumber = String(appRow.application_number || id);

    const zip = new JSZip();
    const included: ManifestEntry[] = [];
    const missing: ManifestEntry[] = [];
    const excluded: ManifestEntry[] = [];
    const usedNames = new Set<string>();
    // Running total of everything handed to JSZip — the heap ceiling.
    let totalBytes = 0;
    const remainingBudget = () => Math.max(0, MAX_TOTAL_BYTES - totalBytes);

    const uniqueName = (folder: string, name: string): string => {
      let candidate = `${folder}/${name}`;
      let counter = 2;
      while (usedNames.has(candidate)) {
        const ext = path.extname(name);
        const base = name.slice(0, name.length - ext.length);
        candidate = `${folder}/${base} (${counter})${ext}`;
        counter += 1;
      }
      usedNames.add(candidate);
      return candidate;
    };

    /**
     * Stored files are only PLANNED here — nothing is read into memory until
     * every planned file has been sized, so the packer can take the small ones
     * first (see the packing note at the top of this file).
     */
    type PlannedFile = {
      folder: string;
      storagePath: string;
      displayName: string;
      manifestLabel: string;
      priority: number;
      order: number;
    };
    const planned: PlannedFile[] = [];

    const planFile = (
      folder: string,
      filePath: string | null | undefined,
      displayName: string,
      manifestLabel: string,
      missingDetail: string,
      priority: number,
    ): void => {
      const storagePath = toStoragePath(filePath);
      if (!storagePath) {
        missing.push({ label: manifestLabel, detail: missingDetail });
        return;
      }
      planned.push({
        folder,
        storagePath,
        displayName,
        manifestLabel,
        priority,
        order: planned.length,
      });
    };

    // ── 1. Submitted supporting documents ────────────────────────────────────
    const docsRes = await query<Record<string, unknown>>(
      `
      SELECT name, type::text AS type, file_path, created_at
      FROM public.documents
      WHERE application_id = $1
      ORDER BY created_at ASC
      `,
      [id],
    );
    if (!docsRes.rows.length) {
      missing.push({ label: "Submitted documents", detail: "no document records found" });
    }
    for (const doc of docsRes.rows) {
      const label = `Submitted document: ${String(doc.name || doc.type || "document")} (${String(doc.type || "other")}, uploaded ${formatDate(doc.created_at)})`;
      planFile(
        "01-submitted-documents",
        String(doc.file_path || ""),
        String(doc.name || path.basename(String(doc.file_path || ""))),
        label,
        "no file path recorded",
        PRIORITY.submitted,
      );
    }

    // ── 2. Assessment report (rendered from the saved snapshot) ──────────────
    const taRes = await query<Record<string, unknown>>(
      `
      SELECT assessment_number, inspector_name, inspection_date::text AS inspection_date,
             recommendation::text AS recommendation, explanation_text,
             assessment_report_data, field_report_files,
             forwarded_at, updated_at, created_at
      FROM public.technical_assessments
      WHERE application_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [id],
    );
    const ta = taRes.rows[0];
    const reportData =
      ta && ta.assessment_report_data && typeof ta.assessment_report_data === "object"
        ? (ta.assessment_report_data as Record<string, unknown>)
        : null;
    if (ta && reportData && Object.keys(reportData).length > 0) {
      try {
        const waterUseCategory =
          (typeof notes?.waterUseCategory === "string" ? notes.waterUseCategory : null) ??
          (typeof notes?.formData?.waterUseCategory === "string"
            ? notes.formData.waterUseCategory
            : null);
        const reportType = determineReportType(
          Array.isArray(appRow.intended_activities)
            ? (appRow.intended_activities as string[])
            : null,
          appRow.water_purpose != null ? String(appRow.water_purpose) : null,
          waterUseCategory,
        );
        const pdf = await generateAssessmentReportPdfBuffer({
          applicationNumber,
          projectTitle: appRow.project_title != null ? String(appRow.project_title) : null,
          reportType,
          data: reportData as Partial<AssessmentReportData>,
          assessmentNumber: ta.assessment_number != null ? String(ta.assessment_number) : null,
          inspectorName: ta.inspector_name != null ? String(ta.inspector_name) : null,
          inspectionDate: formatDate(ta.inspection_date) || null,
          recommendation: ta.recommendation != null ? String(ta.recommendation) : null,
          explanationText: ta.explanation_text != null ? String(ta.explanation_text) : null,
          submittedAt: formatDate(ta.forwarded_at || ta.updated_at || ta.created_at) || null,
        });
        const entryName = uniqueName("02-assessment-report", "assessment-report.pdf");
        totalBytes += pdf.length;
        zip.file(entryName, pdf);
        included.push({ label: entryName, detail: "Assessment report (system-generated PDF)" });
      } catch (err) {
        console.error("❌ dossier: assessment report render failed:", err);
        missing.push({ label: "Assessment report PDF", detail: "could not be rendered" });
      }
    } else {
      missing.push({ label: "Assessment report PDF", detail: "no assessment report saved yet" });
    }

    // Field report attachments the assessor uploaded with the assessment.
    const fieldReportFiles =
      ta && Array.isArray(ta.field_report_files) ? (ta.field_report_files as unknown[]) : [];
    for (const fp of fieldReportFiles) {
      if (typeof fp !== "string" || !fp.trim()) continue;
      planFile(
        "02-assessment-report/field-report-files",
        fp,
        path.basename(fp),
        `Field report attachment: ${path.basename(fp)}`,
        "no file path recorded",
        PRIORITY.assessment,
      );
    }

    // ── 3. Approved permit PDF (canonical server-side renderer) ──────────────
    const permitRes = await query<Record<string, unknown>>(
      `
      SELECT id, permit_number, status::text AS status, water_allowance, allowance_unit,
             issued_date::text AS issued_date, expiry_date::text AS expiry_date,
             conditions, is_modification, permit_pdf_url
      FROM public.permits
      WHERE application_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [id],
    );
    const permit = permitRes.rows[0];
    if (permit) {
      const permitNumber = String(permit.permit_number || "");
      try {
        const application = buildPermitApplication(appRow);
        // Same allowance override as the public PDF route: once issued, the
        // permit row's water_allowance is the legal figure.
        const allowance = parsePositiveNumber(permit.water_allowance);
        if (allowance) {
          if (isConcessionApplication(application as any)) {
            application.concession_area = allowance;
          } else {
            application.assessor_recommended_volume_m3 = allowance;
            application.max_yearly_volume_m3 = allowance;
            if (
              typeof application.max_daily_volume_m3 !== "number" ||
              !Number.isFinite(application.max_daily_volume_m3) ||
              application.max_daily_volume_m3 <= 0
            ) {
              application.max_daily_volume_m3 = allowance / 365;
            }
          }
          if (typeof permit.allowance_unit === "string" && permit.allowance_unit.trim()) {
            application.usage_unit = permit.allowance_unit.trim();
          }
        }

        const approvedAtRaw =
          typeof appRow.approved_at === "string"
            ? appRow.approved_at
            : appRow.approved_at instanceof Date
              ? appRow.approved_at.toISOString()
              : null;
        const issuedDate = resolvePermitIssueDate({
          permitIssuedDate: typeof permit.issued_date === "string" ? permit.issued_date : null,
          approvedAt: approvedAtRaw,
        });
        const conditions = parseNotes(permit.conditions);
        const modHistory = Array.isArray(conditions?.modification_history)
          ? (conditions.modification_history as Array<Record<string, unknown>>)
          : [];
        const lastModifiedAt = modHistory.length
          ? modHistory[modHistory.length - 1]?.modified_at
          : null;
        const signingDate = resolvePermitIssueDate({
          permitIssuedDate: typeof lastModifiedAt === "string" ? lastModifiedAt : null,
          approvedAt: approvedAtRaw,
        });

        const pdfBuffer = await generatePermitPdfBuffer({
          application,
          permitNumber,
          permitValidityYears: 5,
          isModified: permit.is_modification === true,
          issuedDate,
          signingDate,
          expiryDate: parseIsoLikeDate(permit.expiry_date),
        });
        const entryName = uniqueName(
          "03-permit",
          `permit-${safeFileName(permitNumber, "permit")}.pdf`,
        );
        totalBytes += pdfBuffer.length;
        zip.file(entryName, pdfBuffer);
        included.push({ label: entryName, detail: `Approved permit ${permitNumber}` });
      } catch (err) {
        console.error("❌ dossier: permit render failed, trying stored PDF:", err);
        planFile(
          "03-permit",
          String(permit.permit_pdf_url || ""),
          `permit-${safeFileName(permitNumber, "permit")}.pdf`,
          `Approved permit ${permitNumber} (stored copy)`,
          "could not be rendered and no stored PDF is recorded",
          PRIORITY.legal,
        );
      }
    } else {
      missing.push({ label: "Permit PDF", detail: "no permit issued for this application" });
    }

    // ── 4. Contract / terms PDF (stored at approval time) ────────────────────
    const termsPath =
      typeof notes?.accepted_terms_pdf_url === "string" ? notes.accepted_terms_pdf_url : null;
    if (termsPath) {
      planFile(
        "04-contract",
        termsPath,
        path.basename(termsPath),
        "Contract / Terms & Conditions PDF",
        "no file path recorded",
        PRIORITY.legal,
      );
    } else {
      missing.push({
        label: "Contract / Terms & Conditions PDF",
        detail: permit ? "no stored contract PDF for this application" : "not generated yet",
      });
    }

    // ── 5. Approved inspection reports ───────────────────────────────────────
    const inspectionsRes = await query<Record<string, unknown>>(
      `
      SELECT id, inspection_number, type::text AS type, workflow_status,
             completed_date, scheduled_date, inspection_documents
      FROM public.inspections
      WHERE application_id = $1
        AND workflow_status = 'approved'
      ORDER BY created_at ASC
      `,
      [id],
    );
    for (const inspection of inspectionsRes.rows) {
      const inspectionLabel = String(
        inspection.inspection_number || String(inspection.id).slice(0, 8),
      );
      const folder = `05-inspection-reports/${safeFileName(inspectionLabel, "inspection")}`;

      // The inspection report itself, rendered from the saved row (same
      // renderer as the staff "Download inspection (PDF)" action).
      try {
        const context = await loadInspectionReportContext(String(inspection.id));
        if (context) {
          const inspectionPdf = await generateInspectionReportPdfBuffer({
            template: context.template,
            manualInspection: context.manualInspection,
            form: context.form,
            locked: context.locked,
            inspectionNumber: context.inspectionNumber,
            inspectorName: context.inspectorName,
            inspectionDate: context.inspectionDate,
            workflowStatus: context.workflowStatus,
            approvedAt: context.approvedAt,
          });
          const entryName = uniqueName(
            folder,
            `inspection-report-${safeFileName(inspectionLabel, "inspection")}.pdf`,
          );
          totalBytes += inspectionPdf.length;
          zip.file(entryName, inspectionPdf);
          included.push({ label: entryName, detail: "Inspection report (system-generated PDF)" });
        }
      } catch (err) {
        console.error("❌ dossier: inspection report render failed:", err);
        missing.push({
          label: `Inspection ${inspectionLabel} report PDF`,
          detail: "could not be rendered",
        });
      }

      const docsJson = Array.isArray(inspection.inspection_documents)
        ? (inspection.inspection_documents as Array<Record<string, unknown>>)
        : [];
      let added = 0;
      for (const docMeta of docsJson) {
        if (!docMeta) continue;
        const rawPath =
          (typeof docMeta.url === "string" && docMeta.url) ||
          (typeof docMeta.fileName === "string" && docMeta.fileName) ||
          "";
        const displayName =
          (typeof docMeta.name === "string" && docMeta.name) ||
          (typeof docMeta.fileName === "string" && path.basename(docMeta.fileName)) ||
          path.basename(String(rawPath));
        planFile(
          folder,
          rawPath,
          displayName,
          `Inspection ${inspectionLabel} document: ${displayName}`,
          "no file path recorded",
          PRIORITY.inspection,
        );
        added += 1;
      }
      // Inspection-owned rows in public.documents (uploads against the
      // inspection itself, e.g. registry/no-permit inspections).
      const inspectionDocsRes = await query<Record<string, unknown>>(
        `
        SELECT name, file_path, created_at
        FROM public.documents
        WHERE owner_kind = 'inspection' AND owner_id = $1
        ORDER BY created_at ASC
        `,
        [String(inspection.id)],
      );
      for (const doc of inspectionDocsRes.rows) {
        planFile(
          folder,
          String(doc.file_path || ""),
          String(doc.name || path.basename(String(doc.file_path || ""))),
          `Inspection ${inspectionLabel} document: ${String(doc.name || "document")}`,
          "no file path recorded",
          PRIORITY.inspection,
        );
        added += 1;
      }
      if (added === 0) {
        missing.push({
          label: `Inspection ${inspectionLabel}`,
          detail: "approved inspection has no attached documents",
        });
      }
    }
    if (!inspectionsRes.rows.length) {
      missing.push({ label: "Inspection reports", detail: "no approved inspections for this application" });
    }

    // ── Size, then pack SMALLEST-FIRST ───────────────────────────────────────
    // Sizing touches metadata only (stat / HEAD), so nothing lands on the heap
    // before the packer has decided what fits. Ordering by size guarantees a
    // document is only ever excluded when everything already in the ZIP is
    // smaller than it — small essentials (signed form, land title, payment
    // proof) can never be pushed out by a few huge scans, whatever order the
    // rows came back in. Category is only a tie-break between equal sizes.
    type SizedFile = PlannedFile & { probe: StoredProbe; size: number };
    const sized: SizedFile[] = [];
    for (const item of planned) {
      const probe = await probeStoredFile(item.storagePath);
      if (probe.kind === "missing") {
        missing.push({ label: item.manifestLabel, detail: "file missing on server" });
        continue;
      }
      // Unknown remote size → sorted last and packed against whatever budget is
      // left, so it can never displace a file of known, smaller size.
      const size =
        probe.kind === "local" ? probe.size : (probe.size ?? Number.POSITIVE_INFINITY);
      sized.push({ ...item, probe, size });
    }
    sized.sort((a, b) => {
      if (a.size !== b.size) return a.size < b.size ? -1 : 1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.order - b.order;
    });

    for (const item of sized) {
      const budgetBefore = remainingBudget();
      if (Number.isFinite(item.size) && item.size > MAX_FILE_BYTES) {
        excluded.push({
          label: item.manifestLabel,
          detail: `${formatBytes(item.size)} — above the ${formatBytes(MAX_FILE_BYTES)} per-file limit; download it individually from the application page`,
        });
        continue;
      }
      if (budgetBefore <= 0 || (Number.isFinite(item.size) && item.size > budgetBefore)) {
        excluded.push({
          label: item.manifestLabel,
          detail: `${formatBytes(item.size)} — the ${formatBytes(MAX_TOTAL_BYTES)} dossier budget is used up (${formatBytes(budgetBefore)} left, and every file already in this ZIP is smaller); download it individually from the application page`,
        });
        continue;
      }
      const result = await loadStoredFile(item.probe, Math.min(MAX_FILE_BYTES, budgetBefore));
      if (result.kind === "missing") {
        missing.push({ label: item.manifestLabel, detail: "file missing on server" });
        continue;
      }
      if (result.kind === "too-large") {
        excluded.push({
          label: item.manifestLabel,
          detail:
            result.size > MAX_FILE_BYTES
              ? `${formatBytes(result.size)} — above the ${formatBytes(MAX_FILE_BYTES)} per-file limit; download it individually from the application page`
              : `${formatBytes(result.size)} — the ${formatBytes(MAX_TOTAL_BYTES)} dossier budget is used up (${formatBytes(budgetBefore)} left); download it individually from the application page`,
        });
        continue;
      }
      const bytes = result.bytes;
      totalBytes += bytes.length;
      const fallback = path.basename(item.storagePath) || "document";
      let name = safeFileName(item.displayName, fallback);
      if (!path.extname(name) && path.extname(fallback)) {
        name = `${name}${path.extname(fallback)}`;
      }
      const entryName = uniqueName(item.folder, name);
      zip.file(entryName, bytes);
      included.push({ label: entryName, detail: item.manifestLabel });
    }

    // ── MANIFEST.txt ─────────────────────────────────────────────────────────
    const manifestLines: string[] = [
      "APPLICATION DOSSIER MANIFEST",
      "============================",
      `Application: ${applicationNumber}`,
      `Application status: ${String(appRow.status || "")}`,
      `Generated: ${new Date().toISOString()}`,
      `Generated by: ${String(claims?.email || userId)}`,
      "",
      `INCLUDED (${included.length})`,
      "--------",
      ...(included.length
        ? included.map((e) => `  ${e.label}${e.detail ? `  — ${e.detail}` : ""}`)
        : ["  (none)"]),
      "",
      `MISSING / UNAVAILABLE (${missing.length})`,
      "---------------------",
      ...(missing.length
        ? missing.map((e) => `  ${e.label}${e.detail ? ` — ${e.detail}` : ""}`)
        : ["  (none)"]),
      "",
      `EXCLUDED (SIZE LIMITS) (${excluded.length})`,
      "----------------------",
      ...(excluded.length
        ? excluded.map((e) => `  ${e.label}${e.detail ? ` — ${e.detail}` : ""}`)
        : ["  (none)"]),
      "",
      `These files EXIST on the server but were left out of this ZIP to keep the`,
      `archive within its limits (${formatBytes(MAX_FILE_BYTES)} per file, ${formatBytes(MAX_TOTAL_BYTES)} in total;`,
      `${formatBytes(totalBytes)} used by this dossier).`,
      "Documents are packed smallest-first, so anything listed above is larger",
      "than every document that IS in this ZIP — no small document was dropped",
      "in favour of a bigger one. Open the application in the portal and",
      "download the excluded files one by one.",
      "",
      "Missing uploads may relate to the 2026-07 file-loss incident; ask the",
      "applicant to re-upload any submitted document listed as missing.",
      "",
    ];
    zip.file("MANIFEST.txt", manifestLines.join("\n"));

    // Stream the archive out instead of materialising the whole ZIP as a
    // Buffer and then copying it into a Uint8Array (that was ~2x the payload
    // on top of the entry data itself, on a single-instance server).
    const zipStream = zip.generateInternalStream({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    // Once a chunk has been dispatched, JSZip emits it synchronously — the
    // controller may already be cancelled (staff closed the tab / hit Stop /
    // the connection dropped) or closed, and enqueueing on it throws from
    // inside JSZip's event emission. Everything below is therefore guarded by
    // this one flag: after cancel/error/end nothing touches the controller.
    let streamDone = false;

    /**
     * Tear the JSZip worker chain down. `pause()` alone (the documented API)
     * only stops the flow — the chain stays alive holding every entry's data,
     * which is exactly what we cannot afford on the single-instance server.
     * Erroring the tail worker propagates upward, marks the chain finished and
     * runs its cleanUp(), releasing the buffered entries. The private access is
     * defensive: any failure falls back to pause().
     */
    const destroyZipStream = () => {
      try {
        const tail = (zipStream as unknown as { _worker?: any })._worker;
        if (tail && typeof tail.error === "function") {
          // A paused worker only records the error instead of propagating it,
          // so clear the paused flag along the chain first.
          for (let w = tail; w; w = w.previous) {
            try {
              w.isPaused = false;
            } catch {
              break;
            }
          }
          tail.error(new Error("dossier download aborted"));
          return;
        }
      } catch {
        // fall through to the documented API
      }
      try {
        zipStream.pause();
      } catch {
        // ignore
      }
    };

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        zipStream
          .on("data", (chunk: Uint8Array) => {
            if (streamDone) return;
            try {
              controller.enqueue(chunk);
            } catch {
              // Controller already closed/cancelled underneath us — stop
              // producing rather than throwing back into JSZip.
              streamDone = true;
              destroyZipStream();
              return;
            }
            if ((controller.desiredSize ?? 1) <= 0) zipStream.pause();
          })
          .on("error", (err: unknown) => {
            // Already finished/cancelled (our own teardown error included):
            // nothing to report, the client is gone.
            if (streamDone) return;
            streamDone = true;
            // The response headers are long gone by now, so this can never
            // become a 500. Erroring the stream aborts the HTTP body instead,
            // so the client sees a FAILED download rather than a truncated ZIP
            // that looks complete.
            console.error(
              `❌ dossier: zip stream error for application ${applicationNumber} (archive aborted mid-download):`,
              err,
            );
            try {
              controller.error(err);
            } catch {
              // already closed/cancelled
            }
            destroyZipStream();
          })
          .on("end", () => {
            if (streamDone) return;
            streamDone = true;
            try {
              controller.close();
            } catch {
              // already closed/cancelled
            }
          });
        zipStream.resume();
      },
      pull() {
        if (streamDone) return;
        zipStream.resume();
      },
      cancel(reason) {
        // Client went away: stop producing entirely and release the chain.
        if (streamDone) return;
        streamDone = true;
        console.warn(
          `⚠️ dossier: download cancelled by client for application ${applicationNumber}`,
          reason instanceof Error ? reason.message : reason,
        );
        destroyZipStream();
      },
    });

    const zipName = `dossier-${safeFileName(applicationNumber, "application").replace(/\s+/g, "_")}.zip`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    if (message.includes("Invalid session") || message.includes("JWT")) {
      const res = NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 });
      clearSessionCookie(res);
      return res;
    }
    console.error("❌ dossier download error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to build the dossier ZIP" },
      { status: 500 },
    );
  }
}
