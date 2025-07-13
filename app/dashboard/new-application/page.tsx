"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ApplicationForm } from "@/components/dashboard/application-form";
import { PaymentNotice } from "@/components/dashboard/payment-notice";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useApplications } from "@/hooks/useApplications";
import type { Application } from "@/types/database";

// Helper function to capitalize province names for database enum compatibility
function formatProvinceForDB(province: string): Application['province'] | undefined {
  if (!province) return undefined;
  const provinceMap: Record<string, Application['province']> = {
    'kigali': 'Kigali',
    'northern': 'Northern', 
    'southern': 'Southern',
    'eastern': 'Eastern',
    'western': 'Western'
  };
  return provinceMap[province.toLowerCase()];
}

// Mapping function to transform form data to database schema
function mapFormDataToApplication(formData: any, status: 'draft' | 'submitted' = 'draft'): Partial<Application> {
  // Create coordinates object if latitude and longitude are provided
  const coordinates = (formData.latitude && formData.longitude) ? {
    type: 'Point',
    coordinates: [parseFloat(formData.longitude), parseFloat(formData.latitude)]
  } : undefined;

  return {
    // Set status based on action
    status,
    
    // Application type and water details
    application_type: formData.purpose === 'domestic' ? 'domestic' :
                     formData.purpose === 'industrial' ? 'industrial' :
                     formData.purpose === 'irrigation' ? 'agricultural' :
                     formData.purpose === 'commercial' ? 'commercial' :
                     formData.purpose === 'municipal_supply' ? 'municipal' :
                     formData.purpose === 'mining' ? 'mining_water_use' : 'domestic',
    
    water_source: formData.waterSource as Application['water_source'],
    water_purpose: formData.purpose === 'hydropower' ? 'electricity_generation' : 
                  formData.purpose as Application['water_purpose'],
    estimated_usage_volume: formData.waterUsage,
    usage_unit: formData.waterUsageUnit,
    
    // Location details - fix province mapping  
    province: formatProvinceForDB(formData.province),
    district: formData.district,
    sector: formData.sector,
    cell: formData.cell,
    village: formData.village,
    coordinates: coordinates,
    location_description: `${formData.district}, ${formData.sector}, ${formData.cell}${formData.village ? `, ${formData.village}` : ''}`,
    
    // Project information
    project_title: formData.projectTitle,
    project_description: formData.projectDescription,
    
    // Technical specifications - enhanced with all form data
    water_taking_method: formData.waterTakingMethod,
    water_measuring_method: formData.waterMeasuringMethod,
    storage_facilities: formData.storageFacilities ? 
      `${formData.storageFacilities}${formData.storageCapacity ? ` (Capacity: ${formData.storageCapacity}m³)` : ''}` : undefined,
    return_flow_description: [
      formData.returnFlowQuality,
      formData.returnFlowQuantity ? `Quantity: ${formData.returnFlowQuantity}m³/day` : '',
      formData.concessionDuration ? `Duration: ${formData.concessionDuration}` : ''
    ].filter(Boolean).join(' | '),
    
    // Industry-specific fields - enhanced with complete data
    electricity_generation_capacity: (formData.powerGenerationType || formData.installedCapacity || formData.turbineType || formData.headHeight) ? 
      [
        formData.installedCapacity ? `${formData.installedCapacity} MW` : '',
        formData.powerGenerationType ? `Type: ${formData.powerGenerationType}` : '',
        formData.turbineType ? `Turbine: ${formData.turbineType}` : '',
        formData.headHeight ? `Head: ${formData.headHeight}m` : ''
      ].filter(Boolean).join(' | ') : undefined,
    
    mining_operations_type: (formData.miningType || formData.miningMethod || formData.mineralType || formData.miningArea) ?
      [
        formData.miningType ? `Type: ${formData.miningType}` : '',
        formData.miningMethod ? `Method: ${formData.miningMethod}` : '',
        formData.mineralType ? `Mineral: ${formData.mineralType}` : '',
        formData.miningArea ? `Area: ${formData.miningArea} hectares` : ''
      ].filter(Boolean).join(' | ') : undefined,
    
    water_diversion_details: (formData.intakeLocation || formData.dischargeLocation || formData.intakeFlow || formData.dischargeFlow || formData.streamLevelVariations || formData.diversionStructureConfig) ?
      [
        formData.intakeLocation ? `Intake: ${formData.intakeLocation}` : '',
        formData.intakeFlow ? `Intake Flow: ${formData.intakeFlow}m³/s` : '',
        formData.intakeLatitude && formData.intakeLongitude ? `Intake Coords: ${formData.intakeLatitude}, ${formData.intakeLongitude}` : '',
        formData.intakeElevation ? `Intake Elevation: ${formData.intakeElevation}m` : '',
        formData.dischargeLocation ? `Discharge: ${formData.dischargeLocation}` : '',
        formData.dischargeFlow ? `Discharge Flow: ${formData.dischargeFlow}m³/s` : '',
        formData.dischargeLatitude && formData.dischargeLongitude ? `Discharge Coords: ${formData.dischargeLatitude}, ${formData.dischargeLongitude}` : '',
        formData.dischargeElevation ? `Discharge Elevation: ${formData.dischargeElevation}m` : '',
        formData.streamLevelVariations ? `Stream Variations: ${formData.streamLevelVariations}` : '',
        formData.diversionStructureConfig ? `Structure Config: ${formData.diversionStructureConfig}` : ''
      ].filter(Boolean).join(' | ') : undefined,
    
    // Infrastructure details - enhanced with all form data
    infrastructure_pipes: formData.pipeDetails,
    infrastructure_pumps: formData.pumpCapacity ? `Capacity: ${formData.pumpCapacity}m³/h` : undefined,
    infrastructure_valves: [
      formData.valveDetails,
      formData.backflowControlDevices ? `Backflow Control: ${formData.backflowControlDevices}` : ''
    ].filter(Boolean).join(' | '),
    infrastructure_meters: formData.meterDetails,
    
    // Environmental information
    environmental_assessment: formData.potentialEffects,
    mitigation_actions: formData.mitigationActions,
    
    // Additional metadata stored in internal_notes for permit type and applicant type
    internal_notes: [
      formData.permitType ? `Permit Type: ${formData.permitType}` : '',
      formData.applicantType ? `Applicant Type: ${formData.applicantType}` : '',
      formData.industryType ? `Industry: ${formData.industryType}` : '',
      formData.industryDetails ? `Industry Details: ${formData.industryDetails}` : ''
    ].filter(Boolean).join(' | '),
    
    // SLA tracking
    sla_status: 'on_time',
    
    // Use the sample user UUID (in real app, this would come from auth context)
    applicant_id: '550e8400-e29b-41d4-a716-446655440001',
  };
}

