"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle,
  AlertTriangle,
  FileCheck,
  Shield,
  Loader2,
  Star,
  ArrowLeft,
  Home,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
// syncPermitToRegistry was removed — permit_registry RLS only allows the
// service role to UPDATE, so syncs must go through the server-side API route.
import { getApplicationExpiration } from "@/lib/application-expiration";
import { selectPermitVariant, isConcessionApplication, type PermitVariant } from "@/lib/permit-variant";
import { buildChildPermitNumber } from "@/lib/permit-number-utils";
import { splitContractSectionsByLanguage, parseSectionHeading } from "@/lib/contract-terms";
import {
  buildContractPlaceholderContext,
  type TransferPermitContext,
} from "@/lib/contract-placeholders";
import { getResolvedContractTerms } from "@/lib/document-slots";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

function parseInternalNotes(input: unknown): Record<string, any> | null {
  if (typeof input !== "string" || !input.trim()) return null;
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveDurationFromAssessor(
  applicationData: any,
  parsedNotes: Record<string, any> | null,
  transferPermit?: TransferPermitContext | null,
): number {
  const assessorAdjustments = parsedNotes?._assessorAdjustments;
  if (
    typeof assessorAdjustments?.permitLengthYears === "number" &&
    Number.isFinite(assessorAdjustments.permitLengthYears) &&
    assessorAdjustments.permitLengthYears >= 1 &&
    assessorAdjustments.permitLengthYears <= 15
  ) {
    return assessorAdjustments.permitLengthYears;
  }
  // Transfer fallback: remaining validity of the transferred permit.
  // Matches the priority chain in contract-placeholders resolveDurationYears
  // so the preview and the issued permit stay consistent.
  const isTransfer =
    applicationData?.application_type === "transfer" ||
    parsedNotes?.isTransfer === true;
  if (isTransfer && transferPermit?.expiry_date) {
    const expiry = new Date(`${transferPermit.expiry_date}T00:00:00Z`);
    if (!Number.isNaN(expiry.getTime())) {
      const years = Math.ceil(
        (expiry.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000),
      );
      if (years >= 1 && years <= 15) return years;
    }
  }
  if (
    typeof applicationData?.proposed_duration_years === "number" &&
    Number.isFinite(applicationData.proposed_duration_years) &&
    applicationData.proposed_duration_years >= 1 &&
    applicationData.proposed_duration_years <= 15
  ) {
    return applicationData.proposed_duration_years;
  }
  if (
    typeof parsedNotes?.permitLengthYears === "number" &&
    Number.isFinite(parsedNotes.permitLengthYears) &&
    parsedNotes.permitLengthYears >= 1 &&
    parsedNotes.permitLengthYears <= 15
  ) {
    return parsedNotes.permitLengthYears;
  }
  return 5;
}

function resolveVolumeOrAreaFromAssessor(
  applicationData: any,
  parsedNotes: Record<string, any> | null,
  isConcession: boolean
): number {
  const assessorAdjustments = parsedNotes?._assessorAdjustments;
  if (
    typeof assessorAdjustments?.recommendedVolumeM3 === "number" &&
    Number.isFinite(assessorAdjustments.recommendedVolumeM3) &&
    assessorAdjustments.recommendedVolumeM3 > 0
  ) {
    return assessorAdjustments.recommendedVolumeM3;
  }

  if (isConcession) {
    const area = applicationData?.concession_area;
    if (typeof area === "number" && Number.isFinite(area) && area > 0) return area;
    const notesArea = parsedNotes?.concessionArea;
    if (typeof notesArea === "number" && Number.isFinite(notesArea) && notesArea > 0) return notesArea;
    const fishHa = parsedNotes?.fishLakeAreaHectares;
    if (typeof fishHa === "number" && Number.isFinite(fishHa) && fishHa > 0) return fishHa;
  }

  if (
    typeof applicationData?.max_yearly_volume_m3 === "number" &&
    Number.isFinite(applicationData.max_yearly_volume_m3) &&
    applicationData.max_yearly_volume_m3 > 0
  ) {
    return applicationData.max_yearly_volume_m3;
  }
  if (
    typeof applicationData?.estimated_usage_volume === "number" &&
    Number.isFinite(applicationData.estimated_usage_volume) &&
    applicationData.estimated_usage_volume > 0
  ) {
    return applicationData.estimated_usage_volume;
  }
  const formVolume = parsedNotes?.waterAbstractionDetails?.[0]?.maxAverageYearly;
  if (typeof formVolume === "number" && Number.isFinite(formVolume) && formVolume > 0) {
    return formVolume;
  }

  // Fallback for manual permit transfers — data lives in transferFormData, not application columns
  const tfData = parsedNotes?.transferFormData;
  const tfAllowance = tfData?.waterAllowance ? parseFloat(String(tfData.waterAllowance)) : NaN;
  if (Number.isFinite(tfAllowance) && tfAllowance > 0) return tfAllowance;

  return 0;
}

async function syncRegistryViaApi(
  permitNumber: string,
  updates: Record<string, unknown>
): Promise<{ synced: boolean; error?: string }> {
  try {
    const resp = await fetch('/api/permit-registry/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permitNumber, updates }),
    })
    const json = await resp.json().catch(() => null)
    if (!resp.ok) return { synced: false, error: json?.message || resp.statusText }
    return { synced: json?.synced === true }
  } catch (err) {
    return { synced: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export default function TermsConditionsPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params.id as string;

  const [isProcessing, setIsProcessing] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [termsVariant, setTermsVariant] = useState<PermitVariant | null>(null);
  const [isLoadingTerms, setIsLoadingTerms] = useState(true);
  const [termsLoadError, setTermsLoadError] = useState<string | null>(null);
  const [termsApplication, setTermsApplication] = useState<any | null>(null);
  const [transferPermitCtx, setTransferPermitCtx] = useState<TransferPermitContext | null>(null);
  const [issuedPermit, setIssuedPermit] = useState<{
    permitId: string;
    permitNumber: string;
    durationYears: number;
    isModification: boolean;
  } | null>(null);

  const [applicationNumber, setApplicationNumber] = useState<string>("");
  const [projectTitle, setProjectTitle] = useState<string>("");
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  useEffect(() => {
    if (!applicationId) return;

    let cancelled = false;
    async function loadData() {
      setIsLoadingTerms(true);
      setTermsLoadError(null);
      try {
        const { data: headerData, error: headerError } = await supabase
          .from("applications")
          .select("application_number, project_title")
          .eq("id", applicationId)
          .single() as { data: any; error: any };

        if (!cancelled && headerData) {
          setApplicationNumber(headerData.application_number || "");
          setProjectTitle(headerData.project_title || "");
        }
        if (headerError) console.warn("Could not load application header:", headerError);

        const { data, error } = await supabase
          .from("applications")
          .select(
            `
            id,
            application_type,
            province,
            district,
            sector,
            cell,
            village,
            coordinates,
            internal_notes,
            water_source,
            water_body_name,
            water_taking_method,
            max_daily_volume_m3,
            max_yearly_volume_m3,
            estimated_usage_volume,
            usage_unit,
            proposed_duration_years,
            assessor_recommended_volume_m3,
            concession_area,
            intended_activities,
            water_purpose,
            is_renewal,
            renewed_from_permit_id,
            applicant:users!applicant_id(account_type, first_name, last_name, company_name, id_number)
          `
          )
          .eq("id", applicationId)
          .single();

        if (error) throw error;
        if (!data) throw new Error("Application not found");

        // Populate the applicant identity from the logged-in user's profile
        // via the project's own auth API (critical for transfers: name + NID).
        try {
          const meResp = await fetch("/api/auth/me", { method: "GET", headers: { "Content-Type": "application/json" }, cache: "no-store" });
          const meJson = await meResp.json().catch(() => null);
          const profile = meJson?.profile as Record<string, unknown> | undefined;
          if (profile) {
            const applicant = (data as any).applicant || {};
            const loggedInNid = typeof profile.id_number === "string" ? (profile.id_number as string).trim() : "";
            if (loggedInNid) applicant.id_number = loggedInNid;
            if (profile.first_name) applicant.first_name = profile.first_name;
            if (profile.last_name) applicant.last_name = profile.last_name;
            if (profile.company_name) applicant.company_name = profile.company_name;
            if (profile.account_type) applicant.account_type = profile.account_type;
            (data as any).applicant = applicant;
          }
        } catch (profileErr) {
          console.warn("⚠️ Could not load logged-in user profile for contract identity:", profileErr);
        }

        // For transfers: the contract should mirror the original permit's terms
        // (flow rate, volume, duration, coordinates, etc.) — only the signatory changes.
        let parsedNotes: Record<string, any> | null = null;
        try {
          parsedNotes = typeof (data as any).internal_notes === "string"
            ? JSON.parse((data as any).internal_notes)
            : null;
        } catch { /* ignore */ }

        const isTransfer =
          (data as any).application_type === "transfer" ||
          parsedNotes?.isTransfer === true;

        // Manual/legacy permits have a sentinel ID like "manual-0454/RWB/2021" that is not a
        // real UUID in the permits table.  Skip the DB lookup for those; the relevant
        // technical data was already captured in internal_notes.transferFormData at submission time.
        const isManualPermit = typeof parsedNotes?.originalPermitId === 'string' &&
          (parsedNotes.originalPermitId as string).startsWith('manual-');

        // Manual-permit transfers: permit number + expiry live in transferFormData.
        // Seed the transferPermit context from there so the contract reuses them.
        if (isTransfer && isManualPermit && !cancelled) {
          const tf = (parsedNotes?.transferFormData as Record<string, any> | undefined) || {};
          const manualPermitNumber =
            (parsedNotes?.originalPermitNumber as string | undefined)?.trim() || null;
          const manualExpiry =
            typeof tf.expirationDate === "string" && tf.expirationDate.trim()
              ? tf.expirationDate
              : null;
          setTransferPermitCtx({
            permit_number: manualPermitNumber,
            expiry_date: manualExpiry,
          });
        }

        if (isTransfer && parsedNotes?.originalPermitId && !isManualPermit) {
          try {
            const { data: originalPermit } = await supabase
              .from("permits")
              .select("application_id, permit_number, expiry_date")
              .eq("id", parsedNotes.originalPermitId)
              .single() as {
                data: {
                  application_id?: string | null;
                  permit_number?: string | null;
                  expiry_date?: string | null;
                } | null;
                error: any;
              };

            if (!cancelled && originalPermit) {
              setTransferPermitCtx({
                permit_number: originalPermit.permit_number ?? null,
                expiry_date: originalPermit.expiry_date ?? null,
              });
            }

            const origAppId = originalPermit?.application_id;
            if (origAppId) {
              const { data: origApp } = await supabase
                .from("applications")
                .select(`
                  province, district, sector, cell, village,
                  coordinates, internal_notes, water_source, water_body_name,
                  max_daily_volume_m3, max_yearly_volume_m3,
                  estimated_usage_volume, usage_unit, water_taking_method,
                  proposed_duration_years, concession_area, intended_activities
                `)
                .eq("id", origAppId)
                .single() as { data: Record<string, any> | null; error: any };

              if (origApp) {
                const technicalFields = [
                  "province", "district", "sector", "cell", "village",
                  "coordinates", "water_source", "water_body_name",
                  "max_daily_volume_m3", "max_yearly_volume_m3",
                  "estimated_usage_volume", "usage_unit", "water_taking_method",
                  "proposed_duration_years", "concession_area", "intended_activities",
                ] as const;
                for (const field of technicalFields) {
                  const origVal = origApp[field];
                  const currVal = (data as any)[field];
                  const currIsEmpty = currVal === null || currVal === undefined || currVal === "" || currVal === 0;
                  if (currIsEmpty && origVal != null && origVal !== "") {
                    (data as any)[field] = origVal;
                  }
                }
                // Also merge internal_notes for technical details (flow rate, abstraction method, etc.)
                // while preserving the transfer application's own notes.
                if (origApp.internal_notes) {
                  let origNotes: Record<string, any> | null = null;
                  try {
                    origNotes = typeof origApp.internal_notes === "string"
                      ? JSON.parse(origApp.internal_notes)
                      : origApp.internal_notes;
                  } catch { /* ignore */ }
                  if (origNotes && parsedNotes) {
                    const technicalNoteKeys = [
                      "waterAbstractionDetails", "abstractionMethod",
                      "waterSourceLatitude", "waterSourceLongitude",
                      "waterSourceProvince", "waterSourceDistrict",
                      "waterSourceSector", "waterSourceCell", "waterSourceVillage",
                      "intendedActivities", "officeProvince", "officeDistrict",
                      "officeSector", "_assessorAdjustments",
                    ];
                    for (const key of technicalNoteKeys) {
                      if (origNotes[key] != null && parsedNotes[key] == null) {
                        parsedNotes[key] = origNotes[key];
                      }
                    }
                    (data as any).internal_notes = JSON.stringify(parsedNotes);
                  }
                }
              }
            }
          } catch (origErr) {
            console.warn("⚠️ Could not load original application for transfer contract:", origErr);
          }
        }

        const isRenewal = (data as any).is_renewal === true || parsedNotes?.isRenewal === true;
        const renewedFromPermitId = (data as any).renewed_from_permit_id || parsedNotes?.originalPermitId;
        if (isRenewal && renewedFromPermitId) {
          try {
            const { data: renewalPermit, error: renewalPermitError } = await supabase
              .from("permits")
              .select(`
                permit_number,
                issued_date,
                expiry_date,
                application_id,
                application:applications!application_id(
                  internal_notes,
                  proposed_duration_years,
                  assessor_recommended_volume_m3,
                  max_yearly_volume_m3,
                  concession_area,
                  intended_activities,
                  water_purpose
                )
              `)
              .eq("id", renewedFromPermitId)
              .maybeSingle() as { data: any; error: any };

            if (renewalPermitError) {
              console.warn("⚠️ Could not load renewal source permit application for terms:", renewalPermitError);
            } else {
              const sourceApp = renewalPermit?.application;
              const sourceNotes = parseInternalNotes(sourceApp?.internal_notes);
              const sourceIsConcession = isConcessionApplication(sourceApp || data);
              const sourceDuration = resolveDurationFromAssessor(sourceApp, sourceNotes);
              const sourceVolumeOrArea = resolveVolumeOrAreaFromAssessor(sourceApp, sourceNotes, sourceIsConcession);

              const mergedNotes = {
                ...(parsedNotes || {}),
                _assessorAdjustments: {
                  ...((parsedNotes as any)?._assessorAdjustments || {}),
                  ...((sourceNotes as any)?._assessorAdjustments || {}),
                  permitLengthYears: sourceDuration,
                  recommendedVolumeM3: sourceVolumeOrArea,
                  adjustedAt: new Date().toISOString(),
                },
              };

              (data as any).internal_notes = JSON.stringify(mergedNotes);
              parsedNotes = mergedNotes;
              (data as any).proposed_duration_years = sourceDuration;
              if (sourceIsConcession) {
                (data as any).concession_area = sourceVolumeOrArea;
              } else {
                (data as any).max_yearly_volume_m3 = sourceVolumeOrArea;
                (data as any).assessor_recommended_volume_m3 = sourceVolumeOrArea;
              }

              if ((!Array.isArray((data as any).intended_activities) || (data as any).intended_activities.length === 0) && Array.isArray(sourceApp?.intended_activities)) {
                (data as any).intended_activities = sourceApp.intended_activities;
              }
              if (!(data as any).water_purpose && sourceApp?.water_purpose) {
                (data as any).water_purpose = sourceApp.water_purpose;
              }

              // Set the original permit context so the contract preview shows
              // the correct permit number, duration, and concession area.
              if (!cancelled) {
                setTransferPermitCtx({
                  permit_number: renewalPermit.permit_number ?? null,
                  issue_date: renewalPermit.issued_date ?? null,
                  expiry_date: renewalPermit.expiry_date ?? null,
                  concession_area: sourceApp?.concession_area ?? null,
                });
              }
            }
          } catch (renewalErr) {
            console.warn("⚠️ Could not apply renewal assessor values to terms display:", renewalErr);
          }
        }

        const variant = selectPermitVariant(data as any);
        if (!cancelled) {
          setTermsVariant(variant);
          setTermsApplication(data);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load terms variant.";
        if (!cancelled) {
          setTermsVariant(null);
          setTermsApplication(null);
          setTermsLoadError(message);
        }
      } finally {
        if (!cancelled) setIsLoadingTerms(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  const resolvedTerms = useMemo(() => {
    if (!termsVariant || !termsApplication) return null;
    // Slot-aware: returns the variant template with assessor text overrides
    // applied and `{{...}}` placeholders pre-filled.
    return getResolvedContractTerms({
      application: termsApplication as any,
      applicationNumber: termsApplication.application_number ?? undefined,
      transferPermit: transferPermitCtx ?? null,
      variantOverride: termsVariant,
    });
  }, [termsApplication, transferPermitCtx, termsVariant]);

  const visibleLanguageGroups = useMemo(() => {
    if (!resolvedTerms) return [];

    const isSignatureSection = (title: string) => {
      const normalized = title.trim().toLowerCase();
      return normalized.includes("signature") || normalized.includes("imikono");
    };

    const { englishSections, kinyarwandaSections } = splitContractSectionsByLanguage(resolvedTerms.sections);
    return [
      {
        key: "en",
        label: "English",
        sections: englishSections.filter((section) => !isSignatureSection(section.title)),
      },
      {
        key: "rw",
        label: "Kinyarwanda",
        sections: kinyarwandaSections.filter((section) => !isSignatureSection(section.title)),
      },
    ].filter((group) => group.sections.length > 0);
  }, [resolvedTerms]);

  const placeholderCtx = useMemo(() => {
    if (!termsApplication) return null;
    try {
      return buildContractPlaceholderContext(
        termsApplication,
        applicationNumber,
        transferPermitCtx,
      );
    } catch {
      return null;
    }
  }, [termsApplication, applicationNumber, transferPermitCtx]);

  const navigateBack = () => {
    router.push(`/dashboard/application/${applicationId}`);
  };

  const handleAcceptTerms = async () => {
    if (isProcessing) return;
    if (!acceptedTerms) {
      console.error("Please accept the terms and conditions to proceed");
      return;
    }

    setIsProcessing(true);
    try {
      console.log('🚀 Starting terms acceptance process...');
      const acceptedAt = new Date();
      const acceptedAtIso = acceptedAt.toISOString();
      // ─── Issuance date base ─────────────────────────────────────────
      // The legal effective date is the day the Director General approved
      // the application — that's `applications.approved_at`. The user may
      // delay clicking accept arbitrarily long after approval; we still
      // anchor `permits.issued_date` (and the expiry derived from it) to
      // the approval day, not the click day. See the design spec:
      // docs/superpowers/specs/2026-04-29-issuance-date-locks-on-approval-design.md
      // and `lib/permit/resolve-issue-date.ts`.
      // The actual `issuanceBaseDate` and date-only string are derived
      // below once we have the application row; this comment documents
      // the intent so a future reader doesn't reach for `acceptedAt`.
      const computeDurationFromPermitDates = (issuedRaw: unknown, expiryRaw: unknown): number | null => {
        if (typeof issuedRaw !== 'string' || typeof expiryRaw !== 'string') return null;
        const issued = new Date(issuedRaw);
        const expiry = new Date(expiryRaw);
        if (Number.isNaN(issued.getTime()) || Number.isNaN(expiry.getTime())) return null;
        let years = expiry.getFullYear() - issued.getFullYear();
        const anniversary = new Date(issued.getFullYear() + years, issued.getMonth(), issued.getDate());
        if (expiry.getTime() < anniversary.getTime()) years -= 1;
        return years > 0 ? years : null;
      };

      // First, get the full application data
      const { data: applicationData, error: fetchError } = await supabase
        .from('applications')
        .select(`
          *,
          applicant:users!applicant_id(*)
        `)
        .eq('id', applicationId)
        .single() as { data: any; error: any };

      if (fetchError) {
        console.error('❌ Error fetching application:', fetchError);
        throw fetchError;
      }
      if (!applicationData) {
        throw new Error('Application not found');
      }
      // Status gate: only approved_pending_permit applications can proceed to issuance
      if (applicationData.status !== 'approved_pending_permit') {
        throw new Error(`Application status is '${applicationData.status}' — only approved_pending_permit applications can have their terms accepted.`);
      }
      console.log('✅ Application data loaded:', applicationData.application_number);

      // Resolve the issuance-date base. Priority: applications.approved_at
      // (the legal effective date — the day the Director General signed)
      // → today (defensive: this code path is only reachable from
      // status=approved_pending_permit which by construction has
      // approved_at set, but we guard anyway). The expiry is computed as
      // base + duration so the contract's "valid from X to Y" line is
      // anchored to the same X the registry stores.
      const issuanceBase: Date = (() => {
        const raw = applicationData.approved_at;
        if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
        if (typeof raw === 'string' && raw.trim()) {
          const parsed = new Date(raw);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        console.warn('⚠️ approved_at missing on application; falling back to today for issuance date.', {
          applicationId,
          status: applicationData.status,
        });
        return acceptedAt;
      })();
      const issuanceBaseDateOnly = issuanceBase.toISOString().split('T')[0];
      const computeExpiryDateOnly = (durationYears: number) => {
        const expiry = new Date(issuanceBase);
        expiry.setFullYear(expiry.getFullYear() + durationYears);
        return expiry.toISOString().split('T')[0];
      };
      console.log('📅 Issuance date locked to approved_at:', issuanceBaseDateOnly);

      // Defense-in-depth: transfer terms can only be accepted by the approved transferee.
      const authResponse = await supabase.auth.getUser();
      const currentUser = (authResponse.data as any)?.user as { id?: string } | undefined;
      if (!currentUser?.id) {
        throw new Error('Authentication required to accept terms.');
      }

      let transferNotes: Record<string, any> | null = null;
      try {
        transferNotes = applicationData.internal_notes ? JSON.parse(applicationData.internal_notes) : null;
      } catch {
        transferNotes = null;
      }
      const isTransferByType = (applicationData as any).application_type === 'transfer';
      const isTransferByNotes = transferNotes?.isTransfer === true;
      if (isTransferByType || isTransferByNotes) {
        const approval = transferNotes?.transferApproval;
        const transfereeAllowed =
          approval?.transfereeApproved === true &&
          typeof approval?.transfereeUserId === 'string' &&
          approval.transfereeUserId === currentUser.id;
        if (!transfereeAllowed) {
          throw new Error('Only the approved transferee can accept transfer terms.');
        }
      }

      // Enforce expiration: if more than 6 months since submission and permit not yet issued, block issuance.
      const expiration = getApplicationExpiration({
        submitted_at: applicationData.submitted_at ?? null,
        hasPermit: false,
      });
      if (expiration.isExpired) {
        console.warn('⛔ Application is expired; blocking permit issuance:', {
          application_id: applicationId,
          submitted_at: applicationData.submitted_at,
          expires_at: expiration.expiresAt?.toISOString(),
        });

        try {
          await (supabase as any)
            .from('applications')
            .update({ status: 'expired', updated_at: new Date().toISOString() })
            .eq('id', applicationId);
        } catch (e) {
          console.warn('⚠️ Failed to set status=expired (best-effort).', e);
        }

        throw new Error('This application has expired (6 months since submission). The permit can no longer be issued.');
      }

      let parsedNotes: Record<string, any> | null = null;
      try {
        parsedNotes = applicationData.internal_notes ? JSON.parse(applicationData.internal_notes) : null;
      } catch { parsedNotes = null; }

      const isRenewalApplication = applicationData.is_renewal === true || 
        (parsedNotes?.isRenewal === true);
      
      const renewedFromPermitId = applicationData.renewed_from_permit_id || parsedNotes?.originalPermitId || null;
      if (isRenewalApplication && renewedFromPermitId) {
        try {
          const { data: renewalPermit, error: renewalPermitError } = await supabase
            .from("permits")
            .select(`
              application_id,
              application:applications!application_id(
                internal_notes,
                proposed_duration_years,
                assessor_recommended_volume_m3,
                max_yearly_volume_m3,
                concession_area,
                intended_activities,
                water_purpose
              )
            `)
            .eq("id", renewedFromPermitId)
            .maybeSingle() as { data: any; error: any };

          if (renewalPermitError) {
            console.warn("⚠️ Could not load renewal source permit application for terms acceptance:", renewalPermitError);
          } else {
            const sourceApp = renewalPermit?.application;
            if (sourceApp) {
              const sourceNotes = parseInternalNotes(sourceApp.internal_notes);
              const sourceIsConcession = isConcessionApplication(sourceApp || applicationData);
              const sourceDuration = resolveDurationFromAssessor(sourceApp, sourceNotes);
              const sourceVolumeOrArea = resolveVolumeOrAreaFromAssessor(sourceApp, sourceNotes, sourceIsConcession);

              const mergedNotes = {
                ...(parsedNotes || {}),
                _assessorAdjustments: {
                  ...((parsedNotes as any)?._assessorAdjustments || {}),
                  permitLengthYears: sourceDuration,
                  recommendedVolumeM3: sourceVolumeOrArea,
                  adjustedAt: new Date().toISOString(),
                },
              };
              parsedNotes = mergedNotes;
              applicationData.internal_notes = JSON.stringify(mergedNotes);
              applicationData.proposed_duration_years = sourceDuration;
              if (sourceIsConcession) {
                applicationData.concession_area = sourceVolumeOrArea;
              } else {
                applicationData.max_yearly_volume_m3 = sourceVolumeOrArea;
                applicationData.assessor_recommended_volume_m3 = sourceVolumeOrArea;
              }
              if ((!Array.isArray(applicationData.intended_activities) || applicationData.intended_activities.length === 0) && Array.isArray(sourceApp.intended_activities)) {
                applicationData.intended_activities = sourceApp.intended_activities;
              }
              if (!applicationData.water_purpose && sourceApp.water_purpose) {
                applicationData.water_purpose = sourceApp.water_purpose;
              }
            }
          }
        } catch (renewalErr) {
          console.warn("⚠️ Could not apply renewal assessor values during terms acceptance:", renewalErr);
        }
      }

      const assessorAdjustments = parsedNotes?._assessorAdjustments;
      const isConcession = isConcessionApplication(applicationData as any);
      const resolvedDurationYearsGlobal = resolveDurationFromAssessor(applicationData, parsedNotes, transferPermitCtx);
      const resolvedVolumeM3 = resolveVolumeOrAreaFromAssessor(applicationData, parsedNotes, isConcession);
      const resolvedAllowanceUnit = isConcession ? 'ha' : (applicationData.usage_unit || parsedNotes?.transferFormData?.allowanceUnit || 'm³');

      console.log('📊 Resolved assessor-approved terms:', {
        durationYears: resolvedDurationYearsGlobal,
        volumeM3: resolvedVolumeM3,
        source: assessorAdjustments ? 'assessor adjustments' : 'application data',
      });

      const isTransferApplication =
        (applicationData as any).application_type === 'transfer' ||
        parsedNotes?.isTransfer === true;

      const transferOriginalPermitId =
        (parsedNotes?.transferApproval?.originalPermitId as string | undefined) ||
        (parsedNotes?.originalPermitId as string | undefined) ||
        null;

      const isModificationApplication = applicationData.is_modification === true ||
        (parsedNotes?.isModification === true);
      
      const modificationOriginalPermitId = parsedNotes?.originalPermitId || null;

      let permitData: any;
      let transferOwnershipReassigned = false;

      // Resolved fields for registry sync — used by all branches below.
      const permitHolder: string | undefined =
        applicationData.applicant?.company_name?.trim() ||
        [applicationData.applicant?.first_name, applicationData.applicant?.last_name]
          .filter(Boolean).join(' ').trim() ||
        undefined;

      const registrySyncContact: string | undefined =
        applicationData.applicant?.email?.trim() ||
        applicationData.applicant?.phone?.trim() ||
        undefined;

      // Extract effective lat/lng for registry/terms context, preferring assessor-approved adjustments.
      const _geom = applicationData.coordinates as any;
      let _registryLat: number | undefined;
      let _registryLng: number | undefined;
      const trySetRegistryLatLng = (rawLat: unknown, rawLng: unknown) => {
        if (_registryLat != null || rawLat == null || rawLng == null) return;
        const _latN = parseFloat(String(rawLat));
        const _lngN = parseFloat(String(rawLng));
        if (Number.isFinite(_latN) && Number.isFinite(_lngN)) {
          _registryLat = _latN;
          _registryLng = _lngN;
        }
      };
      const registryAssessorAdjustments = parsedNotes?._assessorAdjustments;
      trySetRegistryLatLng(
        registryAssessorAdjustments?.waterSourceLatitude,
        registryAssessorAdjustments?.waterSourceLongitude,
      );
      trySetRegistryLatLng(parsedNotes?.waterSourceLatitude, parsedNotes?.waterSourceLongitude);
      if (_registryLat == null && _geom?.type === 'Point' && Array.isArray(_geom.coordinates) && _geom.coordinates.length >= 2) {
        const [_lng, _lat] = _geom.coordinates;
        trySetRegistryLatLng(_lat, _lng);
      }
      if (_registryLat == null && Array.isArray(registryAssessorAdjustments?.waterSourcePolygonPoints)) {
        const firstPoint = registryAssessorAdjustments.waterSourcePolygonPoints[0];
        const _latRaw = firstPoint?.latitude;
        const _lngRaw = firstPoint?.longitude;
        if (_latRaw != null && _lngRaw != null) {
          trySetRegistryLatLng(_latRaw, _lngRaw);
        }
      }

      const registrySyncLocationParts = [
        applicationData.province, applicationData.district,
        applicationData.sector, applicationData.cell, applicationData.village,
      ].filter(Boolean);
      const registrySyncLocation = registrySyncLocationParts.length > 0
        ? registrySyncLocationParts.join(', ')
        : undefined;

      if (isModificationApplication) {
        const permitRef = parsedNotes?.permitReference as { normalizedPermitNumber?: string; registrySnapshot?: { registry_id?: string; permit_number?: string } } | undefined;
        const isRegistryOnly = !modificationOriginalPermitId ||
          (typeof modificationOriginalPermitId === 'string' && modificationOriginalPermitId.startsWith('manual-'));

        console.log('🔧 Processing MODIFICATION —', isRegistryOnly ? 'registry-only permit' : 'linked permit', modificationOriginalPermitId);
        console.log('📊 Using assessor-approved terms — duration:', resolvedDurationYearsGlobal, 'years, volume:', resolvedVolumeM3, 'm³');

        const resolvedDurationYears: number | null = resolvedDurationYearsGlobal !== 5
          ? resolvedDurationYearsGlobal
          : (() => {
              if (typeof assessorAdjustments?.permitLengthYears === 'number') return assessorAdjustments.permitLengthYears;
              if (typeof applicationData.proposed_duration_years === 'number' &&
                  Number.isFinite(applicationData.proposed_duration_years) &&
                  applicationData.proposed_duration_years >= 1) return applicationData.proposed_duration_years;
              if (typeof parsedNotes?.permitLengthYears === 'number' &&
                  Number.isFinite(parsedNotes.permitLengthYears) &&
                  parsedNotes.permitLengthYears >= 1) return parsedNotes.permitLengthYears;
              return null;
            })();

        const newIssuedDate = issuanceBaseDateOnly;
        const newExpiryDate = resolvedDurationYears
          ? computeExpiryDateOnly(resolvedDurationYears)
          : null;

        if (!isRegistryOnly) {
          const { data: currentPermit, error: fetchPermitErr } = await supabase
            .from('permits')
            .select('*')
            .eq('id', modificationOriginalPermitId)
            .single() as { data: any; error: any };

          if (fetchPermitErr || !currentPermit) {
            console.error('❌ Error fetching original permit for modification:', fetchPermitErr);
            throw fetchPermitErr || new Error('Original permit not found for modification');
          }

          console.log('📋 Original permit values:', {
            permit_number: currentPermit.permit_number,
            water_source: currentPermit.water_source,
            purpose: currentPermit.purpose,
            water_allowance: currentPermit.water_allowance,
            expiry_date: currentPermit.expiry_date,
          });

          const permitUpdatePayload: Record<string, unknown> = {
            status: 'active',
            is_modification: true,
            updated_at: new Date().toISOString(),
          };

          if (applicationData.water_source) {
            permitUpdatePayload.water_source = applicationData.water_source;
          }
          if (applicationData.water_purpose) {
            permitUpdatePayload.purpose = applicationData.water_purpose;
          }
          if (resolvedVolumeM3 > 0) {
            permitUpdatePayload.water_allowance = resolvedVolumeM3;
          } else if (applicationData.estimated_usage_volume != null && applicationData.estimated_usage_volume > 0) {
            permitUpdatePayload.water_allowance = applicationData.estimated_usage_volume;
          }
          permitUpdatePayload.allowance_unit = resolvedAllowanceUnit || applicationData.usage_unit || 'm³';
          permitUpdatePayload.issued_date = newIssuedDate;
          if (resolvedDurationYears) {
            permitUpdatePayload.expiry_date = newExpiryDate;
          }

          permitUpdatePayload.conditions = {
            conditions: [
              'Comply with all environmental regulations',
              'Submit quarterly usage reports',
              'Allow inspections as required',
              ...(applicationData.approval_conditions ? [applicationData.approval_conditions] : []),
            ],
            location: {
              province: applicationData.province || currentPermit.conditions?.location?.province,
              district: applicationData.district || currentPermit.conditions?.location?.district,
              sector: applicationData.sector || currentPermit.conditions?.location?.sector,
              cell: applicationData.cell || currentPermit.conditions?.location?.cell,
              village: applicationData.village || currentPermit.conditions?.location?.village,
              coordinates: applicationData.coordinates || currentPermit.conditions?.location?.coordinates,
              description: applicationData.location_description || currentPermit.conditions?.location?.description,
            },
            project: {
              title: applicationData.project_title || currentPermit.conditions?.project?.title,
              description: applicationData.project_description || currentPermit.conditions?.project?.description,
              value: applicationData.project_value || currentPermit.conditions?.project?.value,
            },
            modification_history: [
              ...(currentPermit.conditions?.modification_history || []),
              {
                modification_application_id: applicationId,
                modified_at: acceptedAtIso,
                changes: applicationData.modification_changes || {},
              },
            ],
          };

          console.log('📝 Updating permit with modification values:', {
            water_source: permitUpdatePayload.water_source,
            purpose: permitUpdatePayload.purpose,
            water_allowance: permitUpdatePayload.water_allowance,
            expiry_date: permitUpdatePayload.expiry_date,
            resolvedDurationYears,
          });

          const { data: updatedPermit, error: updateError } = await supabase
            .from('permits')
            .update(permitUpdatePayload)
            .eq('id', modificationOriginalPermitId)
            .select()
            .maybeSingle() as { data: any; error: any };

          if (updateError) {
            console.error('❌ Error updating permit for modification:', updateError);
            throw new Error(
              updateError.code === 'PGRST116'
                ? 'Permission denied: unable to update the permit. Please contact support.'
                : `Failed to update permit: ${updateError.message}`
            );
          }
          if (!updatedPermit) {
            console.error('❌ Permit update returned no data — the row may not exist or RLS policy blocked the update. Permit ID:', modificationOriginalPermitId);
            throw new Error('Unable to update the permit. The original permit may not exist or you lack permission. Please contact support.');
          }

          permitData = updatedPermit;
          console.log('✅ Permit modified successfully:', permitData.permit_number,
            '| Updated values applied from modification application');

          const permitNumForSync = currentPermit.permit_number || permitRef?.normalizedPermitNumber;
          if (permitNumForSync) {
            const syncResult = await syncRegistryViaApi(permitNumForSync, {
              status: 'active',
              water_source: (permitUpdatePayload.water_source as string) || undefined,
              authorized_activity: (permitUpdatePayload.purpose as string) || undefined,
              volume_or_area: permitUpdatePayload.water_allowance != null ? String(permitUpdatePayload.water_allowance) : undefined,
              issuance_date: newIssuedDate,
              expiration_date: newExpiryDate || undefined,
              location: registrySyncLocation,
              permit_holder: permitHolder,
              latitude: _registryLat,
              longitude: _registryLng,
              duration: `${resolvedDurationYearsGlobal} years`,
              contact: registrySyncContact,
              method_of_water_taking: applicationData.water_taking_method || undefined,
            });
            if (syncResult.synced) {
              console.log('✅ Forward-synced modification to permit_registry');
            } else if (syncResult.error) {
              console.warn('⚠️ Forward-sync to permit_registry failed (non-blocking):', syncResult.error);
            }
          }

        } else {
          const registryPermitNumber = permitRef?.normalizedPermitNumber
            || permitRef?.registrySnapshot?.permit_number
            || (parsedNotes?.originalPermitNumber as string | undefined)
            || null;

          if (!registryPermitNumber) {
            throw new Error('Cannot process modification: no permit number found for registry-only permit.');
          }

          console.log('📝 Registry-only modification for permit:', registryPermitNumber);

          const registrySyncResult = await syncRegistryViaApi(registryPermitNumber, {
            status: 'active',
            water_source: applicationData.water_source || undefined,
            authorized_activity: applicationData.water_purpose || undefined,
            volume_or_area: resolvedVolumeM3 > 0 ? String(resolvedVolumeM3) : (applicationData.estimated_usage_volume ? String(applicationData.estimated_usage_volume) : undefined),
            issuance_date: newIssuedDate,
            expiration_date: newExpiryDate || undefined,
            location: registrySyncLocation,
            permit_holder: permitHolder,
            latitude: _registryLat,
            longitude: _registryLng,
            duration: `${resolvedDurationYearsGlobal} years`,
            contact: registrySyncContact,
            method_of_water_taking: applicationData.water_taking_method || undefined,
          });

          if (registrySyncResult.synced) {
            console.log('✅ Updated permit_registry row for', registryPermitNumber);
          } else {
            console.warn('⚠️ permit_registry update returned no match (non-blocking):', registrySyncResult.error || 'no matching row');
          }

          const permitInsertPayload = {
            application_id: applicationId,
            permit_number: registryPermitNumber,
            status: 'active',
            water_source: applicationData.water_source || 'other',
            purpose: applicationData.water_purpose || 'other',
            water_allowance: resolvedVolumeM3 > 0 ? resolvedVolumeM3 : (applicationData.estimated_usage_volume || 0),
            allowance_unit: resolvedAllowanceUnit || 'm³/year',
            issuing_authority: 'Rwanda Water Resources Board',
            issued_date: newIssuedDate,
            expiry_date: newExpiryDate || computeExpiryDateOnly(resolvedDurationYearsGlobal),
            is_modification: true,
            conditions: {
              conditions: [
                'Comply with all environmental regulations',
                'Submit quarterly usage reports',
                'Allow inspections as required',
                ...(applicationData.approval_conditions ? [applicationData.approval_conditions] : []),
              ],
              location: {
                province: applicationData.province,
                district: applicationData.district,
                sector: applicationData.sector,
                cell: applicationData.cell,
                village: applicationData.village,
                coordinates: applicationData.coordinates,
                description: applicationData.location_description,
              },
              project: {
                title: applicationData.project_title,
                description: applicationData.project_description,
                value: applicationData.project_value,
              },
              modification_history: [
                {
                  modification_application_id: applicationId,
                  modified_at: acceptedAtIso,
                  changes: applicationData.modification_changes || {},
                  promoted_from: 'permit_registry',
                },
              ],
            },
          };

          const { data: newPermit, error: permitError } = await supabase
            .from('permits')
            .insert(permitInsertPayload as any)
            .select()
            .single() as { data: any; error: any };

          if (permitError) {
            console.error('❌ Error creating permit from registry-only modification:', permitError);
            throw new Error(`Failed to create permit for registry modification: ${permitError.message}`);
          }

          permitData = newPermit;
          console.log('✅ Registry-only permit promoted to permits table:', permitData.permit_number,
            '| Linked to application:', applicationId);
        }

      } else if (isRenewalApplication && renewedFromPermitId) {
        console.log('🔄 Processing RENEWAL - updating existing permit:', renewedFromPermitId);
        console.log('📊 Using assessor-approved duration for renewal:', resolvedDurationYearsGlobal, 'years');
        
        const newIssuedDate = issuanceBaseDateOnly;
        const newExpiryDate = computeExpiryDateOnly(resolvedDurationYearsGlobal);
        
        const { data: updatedPermit, error: updateError } = await supabase
          .from('permits')
          .update({
            status: 'active',
            issued_date: newIssuedDate,
            expiry_date: newExpiryDate,
            is_renewal: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', renewedFromPermitId)
          .select()
          .maybeSingle() as { data: any; error: any };

        if (updateError) {
          console.error('❌ Error updating permit for renewal:', updateError);
          throw new Error(`Failed to renew permit: ${updateError.message}`);
        }
        if (!updatedPermit) {
          console.error('❌ Renewal permit update returned no data — the row may not exist or RLS policy blocked the update. Permit ID:', renewedFromPermitId);
          throw new Error('Unable to renew the permit. The original permit may not exist or you lack permission. Please contact support.');
        }
        
        permitData = updatedPermit;
        console.log('✅ Permit renewed successfully:', permitData.permit_number,
          '| New issued date:', newIssuedDate,
          '| New expiry date:', newExpiryDate);

        // Forward-sync renewal to permit_registry (non-blocking)
        if (permitData?.permit_number) {
          syncRegistryViaApi(permitData.permit_number, {
            status: 'active',
            issuance_date: newIssuedDate,
            expiration_date: newExpiryDate || undefined,
            permit_holder: permitHolder,
            location: registrySyncLocation,
            latitude: _registryLat,
            longitude: _registryLng,
            duration: `${resolvedDurationYearsGlobal} years`,
            contact: registrySyncContact,
            water_source: applicationData.water_source || undefined,
            authorized_activity: applicationData.water_purpose || undefined,
            volume_or_area: resolvedVolumeM3 > 0 ? String(resolvedVolumeM3) : undefined,
            method_of_water_taking: applicationData.water_taking_method || undefined,
          }).catch(err => console.warn('⚠️ registry-sync (renewal) failed:', err));
        }

      } else if (
        isTransferApplication &&
        transferOriginalPermitId &&
        !transferOriginalPermitId.startsWith('manual-')
      ) {
        // Real (digital) permit: reassign ownership to transferee.
        // Issuance date locks to applications.approved_at (the day the
        // Director General signed), matching the rule in
        // `lib/permit/resolve-issue-date.ts` and `/api/transfers/issue`.
        // Expiry is intentionally preserved by the API — see route comment.
        console.log('🔁 Processing TRANSFER - reassigning original permit ownership:', transferOriginalPermitId);

        const transferIssuedDate = issuanceBaseDateOnly;

        const issueResp = await fetch('/api/transfers/issue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicationId,
            oldPermitId: transferOriginalPermitId,
            issuedDate: transferIssuedDate,
          }),
        });
        const issueJson = await issueResp.json().catch(() => null);
        if (!issueResp.ok || !issueJson?.success || !issueJson?.permit) {
          throw new Error(issueJson?.message || issueResp.statusText || 'Failed to reassign transfer permit');
        }

        permitData = issueJson.permit;
        transferOwnershipReassigned = true;
        console.log('✅ Transfer permit ownership reassigned successfully:', permitData.permit_number,
          '| New issued date:', transferIssuedDate);

        // Forward-sync digital transfer to permit_registry (non-blocking).
        // Pass `issuance_date` so the registry shows the same locked date as
        // `permits.issued_date` — without it, the registry would silently
        // keep the previous owner's issuance date.
        if (permitData?.permit_number) {
          syncRegistryViaApi(permitData.permit_number, {
            status: 'active',
            permit_holder: permitHolder,
            location: registrySyncLocation,
            latitude: _registryLat,
            longitude: _registryLng,
            water_source: applicationData.water_source || undefined,
            authorized_activity: applicationData.water_purpose || undefined,
            volume_or_area: resolvedVolumeM3 > 0 ? String(resolvedVolumeM3) : undefined,
            issuance_date: transferIssuedDate,
            duration: `${resolvedDurationYearsGlobal} years`,
            contact: registrySyncContact,
            method_of_water_taking: applicationData.water_taking_method || undefined,
          }).catch(err => console.warn('⚠️ registry-sync (digital transfer) failed:', err));
        }

      } else if (isTransferApplication && (parsedNotes?.originalPermitId as string | undefined)?.startsWith('manual-')) {
        // Manual (legacy) permit transfer: the original permit has no DB row.
        // Insert a new permit row preserving the original permit number so no new
        // RWB number is issued. The DB trigger generate_permit_number() only fires
        // when permit_number IS NULL — passing it explicitly skips auto-generation.
        const originalPermitNumber = ((parsedNotes?.originalPermitNumber as string | undefined) || '').trim() || null;
        console.log('🔁 Processing MANUAL TRANSFER — preserving original permit number:', originalPermitNumber);

        const newIssuedDate = issuanceBaseDateOnly;
        const newExpiryDate = computeExpiryDateOnly(resolvedDurationYearsGlobal);

        const { data: newPermit, error: permitError } = await supabase
          .from('permits')
          .insert({
            application_id: applicationId,
            status: 'active',
            water_source: applicationData.water_source,
            purpose: applicationData.water_purpose,
            water_allowance: resolvedVolumeM3,
            allowance_unit: resolvedAllowanceUnit || 'm³',
            issuing_authority: 'Rwanda Water Resources Board',
            issued_date: newIssuedDate,
            expiry_date: newExpiryDate,
            is_transfer: true,
            transfer_reason: `Transferred via application ${(applicationData as any).application_number || applicationId}`,
            ...(originalPermitNumber ? { permit_number: originalPermitNumber } : {}),
            conditions: {
              conditions: [
                'Comply with all environmental regulations',
                'Submit quarterly usage reports',
                'Allow inspections as required',
                ...(applicationData.approval_conditions ? [applicationData.approval_conditions] : []),
              ],
              location: {
                province: applicationData.province,
                district: applicationData.district,
                sector: applicationData.sector,
                cell: applicationData.cell,
                village: applicationData.village,
                coordinates: applicationData.coordinates,
                description: applicationData.location_description,
              },
              project: {
                title: applicationData.project_title,
                description: applicationData.project_description,
                value: applicationData.project_value,
              },
            },
          } as any)
          .select()
          .single() as { data: any; error: any };

        if (permitError) {
          console.error('❌ Error creating manual transfer permit:', permitError);
          throw permitError;
        }
        permitData = newPermit;
        transferOwnershipReassigned = true;
        console.log('✅ Manual transfer permit created:', permitData.permit_number);

        // Forward-sync manual transfer to permit_registry (non-blocking)
        if (permitData?.permit_number) {
          syncRegistryViaApi(permitData.permit_number, {
            status: 'active',
            permit_holder: permitHolder,
            location: registrySyncLocation,
            latitude: _registryLat,
            longitude: _registryLng,
            water_source: applicationData.water_source || undefined,
            authorized_activity: applicationData.water_purpose || undefined,
            volume_or_area: resolvedVolumeM3 > 0 ? String(resolvedVolumeM3) : undefined,
            issuance_date: newIssuedDate,
            expiration_date: newExpiryDate || undefined,
            duration: `${resolvedDurationYearsGlobal} years`,
            contact: registrySyncContact,
            method_of_water_taking: applicationData.water_taking_method || undefined,
          }).catch(err => console.warn('⚠️ registry-sync (manual transfer) failed:', err));
        }

      } else {
        console.log('📝 Creating NEW permit in database...');
        console.log('📊 Using assessor-approved terms — duration:', resolvedDurationYearsGlobal, 'years, volume:', resolvedVolumeM3, 'm³');

        // Validate bulk applications have at least one network before issuing
        if (applicationData.is_bulk) {
          const adjNetworks = parsedNotes?._assessorAdjustments?.bulkNetworks;
          const networkCount = Array.isArray(adjNetworks)
            ? adjNetworks.length
            : Array.isArray(applicationData.bulk_networks)
              ? applicationData.bulk_networks.length
              : 0;
          if (networkCount === 0) {
            throw new Error('Cannot issue a bulk permit with no distribution networks. Please ensure network rows are saved before accepting terms.');
          }
        }

        const newIssuedDate = issuanceBaseDateOnly;
        const newExpiryDate = computeExpiryDateOnly(resolvedDurationYearsGlobal);

        const permitData_insert = {
          application_id: applicationId,
          status: 'active',
          water_source: applicationData.water_source,
          purpose: applicationData.water_purpose,
          water_allowance: resolvedVolumeM3,
          allowance_unit: resolvedAllowanceUnit || 'm³',
          issuing_authority: 'Rwanda Water Resources Board',
          issued_date: newIssuedDate,
          expiry_date: newExpiryDate,
          conditions: { 
            conditions: [
              'Comply with all environmental regulations', 
              'Submit quarterly usage reports', 
              'Allow inspections as required',
              ...(applicationData.approval_conditions ? [applicationData.approval_conditions] : [])
            ],
            location: {
              province: applicationData.province,
              district: applicationData.district,
              sector: applicationData.sector,
              cell: applicationData.cell,
              village: applicationData.village,
              coordinates: applicationData.coordinates,
              description: applicationData.location_description
            },
            project: {
              title: applicationData.project_title,
              description: applicationData.project_description,
              value: applicationData.project_value
            }
          }
        };

        console.log('📍 Permit data includes coordinates:', !!applicationData.coordinates);
        if (applicationData.coordinates) {
          console.log('🗺️ Coordinate type:', applicationData.coordinates.type);
        }

        const { data: newPermit, error: permitError } = await supabase
          .from('permits')
          .insert(permitData_insert as any)
          .select()
          .single() as { data: any; error: any };

        if (permitError) {
          console.error('❌ Error creating permit:', permitError);
          throw permitError;
        }
        
        permitData = newPermit;
        console.log('✅ Permit created successfully:', permitData.permit_number);

        // Bulk water supply: create child permit records for each network
        if (applicationData.is_bulk && permitData?.id && permitData?.permit_number) {
          const adjNetworks = parsedNotes?._assessorAdjustments?.bulkNetworks;
          const rawNetworks: any[] = Array.isArray(adjNetworks)
            ? adjNetworks
            : Array.isArray(applicationData.bulk_networks)
              ? applicationData.bulk_networks
              : [];

          if (rawNetworks.length > 0) {
            console.log(`🔗 Creating ${rawNetworks.length} child permits for bulk application`);
            const createdChildIds: string[] = [];
            let childCreationFailed = false;

            for (let i = 0; i < rawNetworks.length; i++) {
              const network = rawNetworks[i];
              const childPermitNumber = buildChildPermitNumber(permitData.permit_number, i + 1);
              const { data: childPermit, error: childError } = await supabase
                .from('permits')
                .insert({
                  application_id: applicationId,
                  parent_permit_id: permitData.id,
                  network_sequence_index: i + 1,
                  permit_number: childPermitNumber,
                  status: 'active',
                  water_source: applicationData.water_source,
                  purpose: applicationData.water_purpose,
                  water_allowance: network.capacity_m3_day ?? null,
                  allowance_unit: 'm³/day',
                  issuing_authority: 'Rwanda Water Resources Board',
                  issued_date: newIssuedDate,
                  expiry_date: newExpiryDate,
                  conditions: {
                    network_name: network.network_name,
                    sector: network.sector,
                    cell: network.cell,
                    village: network.village,
                    coordinates: network.coordinates,
                    abstraction_method: network.abstraction_method,
                  },
                } as any)
                .select('id, permit_number')
                .single() as { data: any; error: any };

              if (childError) {
                console.error(`❌ Failed to create child permit ${childPermitNumber}:`, childError);
                childCreationFailed = true;
                break;
              }
              createdChildIds.push(childPermit.id);
              console.log(`✅ Child permit created: ${childPermit?.permit_number}`);
              // Sync child to registry (non-blocking) — points to parent for PDF
              syncRegistryViaApi(childPermitNumber, {
                status: 'active',
                permit_holder: permitHolder,
                location: network.sector
                  ? [network.village, network.cell, network.sector].filter(Boolean).join(', ')
                  : registrySyncLocation,
                water_source: applicationData.water_source || undefined,
                authorized_activity: applicationData.water_purpose || undefined,
                volume_or_area: network.capacity_m3_day ? String(network.capacity_m3_day) : undefined,
                issuance_date: newIssuedDate,
                expiration_date: newExpiryDate || undefined,
                duration: `${resolvedDurationYearsGlobal} years`,
                contact: registrySyncContact,
                method_of_water_taking: network.abstraction_method || applicationData.water_taking_method || undefined,
              }).catch(err => console.warn(`⚠️ registry-sync (child ${childPermitNumber}) failed:`, err));
            }

            // Rollback parent + created children if any child insert failed
            if (childCreationFailed) {
              const idsToDelete = [permitData.id, ...createdChildIds].filter(Boolean);
              await supabase.from('permits').delete().in('id', idsToDelete).then(
                () => console.log(`🧹 Rolled back ${idsToDelete.length} permit(s) after child creation failure`),
                (err: unknown) => console.error('❌ Rollback failed:', err),
              );
              throw new Error('Failed to create all child permits. The permit was rolled back — please try again.');
            }
          }
        }
      }

      if (permitData?.id && permitData?.permit_number) {
        const permitDurationYears = computeDurationFromPermitDates(permitData.issued_date, permitData.expiry_date);
        setIssuedPermit({
          permitId: permitData.id,
          permitNumber: permitData.permit_number,
          durationYears: permitDurationYears ?? resolvedDurationYearsGlobal,
          isModification: isModificationApplication,
        });
      }

      // Keep the original (underlying) application aligned with approved
      // modification values after permit issuance succeeds.
      if (isModificationApplication) {
        try {
          console.log('🔄 Syncing approved modification values to underlying application...');
          const propagateResp = await fetch('/api/modifications/propagate-approved-values', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modificationApplicationId: applicationId,
            }),
          });
          const propagateJson = await propagateResp.json().catch(() => null);
          if (!propagateResp.ok || !propagateJson?.success) {
            console.warn(
              '⚠️ Underlying-application sync failed (non-blocking):',
              propagateJson?.message || propagateResp.statusText
            );
          } else if (propagateJson?.skipped) {
            console.log('ℹ️ Underlying-application sync skipped:', propagateJson?.reason || 'No linked base application');
          } else {
            console.log('✅ Underlying application updated with approved modification values');
          }
        } catch (syncErr) {
          console.warn('⚠️ Underlying-application sync crashed (non-blocking):', syncErr);
        }
      }

      console.log('📋 Updating application status to approved...');
      const { error: updateError } = await (supabase as any)
        .from('applications')
        .update({
          status: 'approved',
          terms_status: 'accepted',
          terms_accepted_at: acceptedAtIso,
          updated_at: acceptedAtIso,
        })
        .eq('id', applicationId);

      if (updateError) {
        console.warn('⚠️ Warning: Failed to update application status:', updateError);
      } else {
        console.log('✅ Application status updated successfully');
      }

      if (
        isTransferApplication &&
        transferOriginalPermitId &&
        !transferOriginalPermitId.startsWith('manual-') &&
        !transferOwnershipReassigned
      ) {
        try {
          console.log('🧾 Revoking original permit after transfer issuance...');
          const resp = await fetch('/api/transfers/revoke-old-permit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              applicationId,
              oldPermitId: transferOriginalPermitId,
            }),
          });
          const json = await resp.json().catch(() => null);
          if (!resp.ok || !json?.success) {
            console.warn('⚠️ Failed to revoke original permit (non-blocking):', json?.message || resp.statusText);
          } else {
            console.log('✅ Original permit revoked');
          }
        } catch (e) {
          console.warn('⚠️ Revoke original permit crashed (non-blocking):', e);
        }
      }

      console.log("✅ Terms accepted successfully! Your permit has been generated...");
      console.log('📋 Permit issuance completed. PDFs can be downloaded from the completion screen.');
      
      setShowFeedback(true);
    } catch (error) {
      console.error('❌ Error accepting terms:', error);
      
      let errorMessage = "❌ Failed to accept terms. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes('expired')) {
          errorMessage = "❌ This application has expired (6 months since submission) and can no longer proceed.";
        } else
        if (error.message.includes('Authentication')) {
          errorMessage = "❌ Please log in again and try accepting the terms.";
        } else if (error.message.includes('not found')) {
          errorMessage = "❌ Application not found. Please refresh the page.";
        } else if (error.message.includes('permission')) {
          errorMessage = "❌ Permission denied. Please contact support.";
        }
      }
      
      console.log(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectTerms = async () => {
    setIsProcessing(true);
    try {
      const authResponse = await supabase.auth.getUser();
      const currentUser = (authResponse.data as any)?.user as { id?: string } | undefined;
      if (!currentUser?.id) {
        throw new Error('Authentication required to reject terms.');
      }

      const { data: applicationData, error: appError } = await supabase
        .from('applications')
        .select('application_type, internal_notes')
        .eq('id', applicationId)
        .single() as { data: any; error: any };
      if (appError || !applicationData) {
        throw appError || new Error('Application not found');
      }

      let transferNotes: Record<string, any> | null = null;
      try {
        transferNotes = applicationData.internal_notes ? JSON.parse(applicationData.internal_notes) : null;
      } catch {
        transferNotes = null;
      }
      const isTransferByType = applicationData.application_type === 'transfer';
      const isTransferByNotes = transferNotes?.isTransfer === true;
      if (isTransferByType || isTransferByNotes) {
        const approval = transferNotes?.transferApproval;
        const transfereeAllowed =
          approval?.transfereeApproved === true &&
          typeof approval?.transfereeUserId === 'string' &&
          approval.transfereeUserId === currentUser.id;
        if (!transfereeAllowed) {
          throw new Error('Only the approved transferee can reject transfer terms.');
        }
      }

      const { error: updateError } = await (supabase as any)
        .from('applications')
        .update({
          terms_status: 'rejected',
          status: 'rejected',
          rejection_reason: 'Applicant declined the Terms and Conditions.',
          rejected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      console.log("Terms rejected. Application moved to rejected status.");
      navigateBack();
    } catch (error) {
      console.error('Error rejecting terms:', error);
      console.log("❌ Failed to reject terms. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmitFeedback = async () => {
    const trimmedFeedback = feedback.trim();
    if (isSubmittingFeedback || !trimmedFeedback) return;

    setIsSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      const response = await fetch("/api/feedback/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          applicationId,
          feedbackText: trimmedFeedback,
          rating: rating > 0 ? rating : undefined,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || "Failed to submit feedback. Please try again.");
      }

      setFeedbackSubmitted(true);
    } catch (error) {
      console.error("❌ Error submitting feedback:", error);
      setFeedbackError(error instanceof Error ? error.message : "Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const defaultTab = visibleLanguageGroups.length > 0 ? visibleLanguageGroups[0].key : "en";

  const renderTermsSections = (sections: typeof visibleLanguageGroups[number]["sections"]) => (
    <div className="space-y-6 py-4">
      {sections.map((section, idx) => (
        <div key={`${section.title}-${idx}`}>
          {(() => {
            const { partHeading, articleHeading } = parseSectionHeading(section.title);
            const previousPartHeading =
              idx > 0 ? parseSectionHeading(sections[idx - 1].title).partHeading : null;
            const showPartHeading = Boolean(partHeading && partHeading !== previousPartHeading);

            if (!partHeading) {
              return <h4 className="mb-3 text-base font-semibold text-foreground">{section.title}</h4>;
            }

            return (
              <div className="mb-3 space-y-1.5">
                {showPartHeading && (
                  <h4 className="text-base font-semibold text-foreground">{partHeading}</h4>
                )}
                <h5 className="text-base font-semibold text-foreground">{articleHeading}</h5>
              </div>
            );
          })()}
          <div className="space-y-2.5">
            {section.paragraphs.map((p, pIdx) => (
              <p key={pIdx} className="text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </div>
          {idx < sections.length - 1 && <Separator className="mt-6" />}
        </div>
      ))}
    </div>
  );

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <div className="flex min-h-[calc(100vh-4rem)] flex-col">
          {/* Header */}
          <div className="border-b bg-background px-4 py-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {!showFeedback && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={navigateBack}
                      className="h-9 w-9 shrink-0"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <div>
                    <h1 className="text-lg font-semibold text-foreground sm:text-xl">
                      {tx("Terms & Conditions")}
                    </h1>
                    {applicationNumber && (
                      <p className="text-sm text-muted-foreground">
                        {projectTitle ? `${projectTitle} — ` : ""}#{applicationNumber}
                      </p>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                  <CheckCircle className="mr-1.5 h-3 w-3" />
                  {tx("Approved")}
                </Badge>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
              {!showFeedback ? (
                <div className="space-y-6">
                  {/* Approval banner */}
                  <Card className="border-green-200 bg-green-50/50">
                    <CardContent className="flex items-start gap-3 p-4">
                      <FileCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-green-800">
                          {tx("Your water permit application has been approved!")}
                        </p>
                        <p className="mt-1 text-sm text-green-700/80">
                          {tx("Please review and accept the terms and conditions below to receive your digital water permit.")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Contract terms */}
                  <Card>
                    <CardContent className="p-0">
                      <div className="flex items-center gap-2 border-b px-5 py-4">
                        <Shield className="h-5 w-5 text-primary" />
                        <h2 className="text-base font-semibold text-foreground">
                          {resolvedTerms?.heading ?? tx("Terms and Conditions for Water Permit")}
                        </h2>
                      </div>

                      <div className="px-5 pb-5">
                        {isLoadingTerms ? (
                          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">{tx("Loading contract terms...")}</span>
                          </div>
                        ) : termsLoadError ? (
                          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                              <div>
                                <p className="text-sm font-medium text-amber-800">{tx("Could not load terms")}</p>
                                <p className="mt-1 text-sm text-amber-700">{termsLoadError}</p>
                              </div>
                            </div>
                          </div>
                        ) : resolvedTerms ? (
                          <>
                            {visibleLanguageGroups.length > 1 ? (
                              <Tabs defaultValue={defaultTab} className="mt-4">
                                <TabsList>
                                  {visibleLanguageGroups.map((group) => (
                                    <TabsTrigger key={group.key} value={group.key}>
                                      {group.label}
                                    </TabsTrigger>
                                  ))}
                                </TabsList>
                                {visibleLanguageGroups.map((group) => (
                                  <TabsContent key={group.key} value={group.key}>
                                    <ScrollArea className="h-[50vh]">
                                      {renderTermsSections(group.sections)}
                                    </ScrollArea>
                                  </TabsContent>
                                ))}
                              </Tabs>
                            ) : visibleLanguageGroups.length === 1 ? (
                              <ScrollArea className="mt-4 h-[50vh]">
                                {renderTermsSections(visibleLanguageGroups[0].sections)}
                              </ScrollArea>
                            ) : null}

                            {resolvedTerms.importantNotice && (
                              <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                  <div>
                                    <p className="text-sm font-medium text-amber-800">
                                      {resolvedTerms.importantNotice.title}
                                    </p>
                                    <p className="mt-1 text-sm text-amber-700">
                                      {resolvedTerms.importantNotice.body}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                              <div>
                                <p className="text-sm font-medium text-amber-800">{tx("Terms not available")}</p>
                                <p className="mt-1 text-sm text-amber-700">
                                  {tx("We don't have contract terms configured for this application type yet.")}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Single acceptance checkbox */}
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="accept-terms"
                          checked={acceptedTerms}
                          onCheckedChange={(checked) => setAcceptedTerms(checked as boolean)}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor="accept-terms"
                          className="text-sm font-medium leading-snug cursor-pointer select-none"
                        >
                          {tx("I have read, understood, and accept the terms and conditions above, and I agree to comply with all stated requirements")}
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : feedbackSubmitted ? (
                /* Completion screen after feedback */
                <div className="space-y-6">
                  <Card className="border-green-200 bg-green-50/50">
                    <CardContent className="flex items-start gap-3 p-5">
                      <CheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
                      <div>
                        <p className="text-base font-semibold text-green-800">
                          {tx("Thank you! Your permit has been issued.")}
                        </p>
                        {issuedPermit?.permitNumber && (
                          <p className="mt-1 text-sm text-green-700/80">
                            {tx("Permit Number:")} <span className="font-medium">{issuedPermit.permitNumber}</span>
                          </p>
                        )}
                        <p className="mt-2 text-sm text-green-700/80">
                          {tx("Your feedback has been recorded. You can now view your permit or return to the dashboard.")}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                    {issuedPermit?.permitNumber && (
                      <Link href={`/permit/view/${encodeURIComponent(issuedPermit.permitNumber)}`}>
                        <Button className="w-full sm:w-auto bg-green-600 hover:bg-green-700">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          {tx("View Permit")}
                        </Button>
                      </Link>
                    )}
                    <Link href="/dashboard">
                      <Button variant="outline" className="w-full sm:w-auto">
                        <Home className="mr-2 h-4 w-4" />
                        {tx("Back to Dashboard")}
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                /* Feedback step */
                <div className="space-y-6">
                  <Card className="border-green-200 bg-green-50/50">
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-green-800">
                        {tx("Permit issued successfully")}{issuedPermit?.permitNumber ? ` (${issuedPermit.permitNumber})` : ""}.
                      </p>
                      <p className="mt-1 text-sm text-green-700/80">
                        {tx("Your permit has been issued. Please share your feedback to continue.")}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="space-y-5 p-5">
                      <h3 className="text-base font-semibold text-foreground">
                        {tx("How was your experience using the water permit system?")}
                      </h3>

                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            onClick={() => setRating(s)}
                            aria-label={`Rate ${s} stars`}
                            disabled={isSubmittingFeedback}
                            className="rounded-md p-1 transition-colors hover:bg-muted"
                          >
                            <Star
                              className={`h-6 w-6 ${
                                rating >= s ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/30"
                              }`}
                            />
                          </button>
                        ))}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {rating === 0 ? tx("Select a rating") : `${rating}/5`}
                        </span>
                      </div>

                      <Textarea
                        placeholder={tx("Share any feedback to help us improve...")}
                        rows={4}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        disabled={isSubmittingFeedback}
                      />

                      {feedbackError && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                          {feedbackError}
                        </div>
                      )}

                      <div className="flex justify-end gap-3">
                        <Button
                          onClick={handleSubmitFeedback}
                          disabled={isSubmittingFeedback || !feedback.trim()}
                        >
                          {isSubmittingFeedback ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {tx("Submitting...")}
                            </>
                          ) : (
                            tx("Submit Feedback")
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {/* Sticky footer */}
          {!showFeedback && (
            <div className="sticky bottom-0 border-t bg-background px-4 py-4 sm:px-6 lg:px-8">
              <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={handleRejectTerms}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <AlertTriangle className="mr-2 h-4 w-4" />
                  )}
                  {tx("Reject Terms")}
                </Button>

                <Button
                  onClick={handleAcceptTerms}
                  disabled={!acceptedTerms || isProcessing}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isProcessing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  {tx("Accept Terms & Issue Permit")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
