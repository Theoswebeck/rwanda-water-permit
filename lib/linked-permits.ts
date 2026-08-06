import { supabase } from "@/lib/supabase";

export type LinkedPermitLite = {
  id: string;
  permit_number: string;
  permit_pdf_url: string | null;
};

type ApprovedAppLike = {
  id: string;
  status?: string | null;
  is_renewal?: boolean | null;
  is_modification?: boolean | null;
  renewed_from_permit_id?: string | null;
  internal_notes?: string | null;
};

/**
 * Resolve the permit backing each approved application.
 *
 * Three linkage shapes exist and all must be covered, otherwise the
 * approved-application Actions menu shows "No linked permit found":
 *   * new applications + transfers -> permits.application_id
 *   * renewals                     -> applications.renewed_from_permit_id
 *   * modifications                -> internal_notes.originalPermitId
 */
export async function fetchLinkedPermitsForApprovedApps(
  applications: ApprovedAppLike[]
): Promise<Record<string, LinkedPermitLite>> {
  const approvedApps = applications.filter((a) => a.status === "approved");
  if (approvedApps.length === 0) return {};

  const appIdSet = new Set<string>(approvedApps.map((a) => a.id));
  const appToPermitId: Record<string, string> = {};
  const permitIdsToFetch = new Set<string>();

  for (const app of approvedApps) {
    if (app.is_renewal === true && app.renewed_from_permit_id) {
      const pid = String(app.renewed_from_permit_id);
      appToPermitId[app.id] = pid;
      permitIdsToFetch.add(pid);
      continue;
    }

    if (app.is_modification === true && app.internal_notes) {
      try {
        const parsed = JSON.parse(String(app.internal_notes));
        const pid = parsed?.originalPermitId;
        if (typeof pid === "string" && pid.trim()) {
          appToPermitId[app.id] = pid;
          permitIdsToFetch.add(pid);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  const { data: permitsByApp, error: permitsByAppError } = await supabase
    .from("permits")
    .select("id, application_id, permit_number, permit_pdf_url")
    .in("application_id", Array.from(appIdSet));
  if (permitsByAppError) throw permitsByAppError;

  let permitsById: any[] = [];
  if (permitIdsToFetch.size > 0) {
    const { data: permits, error: permitsByIdError } = await supabase
      .from("permits")
      .select("id, application_id, permit_number, permit_pdf_url")
      .in("id", Array.from(permitIdsToFetch));
    if (permitsByIdError) throw permitsByIdError;
    permitsById = (permits as any[] | null) || [];
  }

  const permitById = new Map<string, LinkedPermitLite>();
  for (const p of permitsById as any[]) {
    if (p?.id && p?.permit_number) {
      permitById.set(String(p.id), {
        id: String(p.id),
        permit_number: String(p.permit_number),
        permit_pdf_url: p.permit_pdf_url ?? null,
      });
    }
  }

  const linked: Record<string, LinkedPermitLite> = {};

  for (const p of (permitsByApp || []) as any[]) {
    const applicationId = String(p.application_id);
    if (!appIdSet.has(applicationId)) continue;
    if (!p?.id || !p?.permit_number) continue;
    linked[applicationId] = {
      id: String(p.id),
      permit_number: String(p.permit_number),
      permit_pdf_url: p.permit_pdf_url ?? null,
    };
  }

  for (const [appId, pid] of Object.entries(appToPermitId)) {
    const permit = permitById.get(pid);
    if (permit) linked[appId] = permit;
  }

  return linked;
}
