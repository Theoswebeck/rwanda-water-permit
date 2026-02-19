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
import { uploadPermitPdf } from "@/lib/supabase-storage";
import { getApplicationExpiration } from "@/lib/application-expiration";
import { selectPermitVariant, type PermitVariant } from "@/lib/permit-variant";
import { contractTermsByVariant } from "@/lib/contract-terms";
import { buildContractPlaceholderContext, fillContractText } from "@/lib/contract-placeholders";
import { generateTermsConditionsPdfBlob } from "@/lib/pdf-generator";

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
  const [termsVariant, setTermsVariant] = useState<PermitVariant | null>(null);
  const [isLoadingTerms, setIsLoadingTerms] = useState(false);
  const [termsLoadError, setTermsLoadError] = useState<string | null>(null);
  const [termsApplication, setTermsApplication] = useState<any | null>(null);

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

  const inferLang = (title: string): "en" | "rw" => {
    const t = title.trim();
    if (!t) return "en";
    // Heuristics: RW sections typically start with AMASEZERANO/IGICE/Ingingo/Imikono
    if (
      t.toUpperCase().includes("KINYARWANDA") ||
      t.startsWith("AMASEZERANO") ||
      t.startsWith("IGICE") ||
      t.startsWith("Ingingo") ||
      t.startsWith("Imikono") ||
      t.startsWith("Ibisobanuro")
    ) {
      return "rw";
    }
    return "en";
  };

  const availableLangs = useMemo(() => {
    const langs = new Set<"en" | "rw">();
    for (const s of resolvedTerms?.sections ?? []) langs.add(inferLang(s.title));
    return langs;
  }, [resolvedTerms]);

  const visibleSections = useMemo(() => {
    if (!resolvedTerms) return [];
    // Default to English for now (later: drive from logged-in user preference).
    if (availableLangs.size <= 1) return resolvedTerms.sections;
    return resolvedTerms.sections.filter((s) => inferLang(s.title) === "en");
  }, [resolvedTerms, availableLangs]);

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

      // Check if this is a modification application
      const isModificationApplication = applicationData.is_modification === true ||
        (parsedNotes?.isModification === true);
      
      const modificationOriginalPermitId = parsedNotes?.originalPermitId || null;

      let permitData: any;

      if (isModificationApplication && modificationOriginalPermitId) {
        // MODIFICATION: Update existing permit with the newly approved values
        console.log('🔧 Processing MODIFICATION - updating existing permit:', modificationOriginalPermitId);
        console.log('📊 Using assessor-approved terms — duration:', resolvedDurationYearsGlobal, 'years, volume:', resolvedVolumeM3, 'm³');

        // Use the already-resolved duration (from assessor adjustments)
        const resolvedDurationYears: number | null = resolvedDurationYearsGlobal !== 5
          ? resolvedDurationYearsGlobal
          : (() => {
              // If we got the default, check if assessor actually set it or it's truly the fallback
              if (typeof assessorAdjustments?.permitLengthYears === 'number') return assessorAdjustments.permitLengthYears;
              if (typeof applicationData.proposed_duration_years === 'number' &&
                  Number.isFinite(applicationData.proposed_duration_years) &&
                  applicationData.proposed_duration_years >= 1) return applicationData.proposed_duration_years;
              if (typeof parsedNotes?.permitLengthYears === 'number' &&
                  Number.isFinite(parsedNotes.permitLengthYears) &&
                  parsedNotes.permitLengthYears >= 1) return parsedNotes.permitLengthYears;
              return null;
            })();

        // Fetch the current permit to preserve values that weren't modified
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

        // Compute updated expiry date based on resolved duration or keep existing
        const newIssuedDate = new Date().toISOString().split('T')[0];
        const newExpiryDate = resolvedDurationYears
          ? new Date(Date.now() + resolvedDurationYears * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          : currentPermit.expiry_date; // Keep existing if no duration change

        // Build the update payload — only override values that exist on the modification application
        const permitUpdatePayload: Record<string, unknown> = {
          status: 'active',
          is_modification: true,
          updated_at: new Date().toISOString(),
        };

        // Update water source if provided on the modification application
        if (applicationData.water_source) {
          permitUpdatePayload.water_source = applicationData.water_source;
        }
        // Update purpose if provided
        if (applicationData.water_purpose) {
          permitUpdatePayload.purpose = applicationData.water_purpose;
        }
        // Update water allowance (volume) — prefer assessor-recommended volume over raw application value
        if (resolvedVolumeM3 > 0) {
          permitUpdatePayload.water_allowance = resolvedVolumeM3;
        } else if (applicationData.estimated_usage_volume != null && applicationData.estimated_usage_volume > 0) {
          permitUpdatePayload.water_allowance = applicationData.estimated_usage_volume;
        }
        // Update allowance unit if provided
        if (applicationData.usage_unit) {
          permitUpdatePayload.allowance_unit = applicationData.usage_unit;
        }
        // Update dates — always update issued_date; expiry_date only if duration changed
        permitUpdatePayload.issued_date = newIssuedDate;
        if (resolvedDurationYears) {
          permitUpdatePayload.expiry_date = newExpiryDate;
        }

        // Update conditions with new location/project data from modification
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
              modified_at: new Date().toISOString(),
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

        // Use maybeSingle() instead of single() to avoid PGRST116 when RLS blocks the row
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

      } else if (isRenewalApplication && renewedFromPermitId) {
        // RENEWAL: Update existing permit dates instead of creating new permit
        console.log('🔄 Processing RENEWAL - updating existing permit:', renewedFromPermitId);
        console.log('📊 Using assessor-approved duration for renewal:', resolvedDurationYearsGlobal, 'years');
        
        const newIssuedDate = new Date().toISOString().split('T')[0];
        const newExpiryDate = new Date(Date.now() + resolvedDurationYearsGlobal * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
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
      } else {
        // NEW PERMIT: Create permit in database with comprehensive data
        // Use assessor-approved terms (duration + volume) instead of hardcoded/raw values
        console.log('📝 Creating NEW permit in database...');
        console.log('📊 Using assessor-approved terms — duration:', resolvedDurationYearsGlobal, 'years, volume:', resolvedVolumeM3, 'm³');

        const newIssuedDate = new Date().toISOString().split('T')[0];
        const newExpiryDate = new Date(Date.now() + resolvedDurationYearsGlobal * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

      // Generate the exact PDF and persist it to Supabase Storage + save path in DB
      try {
        // Get conditions for PDF from permit data (handle both new and renewed permits)
        const conditionsForPdf: string[] = (() => {
          // First try to get from permitData (for renewals, this comes from the existing permit)
          if (permitData?.conditions?.conditions && Array.isArray(permitData.conditions.conditions)) {
            return permitData.conditions.conditions;
          }
          // Default conditions
          return [
            'Comply with all environmental regulations',
            'Submit quarterly usage reports',
            'Allow inspections as required',
            ...(applicationData.approval_conditions ? [applicationData.approval_conditions] : [])
          ];
        })();

        console.log('📄 Generating PDF permit (for storage + view) with duration:', resolvedDurationYearsGlobal, 'years');
        const { generateDigitalWaterPermitBlob } = await import('@/lib/pdf-generator');
        const pdfBlob = await generateDigitalWaterPermitBlob(
          applicationData,
          permitData.permit_number,
          conditionsForPdf,
          resolvedDurationYearsGlobal,
          isModificationApplication // stamp "MODIFIED PERMIT" badge on PDF
        );
        console.log('✅ PDF permit generated');

        console.log('📤 Uploading PDF to Supabase Storage...');
        const upload = await uploadPermitPdf({
          permitId: permitData.id,
          permitNumber: permitData.permit_number,
          pdfBlob,
        });

        if (upload?.path) {
          console.log('✅ PDF uploaded:', upload.path);

          const { error: permitPdfUpdateError } = await (supabase as any)
            .from('permits')
            .update({
              permit_pdf_url: upload.path, // store the storage path (preferred)
              updated_at: new Date().toISOString(),
            })
            .eq('id', permitData.id);

          if (permitPdfUpdateError) {
            console.warn('⚠️ Failed to persist permit_pdf_url on permit:', permitPdfUpdateError);
          } else {
            console.log('✅ permit_pdf_url saved on permit record');
          }
        } else {
          console.warn('⚠️ PDF upload failed (no path returned).');
        }

        // Generate Terms and Conditions PDF and open in new tab
        if (resolvedTerms) {
          console.log('📄 Generating Terms and Conditions PDF...');
          const applicantName = applicationData.applicant?.account_type === 'individual'
            ? `${applicationData.applicant.first_name || ''} ${applicationData.applicant.last_name || ''}`.trim() || 'N/A'
            : applicationData.applicant?.company_name || 'N/A';

          // Fill placeholders in the terms sections
          const filledSections = resolvedTerms.sections.map((section) => ({
            title: section.title,
            paragraphs: section.paragraphs.map((p) => 
              placeholderCtx ? fillContractText(p, placeholderCtx) : p
            )
          }));

          const termsBlob = await generateTermsConditionsPdfBlob({
            applicationNumber: applicationNumber,
            projectTitle: projectTitle,
            applicantName: applicantName,
            contractNumber: permitData.permit_number.replace('WP-', ''),
            termsHeading: resolvedTerms.heading,
            termsSections: filledSections,
            importantNotice: resolvedTerms.importantNotice || null,
          });
          
          const termsUrl = URL.createObjectURL(termsBlob);
          window.open(termsUrl, '_blank');
          console.log('✅ Terms and Conditions PDF opened in new tab');
        }

        // Open the generated Permit PDF in a new tab for the user
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
        console.log('✅ Water Permit PDF opened in new tab');
      } catch (pdfStoreError) {
        console.warn('⚠️ PDF generation/upload failed, but permit was created:', pdfStoreError);
      }

      // Finalize the workflow: once terms are accepted and permit is created, mark application as approved
      console.log('📋 Updating application status to approved...');
      const { error: updateError } = await (supabase as any)
        .from('applications')
        .update({
          status: 'approved',
          terms_status: 'accepted',
          terms_accepted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (updateError) {
        console.warn('⚠️ Warning: Failed to update application status:', updateError);
        // Continue anyway - permit was created successfully
      } else {
        console.log('✅ Application status updated successfully');
      }

      console.log("✅ Terms accepted successfully! Your permit has been generated...");
      console.log('📋 Both Terms & Conditions and Water Permit PDFs have been opened in new tabs for download.');
      
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
      // Update application with terms rejection
      const { error: updateError } = await (supabase as any)
        .from('applications')
        .update({
          terms_status: 'rejected',
          status: 'revision_required' // Send back for revision
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      console.log("Terms rejected. Application returned for revision.");
      onClose();
    } catch (error) {
      console.error('Error rejecting terms:', error);
      console.log("❌ Failed to reject terms. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] md:max-w-6xl lg:max-w-7xl h-[92vh] max-h-[92vh] p-0 overflow-hidden"
        showCloseButton={!showFeedback}
        onEscapeKeyDown={(e) => {
          // Prevent "skipping" the feedback step via ESC
          if (showFeedback) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          // Prevent "skipping" the feedback step via overlay click
          if (showFeedback) e.preventDefault();
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="px-6 pt-6">
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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            {!showFeedback ? (
              <div className="space-y-8 pt-4">
                <div>
                  <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Shield className="h-6 w-6 text-blue-600" />
                    {resolvedTerms?.heading ?? "Terms and Conditions for Water Permit"}
                  </h3>

                  <Card className="border-blue-200">
                    <CardContent className="p-8 space-y-6">
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
                    <div className="space-y-6 text-base">
                      {visibleSections
                        .filter((section) => !section.title.toLowerCase().includes("signature"))
                        .map((section, idx, filteredSections) => (
                        <div key={`${section.title}-${idx}`}>
                          <h4 className="font-semibold text-gray-900 mb-3 text-lg">{section.title}</h4>
                          <div className="space-y-3">
                            {section.paragraphs.map((p, pIdx) => (
                              <p key={pIdx} className="text-gray-700 leading-relaxed">
                                {placeholderCtx ? fillContractText(p, placeholderCtx) : p}
                              </p>
                            ))}
                          </div>
                          {idx < filteredSections.length - 1 ? <Separator className="mt-6" /> : null}
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
                <h3 className="text-xl font-semibold">How was your experience using the water permit system?</h3>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => setRating(s)} aria-label={`Rate ${s} stars`}>
                      <Star
                        className={`h-6 w-6 ${
                          rating >= s ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  className="w-full border rounded-md p-3"
                  rows={4}
                  placeholder="Share any feedback to help us improve..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => {
                      /* TODO: send feedback to supabase */
                      setShowFeedback(false);
                      onTermsAccepted();
                      onClose();
                    }}
                  >
                    Submit Feedback
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
                  Accept Terms & Generate Permit
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
} 