export default function NewApplicationPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const { createApplication } = useApplications();
  
  // This would typically come from a user context/state in a real application
  const userData = {
    email: "jane.doe@example.com",
    name: "Jane Doe",
    phone: "+250 789 123 456",
    address: "KN 5 Ave, Kigali, Rwanda",
    idNumber: "1 1980 8 0123456 7 89",
  };
  
  const handleSubmitApplication = async (formData: any, status: 'submitted') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Form data received:', formData);
      
      // Map form data to application schema with submitted status
      const applicationData = mapFormDataToApplication(formData, status);
      
      console.log('Mapped application data:', applicationData);
      
      // Create the application
      const newApplication = await createApplication(applicationData);
      
      if (newApplication) {
        console.log('✅ Application submitted successfully:', newApplication);
        setSuccess(true);
        
        // Redirect to dashboard after a brief success message
        setTimeout(() => {
          router.push("/dashboard?tab=applications&success=application-submitted");
        }, 2000);
      } else {
        throw new Error('Failed to submit application');
      }
    } catch (error) {
      console.error('❌ Error submitting application:', error);
      setError(error instanceof Error ? error.message : 'Failed to submit application');
      setIsLoading(false);
    }
  };

  const handleSaveAsDraft = async (formData: any, status: 'draft') => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('Saving draft, form data received:', formData);
      
      // Map form data to application schema with draft status
      const applicationData = mapFormDataToApplication(formData, status);
      
      console.log('Mapped draft application data:', applicationData);
      
      // Create the application as draft
      const newApplication = await createApplication(applicationData);
      
      if (newApplication) {
        console.log('✅ Application saved as draft successfully:', newApplication);
        setSuccess(true);
        
        // Redirect to dashboard after a brief success message
        setTimeout(() => {
          router.push("/dashboard?tab=applications&success=draft-saved");
        }, 2000);
      } else {
        throw new Error('Failed to save draft');
      }
    } catch (error) {
      console.error('❌ Error saving draft:', error);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
      setIsLoading(false);
    }
  };
  
  if (success) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="max-w-md mx-auto text-center py-12"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl text-green-900 mb-2">Success!</h2>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-green-700 mb-4">
              Your application has been saved as a draft. You can continue editing or submit it for review.
            </p>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-sm text-muted-foreground">
              Your progress has been saved and you can continue working on your application later.
            </p>
          </motion.div>
        </div>
      </DashboardLayout>
    );
  }
  
  return (
    <DashboardLayout>
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <div>
            <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">New Water Permit Application</h1>
            <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground mt-2">
              Fill out all required information to apply for your water permit. All fields marked with an asterisk (*) are required.
            </p>
          </div>
          
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}
          
          <PaymentNotice />
          
          <ApplicationForm 
            userData={userData}
            onSubmit={handleSubmitApplication}
            onSaveAsDraft={handleSaveAsDraft}
            isLoading={isLoading}
          />
        </motion.div>
      </div>
    </DashboardLayout>
  );
} 