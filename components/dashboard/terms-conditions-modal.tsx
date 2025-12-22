"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  CheckCircle, 
  AlertTriangle, 
  FileCheck, 
  Shield, 
  Clock,
  Loader2,
  Star
} from "lucide-react";
import { supabase } from "@/lib/supabase";

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

      // Generate permit number
      const permitNumber = `RWBP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      console.log('🔢 Generated permit number:', permitNumber);
      
      // Create permit in database with comprehensive data
      console.log('📝 Creating permit in database...');
      const permitData_insert = {
        application_id: applicationId,
        permit_number: permitNumber,
        status: 'active',
        water_source: applicationData.water_source,
        purpose: applicationData.water_purpose,
        water_allowance: applicationData.estimated_usage_volume || 0,
        allowance_unit: applicationData.usage_unit || 'm³',
        issuing_authority: 'Rwanda Water Board',
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

      // Import and generate PDF (make this optional to avoid blocking the flow)
      try {
        console.log('📄 Generating PDF permit...');
        const { generateDigitalWaterPermit } = await import('@/lib/pdf-generator');
        await generateDigitalWaterPermit(
          applicationData,
          permitNumber,
          ['Comply with all environmental regulations', 'Submit quarterly usage reports', 'Allow inspections as required'],
          5
        );
        console.log('✅ PDF permit generated successfully');
      } catch (pdfError) {
        console.warn('⚠️ PDF generation failed, but permit was created:', pdfError);
        // Continue anyway - PDF generation failure shouldn't block the flow
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
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
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

        {!showFeedback ? (
        <div className="space-y-8">
          <div>
            <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              Terms and Conditions for Water Permit
            </h3>
            
            <Card className="border-blue-200">
              <CardContent className="p-8 space-y-6">
                <div className="space-y-6 text-base">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 text-lg">1. Permit Validity and Compliance</h4>
                    <p className="text-gray-700 leading-relaxed">
                      This permit is issued under the Water Law of Rwanda and is valid for the specified duration. 
                      The permit holder must comply with all conditions set forth and maintain accurate records 
                      of water usage as specified in the permit conditions.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 text-lg">2. Water Usage Limitations</h4>
                    <p className="text-gray-700 leading-relaxed">
                      Water extraction must not exceed the authorized volume and must be used only for the 
                      purposes specified in this permit. Any changes to water usage patterns or purposes 
                      require prior approval from the Rwanda Water Board.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 text-lg">3. Environmental Protection</h4>
                    <p className="text-gray-700 leading-relaxed">
                      The permit holder must implement all environmental mitigation measures as specified 
                      and ensure that water extraction does not negatively impact downstream users or 
                      ecological systems. Regular environmental monitoring may be required.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 text-lg">4. Inspections and Monitoring</h4>
                    <p className="text-gray-700 leading-relaxed">
                      The Rwanda Water Board reserves the right to conduct periodic inspections of the 
                      permitted facility. The permit holder must provide access to authorized personnel 
                      and maintain all required documentation and monitoring equipment.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 text-lg">5. Reporting Requirements</h4>
                    <p className="text-gray-700 leading-relaxed">
                      Regular reports on water usage, infrastructure maintenance, and environmental 
                      impacts must be submitted as specified. Failure to submit required reports may 
                      result in permit suspension or revocation.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 text-lg">6. Permit Transfer and Modification</h4>
                    <p className="text-gray-700 leading-relaxed">
                      This permit is non-transferable without prior approval. Any modifications to the 
                      permitted activities require a formal application and approval process through 
                      the Rwanda Water Board.
                    </p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 text-lg">7. Penalties and Enforcement</h4>
                    <p className="text-gray-700 leading-relaxed">
                      Non-compliance with permit conditions may result in penalties, permit suspension, 
                      or revocation as provided under the Water Law of Rwanda. The permit holder is 
                      responsible for understanding and complying with all applicable regulations.
                    </p>
                  </div>
                </div>
                
                <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-base font-medium text-amber-800">Important Notice</p>
                      <p className="text-base text-amber-700 mt-1">
                        By accepting these terms, you acknowledge that you have read, understood, and 
                        agree to comply with all conditions. Violation of any condition may result in 
                        immediate permit suspension or revocation.
                      </p>
                    </div>
                  </div>
                </div>
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
          <div className="space-y-6">
            <h3 className="text-xl font-semibold">How was your experience?</h3>
            <div className="flex items-center gap-2">
              {[1,2,3,4,5].map((s) => (
                <button key={s} onClick={()=>setRating(s)} aria-label={`Rate ${s} stars`}>
                  <Star className={`h-6 w-6 ${rating >= s ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} />
                </button>
              ))}
            </div>
            <textarea
              className="w-full border rounded-md p-3"
              rows={4}
              placeholder="Share any feedback to help us improve..."
              value={feedback}
              onChange={(e)=>setFeedback(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>{ setShowFeedback(false); onTermsAccepted(); onClose(); }}>Skip</Button>
              <Button onClick={()=>{ /* TODO: send feedback to supabase */ setShowFeedback(false); onTermsAccepted(); onClose(); }}>Submit Feedback</Button>
            </div>
          </div>
        )}

        {!showFeedback && (
          <DialogFooter className="gap-3 pt-8">
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
        )}
      </DialogContent>
    </Dialog>
  );
} 