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

  const todayLabel = useMemo(() => {
    // Use user's local timezone; format as DD/MM/YYYY (Rwanda-friendly).
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
  }, []);

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

      // Generate permit number
      
      // Create permit in database with comprehensive data
      console.log('📝 Creating permit in database...');
      const permitData_insert = {
        application_id: applicationId,
        status: 'active',
        water_source: applicationData.water_source,
        purpose: applicationData.water_purpose,
        water_allowance: applicationData.estimated_usage_volume || 0,
        allowance_unit: applicationData.usage_unit || 'm³',
        issuing_authority: 'Rwanda Water Resources Board',
        issued_date: new Date().toISOString().split('T')[0],
        expiry_date: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 years
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

      const { data: permitData, error: permitError } = await supabase
        .from('permits')
        .insert(permitData_insert as any)
        .select()
        .single() as { data: any; error: any };

      if (permitError) {
        console.error('❌ Error creating permit:', permitError);
        throw permitError;
      }
      console.log('✅ Permit created successfully:', permitData.permit_number);

      // Generate the exact PDF and persist it to Supabase Storage + save path in DB
      try {
        const conditionsForPdf: string[] = Array.isArray((permitData_insert as any)?.conditions?.conditions)
          ? ((permitData_insert as any).conditions.conditions as string[])
          : [
              'Comply with all environmental regulations',
              'Submit quarterly usage reports',
              'Allow inspections as required',
            ];

        console.log('📄 Generating PDF permit (for storage + view)...');
        const { generateDigitalWaterPermitBlob } = await import('@/lib/pdf-generator');
        const pdfBlob = await generateDigitalWaterPermitBlob(
          applicationData,
          permitData.permit_number,
          conditionsForPdf,
          5
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

        // Open the generated PDF immediately for the user
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
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
      
      // Open the generated permit in a new tab
      const permitUrl = `/dashboard/permit/${permitData.id}`;
      console.log('🔗 Opening permit URL:', permitUrl);
      window.open(permitUrl, '_blank');
      
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
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-[95vw] md:max-w-6xl lg:max-w-7xl h-[92vh] max-h-[92vh] p-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col">
          <div className="px-6 pt-6">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-full">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-semibold text-green-800">
                    🎉 Application Approved!
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
                      {visibleSections.map((section, idx) => (
                        <div key={`${section.title}-${idx}`}>
                          {section.title.toLowerCase().includes("signature") ? (
                            <div className="space-y-4">
                              <h4 className="font-semibold text-gray-900 text-lg">Signatures</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-2">
                                  <div className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                                    The WATER USER:
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    <div className="text-sm font-semibold text-gray-900">Signature:</div>
                                    <div className="h-[64px]" />
                                    <div className="border-b border-gray-400 w-full" />
                                  </div>

                                  <div className="pt-1 grid grid-cols-[64px_1fr] gap-x-3 gap-y-2">
                                    <div className="font-semibold text-gray-900">Name:</div>
                                    <div className="text-gray-900">
                                      {placeholderCtx
                                        ? placeholderCtx.isIndividual
                                          ? placeholderCtx.applicantName
                                          : placeholderCtx.representativeName
                                        : "N/A"}
                                    </div>
                                    <div className="font-semibold text-gray-900">Title:</div>
                                    <div className="text-gray-900">
                                      {placeholderCtx
                                        ? placeholderCtx.isIndividual
                                          ? "Water User"
                                          : placeholderCtx.representativeTitle
                                        : "N/A"}
                                    </div>
                                    <div className="font-semibold text-gray-900">Date:</div>
                                    <div className="text-gray-900">{todayLabel}</div>
                                  </div>
                                </div>
                              </div>
                              {idx < visibleSections.length - 1 ? <Separator className="mt-6" /> : null}
                            </div>
                          ) : (
                            <>
                              <h4 className="font-semibold text-gray-900 mb-3 text-lg">{section.title}</h4>
                              <div className="space-y-3">
                                {section.paragraphs.map((p, pIdx) => (
                                  <p key={pIdx} className="text-gray-700 leading-relaxed">
                                    {placeholderCtx ? fillContractText(p, placeholderCtx) : p}
                                  </p>
                                ))}
                              </div>
                              {idx < visibleSections.length - 1 ? <Separator className="mt-6" /> : null}
                            </>
                          )}
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
                <h3 className="text-xl font-semibold">How was your experience?</h3>
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
                    variant="outline"
                    onClick={() => {
                      setShowFeedback(false);
                      onTermsAccepted();
                      onClose();
                    }}
                  >
                    Skip
                  </Button>
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