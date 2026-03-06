"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  CheckCircle, 
  AlertTriangle, 
  FileCheck, 
  Shield, 
  Loader2,
  Star
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { syncPermitToRegistry } from "@/lib/permit/permit-registry-sync";
import { getApplicationExpiration } from "@/lib/application-expiration";
import { selectPermitVariant, type PermitVariant } from "@/lib/permit-variant";
import { contractTermsByVariant, splitContractSectionsByLanguage } from "@/lib/contract-terms";
import { buildContractPlaceholderContext, fillContractText } from "@/lib/contract-placeholders";

interface TermsConditionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  applicationId: string;
  applicationNumber: string;
  projectTitle: string;
  onTermsAccepted: () => void;
}

export function TermsConditionsModal({
  isOpen,
  onClose,
  applicationId,
  applicationNumber,
  projectTitle,
  onTermsAccepted
}: TermsConditionsModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasReadTerms, setHasReadTerms] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [termsVariant, setTermsVariant] = useState<PermitVariant | null>(null);
  const [isLoadingTerms, setIsLoadingTerms] = useState(false);
  const [termsLoadError, setTermsLoadError] = useState<string | null>(null);
  const [termsApplication, setTermsApplication] = useState<any | null>(null);
  const [issuedPermit, setIssuedPermit] = useState<{
    permitId: string;
    permitNumber: string;
    durationYears: number;
    isModification: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Reset local UI state when modal opens (and when switching applications).
    setIsProcessing(false);
    setHasReadTerms(false);
    setAcceptedTerms(false);
    setShowFeedback(false);
    setRating(0);
    setFeedback("");
    setIsSubmittingFeedback(false);
    setFeedbackError(null);
    setIssuedPermit(null);
  }, [isOpen, applicationId]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    async function loadVariant() {
      setIsLoadingTerms(true);
      setTermsLoadError(null);
      try {
        const { data, error } = await supabase
          .from("applications")
          .select(
            `
            id,
            province,
            district,
            sector,
            cell,
            village,
            coordinates,
            internal_notes,
            water_source,
            water_body_name,
            max_daily_volume_m3,
            max_yearly_volume_m3,
            estimated_usage_volume,
            usage_unit,
            proposed_duration_years,
            concession_area,
            intended_activities,
            applicant:users!applicant_id(account_type, first_name, last_name, company_name, id_number)
          `
          )
          .eq("id", applicationId)
          .single();

        if (error) throw error;
        if (!data) throw new Error("Application not found");

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

    loadVariant();
    return () => {
      cancelled = true;
    };
  }, [isOpen, applicationId]);

  const resolvedTerms = useMemo(() => {
    if (!termsVariant) return null;
    return contractTermsByVariant[termsVariant] ?? null;
  }, [termsVariant]);

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
        label: "English Version",
        sections: englishSections.filter((section) => !isSignatureSection(section.title)),
      },
      {
        key: "rw",
        label: "Kinyarwanda Version",
        sections: kinyarwandaSections.filter((section) => !isSignatureSection(section.title)),
      },
    ].filter((group) => group.sections.length > 0);
  }, [resolvedTerms]);

  const placeholderCtx = useMemo(() => {
    if (!termsApplication) return null;
    try {
      return buildContractPlaceholderContext(termsApplication, applicationNumber);
    } catch {
      return null;
    }
  }, [termsApplication, applicationNumber]);

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
      const acceptedDateOnly = acceptedAtIso.split('T')[0];
      const computeExpiryDateOnly = (durationYears: number) => {
        const expiry = new Date(acceptedAt);
        expiry.setFullYear(expiry.getFullYear() + durationYears);
        return expiry.toISOString().split('T')[0];
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
      console.log('✅ Application data loaded:', applicationData.application_number);

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
      // (Permit issuance happens in THIS handler, so there should not be a permit yet.)
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

        // Best-effort: mark the application as expired in DB.
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

      // Parse internal_notes once for reuse
      let parsedNotes: Record<string, any> | null = null;
      try {
        parsedNotes = applicationData.internal_notes ? JSON.parse(applicationData.internal_notes) : null;
      } catch { parsedNotes = null; }

      // ── Resolve assessor-approved values (used for both new permits & modifications) ──
      const assessorAdjustments = parsedNotes?._assessorAdjustments;

      // Duration: assessor adjustment > proposed_duration_years > form permitLengthYears > default 5
      const resolvedDurationYearsGlobal: number = (() => {
        if (typeof assessorAdjustments?.permitLengthYears === 'number' &&
            Number.isFinite(assessorAdjustments.permitLengthYears) &&
            assessorAdjustments.permitLengthYears >= 1 &&
            assessorAdjustments.permitLengthYears <= 15) {
          return assessorAdjustments.permitLengthYears;
        }
        if (typeof applicationData.proposed_duration_years === 'number' &&
            Number.isFinite(applicationData.proposed_duration_years) &&
            applicationData.proposed_duration_years >= 1 &&
            applicationData.proposed_duration_years <= 15) {
          return applicationData.proposed_duration_years;
        }
        if (typeof parsedNotes?.permitLengthYears === 'number' &&
            Number.isFinite(parsedNotes.permitLengthYears) &&
            parsedNotes.permitLengthYears >= 1 &&
            parsedNotes.permitLengthYears <= 15) {
          return parsedNotes.permitLengthYears;
        }
        return 5;
      })();

      // Volume: assessor adjustment > max_yearly > estimated_usage > form value > 0
      const resolvedVolumeM3: number = (() => {
        if (typeof assessorAdjustments?.recommendedVolumeM3 === 'number' &&
            Number.isFinite(assessorAdjustments.recommendedVolumeM3) &&
            assessorAdjustments.recommendedVolumeM3 > 0) {
          return assessorAdjustments.recommendedVolumeM3;
        }
        if (typeof applicationData.max_yearly_volume_m3 === 'number' &&
            Number.isFinite(applicationData.max_yearly_volume_m3) &&
            applicationData.max_yearly_volume_m3 > 0) {
          return applicationData.max_yearly_volume_m3;
        }
        if (typeof applicationData.estimated_usage_volume === 'number' &&
            Number.isFinite(applicationData.estimated_usage_volume) &&
            applicationData.estimated_usage_volume > 0) {
          return applicationData.estimated_usage_volume;
        }
        const formVolume = parsedNotes?.waterAbstractionDetails?.[0]?.maxAverageYearly;
        if (typeof formVolume === 'number' && Number.isFinite(formVolume) && formVolume > 0) {
          return formVolume;
        }
        return 0;
      })();

      console.log('📊 Resolved assessor-approved terms:', {
        durationYears: resolvedDurationYearsGlobal,
        volumeM3: resolvedVolumeM3,
        source: assessorAdjustments ? 'assessor adjustments' : 'application data',
      });

      // Check if this is a renewal application
      const isRenewalApplication = applicationData.is_renewal === true || 
        (parsedNotes?.isRenewal === true);
      
      const renewedFromPermitId = applicationData.renewed_from_permit_id || parsedNotes?.originalPermitId || null;

      // Check if this is a transfer application
      const isTransferApplication =
        (applicationData as any).application_type === 'transfer' ||
        parsedNotes?.isTransfer === true;

      const transferOriginalPermitId =
        (parsedNotes?.transferApproval?.originalPermitId as string | undefined) ||
        (parsedNotes?.originalPermitId as string | undefined) ||
        null;

      // Check if this is a modification application
      const isModificationApplication = applicationData.is_modification === true ||
        (parsedNotes?.isModification === true);
      
      const modificationOriginalPermitId = parsedNotes?.originalPermitId || null;

      let permitData: any;

      if (isModificationApplication) {
        // MODIFICATION: Update existing permit with the newly approved values
        const permitRef = parsedNotes?.permitReference as { normalizedPermitNumber?: string; registrySnapshot?: { registry_id?: string; permit_number?: string } } | undefined;
        const isRegistryOnly = !modificationOriginalPermitId ||
          (typeof modificationOriginalPermitId === 'string' && modificationOriginalPermitId.startsWith('manual-'));

        console.log('🔧 Processing MODIFICATION —', isRegistryOnly ? 'registry-only permit' : 'linked permit', modificationOriginalPermitId);
        console.log('📊 Using assessor-approved terms — duration:', resolvedDurationYearsGlobal, 'years, volume:', resolvedVolumeM3, 'm³');

        // Use the already-resolved duration (from assessor adjustments)
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

        const newIssuedDate = acceptedDateOnly;
        const newExpiryDate = resolvedDurationYears
          ? computeExpiryDateOnly(resolvedDurationYears)
          : null;

        if (!isRegistryOnly) {
          // ── LINKED-PERMIT MODIFICATION (existing row in `permits` table) ──

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
          if (applicationData.usage_unit) {
            permitUpdatePayload.allowance_unit = applicationData.usage_unit;
          }
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

          // Forward-sync to permit_registry if a matching row exists
          const permitNumForSync = currentPermit.permit_number || permitRef?.normalizedPermitNumber;
          if (permitNumForSync) {
            const locationParts = [applicationData.province, applicationData.district, applicationData.sector, applicationData.cell, applicationData.village].filter(Boolean);
            const syncResult = await syncPermitToRegistry(supabase, permitNumForSync, {
              status: 'active',
              water_source: (permitUpdatePayload.water_source as string) || undefined,
              authorized_activity: (permitUpdatePayload.purpose as string) || undefined,
              volume_or_area: permitUpdatePayload.water_allowance != null ? String(permitUpdatePayload.water_allowance) : undefined,
              issuance_date: newIssuedDate,
              expiration_date: newExpiryDate || undefined,
              location: locationParts.length > 0 ? locationParts.join(', ') : undefined,
            });
            if (syncResult.synced) {
              console.log('✅ Forward-synced modification to permit_registry');
            } else if (syncResult.error) {
              console.warn('⚠️ Forward-sync to permit_registry failed (non-blocking):', syncResult.error);
            }
          }

        } else {
          // ── REGISTRY-ONLY MODIFICATION (permit exists only in permit_registry, not in permits) ──

          const registryPermitNumber = permitRef?.normalizedPermitNumber
            || permitRef?.registrySnapshot?.permit_number
            || (parsedNotes?.originalPermitNumber as string | undefined)
            || null;

          if (!registryPermitNumber) {
            throw new Error('Cannot process modification: no permit number found for registry-only permit.');
          }

          console.log('📝 Registry-only modification for permit:', registryPermitNumber);

          // 1. Update the permit_registry row with approved values
          const locationParts = [applicationData.province, applicationData.district, applicationData.sector, applicationData.cell, applicationData.village].filter(Boolean);
          const registrySyncResult = await syncPermitToRegistry(supabase, registryPermitNumber, {
            status: 'active',
            water_source: applicationData.water_source || undefined,
            authorized_activity: applicationData.water_purpose || undefined,
            volume_or_area: resolvedVolumeM3 > 0 ? String(resolvedVolumeM3) : (applicationData.estimated_usage_volume ? String(applicationData.estimated_usage_volume) : undefined),
            issuance_date: newIssuedDate,
            expiration_date: newExpiryDate || undefined,
            location: locationParts.length > 0 ? locationParts.join(', ') : undefined,
          });

          if (registrySyncResult.synced) {
            console.log('✅ Updated permit_registry row for', registryPermitNumber);
          } else {
            console.warn('⚠️ permit_registry update returned no match (non-blocking):', registrySyncResult.error || 'no matching row');
          }

          // 2. Create a new permits row to "promote" this registry permit into the system
          const permitInsertPayload = {
            application_id: applicationId,
            permit_number: registryPermitNumber,
            status: 'active',
            water_source: applicationData.water_source || 'other',
            purpose: applicationData.water_purpose || 'other',
            water_allowance: resolvedVolumeM3 > 0 ? resolvedVolumeM3 : (applicationData.estimated_usage_volume || 0),
            allowance_unit: applicationData.usage_unit || 'm³/year',
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
        // RENEWAL: Update existing permit dates instead of creating new permit
        console.log('🔄 Processing RENEWAL - updating existing permit:', renewedFromPermitId);
        console.log('📊 Using assessor-approved duration for renewal:', resolvedDurationYearsGlobal, 'years');
        
        const newIssuedDate = acceptedDateOnly;
        const newExpiryDate = computeExpiryDateOnly(resolvedDurationYearsGlobal);
        
        // Use maybeSingle() instead of single() to avoid PGRST116 when RLS blocks the row
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
      } else if (isTransferApplication && transferOriginalPermitId) {
        // TRANSFER: Create a new permit record for the transferee, linked to the original permit.
        console.log('🔁 Processing TRANSFER - creating new permit from original permit:', transferOriginalPermitId);
        console.log('📊 Using assessor-approved terms — duration:', resolvedDurationYearsGlobal, 'years, volume:', resolvedVolumeM3, 'm³');

        const newIssuedDate = acceptedDateOnly;
        const newExpiryDate = computeExpiryDateOnly(resolvedDurationYearsGlobal);

        const permitData_insert = {
          application_id: applicationId,
          status: 'active',
          water_source: applicationData.water_source,
          purpose: applicationData.water_purpose,
          water_allowance: resolvedVolumeM3,
          allowance_unit: applicationData.usage_unit || 'm³',
          issuing_authority: 'Rwanda Water Resources Board',
          issued_date: newIssuedDate,
          expiry_date: newExpiryDate,
          is_transfer: true,
          original_permit_id: transferOriginalPermitId,
          transfer_reason: (() => {
            const permitNo = parsedNotes?.originalPermitNumber ? String(parsedNotes.originalPermitNumber) : '';
            return permitNo ? `Transferred from ${permitNo}` : 'Permit transfer';
          })(),
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

        const { data: newPermit, error: permitError } = await supabase
          .from('permits')
          .insert(permitData_insert as any)
          .select()
          .single() as { data: any; error: any };

        if (permitError) {
          console.error('❌ Error creating transfer permit:', permitError);
          throw permitError;
        }

        permitData = newPermit;
        console.log('✅ Transfer permit created successfully:', permitData.permit_number);

      } else {
        // NEW PERMIT: Create permit in database with comprehensive data
        // Use assessor-approved terms (duration + volume) instead of hardcoded/raw values
        console.log('📝 Creating NEW permit in database...');
        console.log('📊 Using assessor-approved terms — duration:', resolvedDurationYearsGlobal, 'years, volume:', resolvedVolumeM3, 'm³');

        const newIssuedDate = acceptedDateOnly;
        const newExpiryDate = computeExpiryDateOnly(resolvedDurationYearsGlobal);

        const permitData_insert = {
          application_id: applicationId,
          status: 'active',
          water_source: applicationData.water_source,
          purpose: applicationData.water_purpose,
          water_allowance: resolvedVolumeM3,
          allowance_unit: applicationData.usage_unit || 'm³',
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
            // Include location and polygon data for permit enforcement
            location: {
              province: applicationData.province,
              district: applicationData.district,
              sector: applicationData.sector,
              cell: applicationData.cell,
              village: applicationData.village,
              coordinates: applicationData.coordinates,
              description: applicationData.location_description
            },
            // Include project details
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
      }

      // Store issued permit info for the completion screen.
      // (PDF generation is now optional/user-triggered to avoid blocking acceptance.)
      if (permitData?.id && permitData?.permit_number) {
        setIssuedPermit({
          permitId: permitData.id,
          permitNumber: permitData.permit_number,
          durationYears: resolvedDurationYearsGlobal,
          isModification: isModificationApplication,
        });
      }

      // Finalize the workflow: once terms are accepted and permit is created, mark application as approved
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
        // Continue anyway - permit was created successfully
      } else {
        console.log('✅ Application status updated successfully');
      }

      // If this was a transfer, revoke the original permit (server-side via service role).
      if (isTransferApplication && transferOriginalPermitId) {
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
      // Don't call onTermsAccepted() immediately - let user see feedback first
    } catch (error) {
      console.error('❌ Error accepting terms:', error);
      
      // Provide more specific error messages
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
      // Defense-in-depth: transfer terms can only be rejected by the approved transferee.
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

      // Update application with terms rejection — move to rejected status
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
      onClose();
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
      const authResponse = await supabase.auth.getUser();
      const user = (authResponse.data as any)?.user as { id?: string } | undefined;
      if (!user?.id) {
        throw new Error("Please sign in again to submit feedback.");
      }

      const payload: Record<string, unknown> = {
        application_id: applicationId,
        user_id: user.id,
        feedback_text: trimmedFeedback,
        feedback_type: "terms_acceptance",
      };
      if (rating > 0) {
        payload.rating = rating;
      }

      const { error } = await (supabase as any)
        .from("portal_feedback")
        .insert(payload);
      if (error) throw error;

      onTermsAccepted();
      onClose();
    } catch (error) {
      console.error("❌ Error submitting feedback:", error);
      setFeedbackError(error instanceof Error ? error.message : "Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        // Keep feedback step on screen until explicit feedback submission.
        if (showFeedback) return;
        onClose();
      }}
    >
      <DialogContent
        className="w-[98vw] max-w-[98vw] sm:max-w-[98vw] md:max-w-[96vw] lg:max-w-[94vw] xl:max-w-[90rem] h-[96vh] max-h-[96vh] p-0 overflow-hidden"
        showCloseButton={!showFeedback}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="px-5 pt-4">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-full">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-semibold text-green-800">
                    Application Approved!
                  </DialogTitle>
                  <DialogDescription className="text-base text-gray-600 mt-1">
                    Application #{applicationNumber} - {projectTitle}
                  </DialogDescription>
                </div>
              </div>

              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <FileCheck className="h-5 w-5" />
                    <span className="font-medium">Your water permit application has been approved!</span>
                  </div>
                  <p className="text-sm text-green-600 mt-2">
                    Please review and accept the terms and conditions below to receive your digital water permit.
                  </p>
                </CardContent>
              </Card>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
            {!showFeedback ? (
              <div className="space-y-6 pt-3">
                <div>
                  <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <Shield className="h-6 w-6 text-blue-600" />
                    {resolvedTerms?.heading ?? "Terms and Conditions for Water Permit"}
                  </h3>

                  <Card className="border-blue-200">
                    <CardContent className="max-h-[62vh] overflow-y-auto p-5 space-y-4">
                {isLoadingTerms ? (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-base">Loading contract terms…</span>
                  </div>
                ) : termsLoadError ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-base font-medium text-amber-800">Could not load terms</p>
                        <p className="text-base text-amber-700 mt-1">{termsLoadError}</p>
                      </div>
                    </div>
                  </div>
                ) : resolvedTerms ? (
                  <>
                    <div className="space-y-8 text-base">
                      {visibleLanguageGroups.map((group, groupIdx) => (
                        <div key={group.key} className="space-y-5">
                          {visibleLanguageGroups.length > 1 ? (
                            <div className="rounded-md bg-slate-50 px-4 py-3">
                              <h4 className="text-lg font-semibold text-slate-900">{group.label}</h4>
                            </div>
                          ) : null}

                          <div className="space-y-5">
                            {group.sections.map((section, idx) => (
                              <div key={`${group.key}-${section.title}-${idx}`}>
                                <h5 className="mb-3 text-lg font-semibold text-gray-900">{section.title}</h5>
                                <div className="space-y-3">
                                  {section.paragraphs.map((p, pIdx) => (
                                    <p key={pIdx} className="text-gray-700 leading-relaxed">
                                      {placeholderCtx ? fillContractText(p, placeholderCtx) : p}
                                    </p>
                                  ))}
                                </div>
                                {idx < group.sections.length - 1 ? <Separator className="mt-6" /> : null}
                              </div>
                            ))}
                          </div>

                          {groupIdx < visibleLanguageGroups.length - 1 ? <Separator className="mt-2" /> : null}
                        </div>
                      ))}
                    </div>

                    {resolvedTerms.importantNotice ? (
                      <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-base font-medium text-amber-800">
                              {resolvedTerms.importantNotice.title}
                            </p>
                            <p className="text-base text-amber-700 mt-1">{resolvedTerms.importantNotice.body}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-base font-medium text-amber-800">Terms not available</p>
                        <p className="text-base text-amber-700 mt-1">
                          We don&apos;t have contract terms configured for this application type yet.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="read-terms" 
                checked={hasReadTerms}
                onCheckedChange={(checked) => setHasReadTerms(checked as boolean)}
              />
              <label 
                htmlFor="read-terms" 
                className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I have read and understood the terms and conditions above
              </label>
            </div>
            
            <div className="flex items-center space-x-3">
              <Checkbox 
                id="accept-terms" 
                checked={acceptedTerms}
                onCheckedChange={(checked) => setAcceptedTerms(checked as boolean)}
                disabled={!hasReadTerms}
              />
              <label 
                htmlFor="accept-terms" 
                className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                I accept the terms and conditions and agree to comply with all requirements
              </label>
            </div>
          </div>
              </div>
            ) : (
              <div className="space-y-6 pt-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <p className="text-base font-medium text-green-800">
                    ✅ Permit issued successfully{issuedPermit?.permitNumber ? ` (${issuedPermit.permitNumber})` : ""}.
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Your permit has been issued. Please share your feedback to continue.
                  </p>
                </div>

                <h3 className="text-xl font-semibold">How was your experience using the water permit system?</h3>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setRating(s)}
                      aria-label={`Rate ${s} stars`}
                      disabled={isSubmittingFeedback}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          rating >= s ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  1 star = poor experience, 3 stars = average, 5 stars = excellent.
                </p>
                <textarea
                  className="w-full border rounded-md p-3"
                  rows={4}
                  placeholder="Share any feedback to help us improve..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  disabled={isSubmittingFeedback}
                />
                {feedbackError ? (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                    ❌ {feedbackError}
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleSubmitFeedback}
                    disabled={isSubmittingFeedback || !feedback.trim()}
                  >
                    {isSubmittingFeedback ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Feedback"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {!showFeedback && (
            <div className="border-t bg-background px-6 py-4">
              <DialogFooter className="gap-3">
                <Button
                  variant="outline"
                  onClick={handleRejectTerms}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-6 py-3"
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <AlertTriangle className="h-5 w-5" />
                  )}
                  Reject Terms
                </Button>

                <Button
                  onClick={handleAcceptTerms}
                  disabled={!acceptedTerms || isProcessing}
                  className="bg-green-600 hover:bg-green-700 flex items-center gap-2 px-6 py-3"
                >
                  {isProcessing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle className="h-5 w-5" />
                  )}
                  Accept Terms & Issue Permit
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 