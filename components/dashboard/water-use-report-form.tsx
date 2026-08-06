"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Save, 
  Send, 
  User, 
  Droplets, 
  BarChart3, 
  Leaf, 
  Users, 
  Calendar,
  FileSignature,
  Loader2,
  Info,
  CheckCircle
} from "lucide-react";
import type { PermitWithApplication } from "@/hooks/usePermitsQuery";
import type { WaterUseReportTemplate, WaterUseReport } from "@/types/database";
import { getWaterUseTypeOptions, getWaterSourceTypeOptions } from "@/hooks/useWaterUseReports";

interface WaterUseReportFormProps {
  permit: PermitWithApplication;
  template: WaterUseReportTemplate;
  reportingYear: number;
  existingReport?: WaterUseReport | null;
  onSaveAsDraft: (data: any) => Promise<void>;
  onSubmit: (data: any) => Promise<void>;
  isLoading?: boolean;
  isReadOnly?: boolean;
}

type ValidationIssue = {
  sectionId: string;
  label: string;
  message?: string;
};

// Helper to format date
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export function WaterUseReportForm({
  permit,
  template,
  reportingYear,
  existingReport,
  onSaveAsDraft,
  onSubmit,
  isLoading = false,
  isReadOnly = false,
}: WaterUseReportFormProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const [activeTab, setActiveTab] = useState("section1");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSavedMessage, setDraftSavedMessage] = useState<string | null>(null);
  const permitHolderName = useMemo(() => {
    const applicant = permit.application?.applicant;
    if (applicant?.company_name) return applicant.company_name;
    const individualName = `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim();
    if (individualName) return individualName;
    if (applicant?.email) return applicant.email;
    return 'N/A';
  }, [permit.application?.applicant]);

  const buildInitialFormData = useCallback(() => ({
    reportingYear,
    // Section 3 - Actual Water Use
    section3: existingReport?.section3 || {
      operationalStatus: '',
      waterUseConflicts: '',
      paymentStatus: template === 'abstraction' ? 'paid' : 'not_paid',
      // Non-operational shortcut (both templates)
      nonOperationalReason: '',
      // Non-operational water use data (abstraction, section 3.2)
      nonOperationalVolume: '',
      nonOperationalAverageUse: '',
      nonOperationalAverageUnit: 'day',
      nonOperationalMethod: '',
      // Concession-specific
      totalSurfaceAreaOccupied: '',
      changesduringYear: false,
      changesDescription: '',
    },
    section3_quarterly: existingReport?.section3_quarterly || {
      q1: { volume: '', avgDaily: '', avgUnit: 'day', method: '' },
      q2: { volume: '', avgDaily: '', avgUnit: 'day', method: '' },
      q3: { volume: '', avgDaily: '', avgUnit: 'day', method: '' },
      q4: { volume: '', avgDaily: '', avgUnit: 'day', method: '' },
    },
    // Section 4 - Water Use Efficiency (abstraction only)
    section4: existingReport?.section4 || {
      recyclingPractices: '',
      estimatedWaterSaved: '',
      reductionPercentage: '',
      identifiedLosses: '',
    },
    // Section 5 - Environmental Practices & Incidents
    section5_monitoring: existingReport?.section5_monitoring || {
      // Concession-specific
      infrastructureNature: [],
      infrastructureOther: '',
      pollutionPrevention: '',
    },
    section5_incidents: existingReport?.section5_incidents || {
      hasIncidents: false,
      incidentDate: '',
      incidentDescription: '',
      correctiveActions: '',
      dateReportedToAuthority: '',
    },
    // Section 6 - Social & Gender
    section6_employment: existingReport?.section6_employment || {
      permanentMale: '',
      permanentFemale: '',
      temporaryMale: '',
      temporaryFemale: '',
      technicalMale: '',
      technicalFemale: '',
      unskilledMale: '',
      unskilledFemale: '',
    },
    section6_ohs: existingReport?.section6_ohs || {
      genderInclusiveSafety: false,
      genderInclusiveSafetyRemarks: '',
      separateSanitation: false,
      separateSanitationRemarks: '',
      genderGrievance: false,
      genderGrievanceRemarks: '',
    },
    // Section 7 - retired by the 2026 template revision; kept for schema/read compatibility
    section7: existingReport?.section7 || {},
    // Future Plans (next reporting year) — all items optional ("if any")
    section8: existingReport?.section8 || {
      expectedChangePercentage: '',
      plannedInfrastructureUpgrades: '',
      environmentalImprovements: '',
      genderInclusionActions: '',
    },
    // Section 9 - Declaration
    section9_declaration: existingReport?.section9_declaration || {
      declarantName: '',
      declarationDate: new Date().toISOString().split('T')[0],
      agreed: false,
    },
  }), [reportingYear, existingReport, template]);

  // Form state - organized by sections
  const [formData, setFormData] = useState(() => buildInitialFormData());

  // Non-operational users answer only the profile questions, then go straight to
  // the declaration — the template closes the reporting session at that point.
  const isNonOperational = formData.section3.operationalStatus === 'non_operational';

  // Tab set is template-driven: the 2026 template drops "Efficiency" for
  // concession and "Compliance Status" for both templates.
  const tabOrder = useMemo(() => {
    if (isNonOperational) return ["section1", "section2", "section3", "section9"];
    const order = ["section1", "section2", "section3"];
    if (template === 'abstraction') order.push("section4");
    order.push("section5", "section6", "section8", "section9");
    return order;
  }, [isNonOperational, template]);

  const sectionTitleById = useMemo(() => {
    const titles: Record<string, string> = {
      section1: "General Information",
      section2: "Permitted Water Use Summary",
      section3: "Actual Water Use During Reporting Year",
      section4: "Water Use Efficiency and Management",
      section5: template === 'concession'
        ? "Environmental Practices, Compliance, and Monitoring"
        : "Environmental Compliance and Monitoring",
      section6: "Social and Gender-Disaggregated Information",
      section8: "Future Plans (Next Reporting Year)",
      section9: "Declaration",
    };
    return titles;
  }, [template]);

  // Display number reflects position in the active tab set, not the legacy key.
  const sectionNumberById = useMemo(() => {
    const numbers: Record<string, number> = {};
    tabOrder.forEach((id, index) => { numbers[id] = index + 1; });
    return numbers;
  }, [tabOrder]);

  const sectionLabelById = useMemo(() => {
    const shortLabels: Record<string, string> = {
      section1: "General Info",
      section2: "Permitted Use",
      section3: "Actual Use",
      section4: "Efficiency",
      section5: "Environmental",
      section6: "Social/Gender",
      section8: "Future Plans",
      section9: "Declaration",
    };
    return tabOrder.reduce<Record<string, string>>((acc, id, index) => {
      acc[id] = `Section ${index + 1}: ${shortLabels[id]}`;
      return acc;
    }, {});
  }, [tabOrder]);

  useEffect(() => {
    setFormData(buildInitialFormData());
  }, [buildInitialFormData]);

  // Switching to non-operational shrinks the tab set; don't strand the user on a
  // tab that no longer exists.
  useEffect(() => {
    if (!tabOrder.includes(activeTab)) {
      setActiveTab(tabOrder[tabOrder.length - 1]);
    }
  }, [tabOrder, activeTab]);

  const isBlank = useCallback((value: unknown) => {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    return false;
  }, []);

  const normalizeDecimalValue = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const withDotSeparator = trimmed.replace(",", ".");
    const cleaned = withDotSeparator.replace(/[^0-9.]/g, "");
    const [whole = "", ...fractionParts] = cleaned.split(".");
    const wholePart = whole || (fractionParts.length > 0 ? "0" : "");
    if (fractionParts.length === 0) return wholePart;
    return `${wholePart}.${fractionParts.join("")}`;
  }, []);

  const parseNumeric = useCallback((value: unknown) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== "string") return null;
    const normalized = normalizeDecimalValue(value);
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }, [normalizeDecimalValue]);

  const hasMoreThanTwoDecimals = useCallback((value: string) => {
    const normalized = normalizeDecimalValue(value);
    if (!normalized || !normalized.includes(".")) return false;
    const decimals = normalized.split(".")[1];
    return decimals.length > 2;
  }, [normalizeDecimalValue]);

  const addRequiredIssue = useCallback(
    (issues: ValidationIssue[], sectionId: string, label: string, value: unknown) => {
      if (isBlank(value)) {
        issues.push({ sectionId, label, message: "is required" });
      }
    },
    [isBlank],
  );

  const addNumericIssue = useCallback(
    (
      issues: ValidationIssue[],
      sectionId: string,
      label: string,
      value: unknown,
      options?: { min?: number; max?: number; integer?: boolean; maxDecimals?: number },
    ) => {
      if (isBlank(value)) {
        issues.push({ sectionId, label, message: "is required" });
        return;
      }
      const numeric = parseNumeric(value);
      if (numeric === null) {
        issues.push({ sectionId, label, message: "must be a valid number" });
        return;
      }
      if (options?.integer && !Number.isInteger(numeric)) {
        issues.push({ sectionId, label, message: "must be a whole number" });
      }
      if (options?.min !== undefined && numeric < options.min) {
        issues.push({ sectionId, label, message: `must be at least ${options.min}` });
      }
      if (options?.max !== undefined && numeric > options.max) {
        issues.push({ sectionId, label, message: `must be at most ${options.max}` });
      }
      if (options?.maxDecimals !== undefined && typeof value === "string" && hasMoreThanTwoDecimals(value)) {
        issues.push({
          sectionId,
          label,
          message: `must have at most ${options.maxDecimals} decimal places`,
        });
      }
    },
    [hasMoreThanTwoDecimals, isBlank, parseNumeric],
  );

  const formatIssueText = useCallback((issue: ValidationIssue) => {
    return `${issue.label}${issue.message ? ` ${issue.message}` : ""}`;
  }, []);

  const formatSectionIssues = useCallback(
    (sectionId: string, issues: ValidationIssue[]) => {
      const sectionLabel = sectionLabelById[sectionId] || sectionId;
      return `Complete ${sectionLabel}: ${issues.map(formatIssueText).join("; ")}`;
    },
    [formatIssueText, sectionLabelById],
  );

  const formatFullValidationMessage = useCallback(
    (issues: ValidationIssue[]) => {
      const grouped = issues.reduce<Record<string, ValidationIssue[]>>((acc, issue) => {
        if (!acc[issue.sectionId]) acc[issue.sectionId] = [];
        acc[issue.sectionId].push(issue);
        return acc;
      }, {});

      return Object.entries(grouped)
        .map(([sectionId, sectionIssues]) => formatSectionIssues(sectionId, sectionIssues))
        .join(" | ");
    },
    [formatSectionIssues],
  );

  const validateSection = useCallback(
    (sectionId: string) => {
      const issues: ValidationIssue[] = [];

      if (sectionId === "section1" || sectionId === "section2") {
        return issues;
      }

      if (sectionId === "section3") {
        addRequiredIssue(issues, sectionId, "Operational Status", formData.section3.operationalStatus);

        // Non-operational: only the reason is mandatory; use data is "if any".
        if (isNonOperational) {
          addRequiredIssue(issues, sectionId, "Reason for Non-Operational Status", formData.section3.nonOperationalReason);
          if (template === "abstraction") {
            if (!isBlank(formData.section3.nonOperationalVolume)) {
              addNumericIssue(issues, sectionId, "Total Volume Used (m³)", formData.section3.nonOperationalVolume, {
                min: 0,
                maxDecimals: 2,
              });
            }
            if (!isBlank(formData.section3.nonOperationalAverageUse)) {
              addNumericIssue(issues, sectionId, "Average Use", formData.section3.nonOperationalAverageUse, {
                min: 0,
                maxDecimals: 2,
              });
            }
          }
          return issues;
        }

        addRequiredIssue(issues, sectionId, "Water Use-Related Conflicts/Challenges", formData.section3.waterUseConflicts);
        addRequiredIssue(issues, sectionId, "Payment of Water Fees", formData.section3.paymentStatus);

        if (template === "concession") {
          addNumericIssue(
            issues,
            sectionId,
            "Total Surface Area Occupied (Ha)",
            formData.section3.totalSurfaceAreaOccupied,
            { min: 0, maxDecimals: 2 },
          );
          if (formData.section3.changesduringYear) {
            addRequiredIssue(issues, sectionId, "Changes Description", formData.section3.changesDescription);
          }
        }

        if (template === "abstraction") {
          (["q1", "q2", "q3", "q4"] as const).forEach((quarter, index) => {
            const prefix = `Q${index + 1}`;
            const quarterlyData = (formData.section3_quarterly as any)[quarter] || {};
            addNumericIssue(issues, sectionId, `${prefix} Volume Used (m³/quarter)`, quarterlyData.volume, {
              min: 0,
              maxDecimals: 2,
            });
            addNumericIssue(issues, sectionId, `${prefix} Average Use`, quarterlyData.avgDaily, {
              min: 0,
              maxDecimals: 2,
            });
            addRequiredIssue(issues, sectionId, `${prefix} Measurement Method`, quarterlyData.method);
          });
        }
      }

      if (sectionId === "section4") {
        // Efficiency section only exists on the abstraction template.
        addRequiredIssue(issues, sectionId, "Recycling / Reuse Practices", formData.section4.recyclingPractices);
        addNumericIssue(issues, sectionId, "Estimated Water Saved (m³/year)", formData.section4.estimatedWaterSaved, {
          min: 0,
          maxDecimals: 2,
        });
        addNumericIssue(issues, sectionId, "Water Reduction Compared to the Previous Year (%)", formData.section4.reductionPercentage, {
          min: 0,
          max: 100,
          maxDecimals: 2,
        });
        addRequiredIssue(issues, sectionId, "Identified Losses", formData.section4.identifiedLosses);
      }

      if (sectionId === "section5") {
        if (template === "concession") {
          const natures: string[] = Array.isArray(formData.section5_monitoring.infrastructureNature)
            ? formData.section5_monitoring.infrastructureNature
            : [];
          if (natures.length === 0) {
            issues.push({
              sectionId,
              label: "Infrastructure/Equipment Nature",
              message: "is required",
            });
          }
          if (natures.includes("Any other")) {
            addRequiredIssue(issues, sectionId, "Other Infrastructure/Equipment (specify)", formData.section5_monitoring.infrastructureOther);
          }
          addRequiredIssue(issues, sectionId, "Pollution Prevention & Control Practices", formData.section5_monitoring.pollutionPrevention);
        }

        if (formData.section5_incidents.hasIncidents) {
          addRequiredIssue(issues, sectionId, "Date of Incident", formData.section5_incidents.incidentDate);
          addRequiredIssue(issues, sectionId, "Date Reported to Authority", formData.section5_incidents.dateReportedToAuthority);
          addRequiredIssue(issues, sectionId, "Incident Description", formData.section5_incidents.incidentDescription);
          addRequiredIssue(issues, sectionId, "Corrective Actions Taken", formData.section5_incidents.correctiveActions);
        }
      }

      if (sectionId === "section6") {
        addNumericIssue(issues, sectionId, "Permanent Employees (Male)", formData.section6_employment.permanentMale, {
          min: 0,
          integer: true,
        });
        addNumericIssue(issues, sectionId, "Permanent Employees (Female)", formData.section6_employment.permanentFemale, {
          min: 0,
          integer: true,
        });
        addNumericIssue(issues, sectionId, "Temporary Employees (Male)", formData.section6_employment.temporaryMale, {
          min: 0,
          integer: true,
        });
        addNumericIssue(issues, sectionId, "Temporary Employees (Female)", formData.section6_employment.temporaryFemale, {
          min: 0,
          integer: true,
        });
        addNumericIssue(issues, sectionId, "Technical Staff (Male)", formData.section6_employment.technicalMale, {
          min: 0,
          integer: true,
        });
        addNumericIssue(issues, sectionId, "Technical Staff (Female)", formData.section6_employment.technicalFemale, {
          min: 0,
          integer: true,
        });
        addNumericIssue(issues, sectionId, "Unskilled Staff (Male)", formData.section6_employment.unskilledMale, {
          min: 0,
          integer: true,
        });
        addNumericIssue(issues, sectionId, "Unskilled Staff (Female)", formData.section6_employment.unskilledFemale, {
          min: 0,
          integer: true,
        });

        addRequiredIssue(
          issues,
          sectionId,
          "Gender-inclusive safety remarks",
          formData.section6_ohs.genderInclusiveSafetyRemarks,
        );
        addRequiredIssue(
          issues,
          sectionId,
          "Separate sanitation remarks",
          formData.section6_ohs.separateSanitationRemarks,
        );
        addRequiredIssue(
          issues,
          sectionId,
          "Gender grievance remarks",
          formData.section6_ohs.genderGrievanceRemarks,
        );
      }

      // Future Plans items are all "(if any)" in the 2026 template — validate
      // format only, never presence.
      if (sectionId === "section8") {
        if (!isBlank(formData.section8.expectedChangePercentage)) {
          addNumericIssue(
            issues,
            sectionId,
            "Expected Increase/Decrease (%)",
            formData.section8.expectedChangePercentage,
            { min: 0, max: 100, maxDecimals: 2 },
          );
        }
      }

      if (sectionId === "section9") {
        addRequiredIssue(issues, sectionId, "Full Name", formData.section9_declaration.declarantName);
        addRequiredIssue(issues, sectionId, "Declaration Date", formData.section9_declaration.declarationDate);
        if (!formData.section9_declaration.agreed) {
          issues.push({
            sectionId,
            label: "Declaration agreement",
            message: "must be accepted",
          });
        }
      }

      return issues;
    },
    [addNumericIssue, addRequiredIssue, formData, isBlank, isNonOperational, template],
  );

  const validateAllSections = useCallback(() => {
    const validationOrder = tabOrder.filter((tabId) => tabId !== "section1" && tabId !== "section2");
    return validationOrder.flatMap((sectionId) => validateSection(sectionId));
  }, [tabOrder, validateSection]);

  const attemptTabChange = useCallback(
    (targetTabId: string) => {
      if (isReadOnly) {
        setActiveTab(targetTabId);
        return;
      }

      const currentIndex = tabOrder.indexOf(activeTab);
      const targetIndex = tabOrder.indexOf(targetTabId);
      if (currentIndex === -1 || targetIndex === -1) return;
      if (targetIndex <= currentIndex) {
        setValidationError(null);
        setActiveTab(targetTabId);
        return;
      }
      if (targetIndex !== currentIndex + 1) {
        setValidationError(`Complete ${sectionLabelById[activeTab]} before moving to the next section.`);
        return;
      }

      const currentIssues = validateSection(activeTab);
      if (currentIssues.length > 0) {
        setValidationError(formatSectionIssues(activeTab, currentIssues));
        return;
      }

      setValidationError(null);
      setActiveTab(targetTabId);
    },
    [activeTab, formatSectionIssues, isReadOnly, sectionLabelById, tabOrder, validateSection],
  );

  const handleNextSection = useCallback(() => {
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex < 0 || currentIndex >= tabOrder.length - 1) return;
    attemptTabChange(tabOrder[currentIndex + 1]);
  }, [activeTab, attemptTabChange, tabOrder]);

  const handlePreviousSection = useCallback(() => {
    const currentIndex = tabOrder.indexOf(activeTab);
    if (currentIndex <= 0) return;
    setValidationError(null);
    setActiveTab(tabOrder[currentIndex - 1]);
  }, [activeTab, tabOrder]);

  // Update form data helper
  const updateFormData = useCallback((section: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        [field]: value,
      },
    }));
  }, []);

  const updatePercentageField = useCallback((section: string, field: string, rawValue: string) => {
    if (rawValue === '') {
      updateFormData(section, field, '');
      return;
    }

    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) return;

    const clamped = Math.max(0, Math.min(100, numeric));
    const roundedToTwoDecimals = Math.round(clamped * 100) / 100;
    updateFormData(section, field, String(roundedToTwoDecimals));
  }, [updateFormData]);

  // Update nested form data helper
  const updateNestedFormData = useCallback((section: string, parent: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...(prev as any)[section],
        [parent]: {
          ...((prev as any)[section]?.[parent] || {}),
          [field]: value,
        },
      },
    }));
  }, []);

  // Get water use type options based on template
  const waterUseOptions = useMemo(() => getWaterUseTypeOptions(template), [template]);
  const waterSourceOptions = useMemo(() => getWaterSourceTypeOptions(template), [template]);

  // Calculate totals for employment
  const employmentTotals = useMemo(() => {
    const emp = formData.section6_employment;
    const permanent = (parseInt(emp.permanentMale) || 0) + (parseInt(emp.permanentFemale) || 0);
    const temporary = (parseInt(emp.temporaryMale) || 0) + (parseInt(emp.temporaryFemale) || 0);
    const technical = (parseInt(emp.technicalMale) || 0) + (parseInt(emp.technicalFemale) || 0);
    const unskilled = (parseInt(emp.unskilledMale) || 0) + (parseInt(emp.unskilledFemale) || 0);
    const totalMale = (parseInt(emp.permanentMale) || 0) + (parseInt(emp.temporaryMale) || 0) + 
                      (parseInt(emp.technicalMale) || 0) + (parseInt(emp.unskilledMale) || 0);
    const totalFemale = (parseInt(emp.permanentFemale) || 0) + (parseInt(emp.temporaryFemale) || 0) + 
                        (parseInt(emp.technicalFemale) || 0) + (parseInt(emp.unskilledFemale) || 0);
    return { permanent, temporary, technical, unskilled, totalMale, totalFemale, total: totalMale + totalFemale };
  }, [formData.section6_employment]);

  // Calculate quarterly totals for abstraction
  const quarterlyTotal = useMemo(() => {
    const q = formData.section3_quarterly;
    return (parseFloat(q.q1?.volume) || 0) + (parseFloat(q.q2?.volume) || 0) + 
           (parseFloat(q.q3?.volume) || 0) + (parseFloat(q.q4?.volume) || 0);
  }, [formData.section3_quarterly]);

  // Handle save
  const handleSave = async () => {
    setValidationError(null);
    setDraftSavedMessage(null);
    const reduction = Number(formData.section4.reductionPercentage || 0);
    const expectedChange = Number(formData.section8.expectedChangePercentage || 0);
    if (
      reduction > 100 ||
      reduction < 0 ||
      expectedChange > 100 ||
      expectedChange < 0 ||
      hasMoreThanTwoDecimals(formData.section4.reductionPercentage || '') ||
      hasMoreThanTwoDecimals(formData.section8.expectedChangePercentage || '')
    ) {
      setValidationError("Percentage fields must be between 0 and 100, with at most 2 decimal places.");
      return;
    }
    setIsSavingDraft(true);
    try {
      await onSaveAsDraft(formData);
      setDraftSavedMessage('Draft saved successfully.');
      setTimeout(() => setDraftSavedMessage(null), 3000);
    } catch (err) {
      console.error('❌ Error saving water use report draft:', err);
      setValidationError(err instanceof Error ? err.message : 'Failed to save draft. Please try again.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle submit
  const handleSubmitForm = async () => {
    setValidationError(null);
    const allIssues = validateAllSections();
    if (allIssues.length > 0) {
      const firstInvalidSection = allIssues[0]?.sectionId;
      if (firstInvalidSection) {
        setActiveTab(firstInvalidSection);
      }
      setValidationError(formatFullValidationMessage(allIssues));
      return;
    }

    const reduction = Number(formData.section4.reductionPercentage || 0);
    const expectedChange = Number(formData.section8.expectedChangePercentage || 0);

    if (
      reduction > 100 ||
      reduction < 0 ||
      expectedChange > 100 ||
      expectedChange < 0 ||
      hasMoreThanTwoDecimals(formData.section4.reductionPercentage || '') ||
      hasMoreThanTwoDecimals(formData.section8.expectedChangePercentage || '')
    ) {
      setValidationError("Percentage fields must be between 0 and 100, with at most 2 decimal places.");
      return;
    }
    try {
      await onSubmit(formData);
    } catch (err) {
      console.error('❌ Error submitting water use report:', err);
      setValidationError(err instanceof Error ? err.message : 'Failed to submit report. Please try again.');
    }
  };

  // Tab configuration follows tabOrder, which is template- and status-driven.
  const tabMeta: Record<string, { label: string; icon: typeof User }> = {
    section1: { label: tx('General Info'), icon: User },
    section2: { label: tx('Permitted Use'), icon: Droplets },
    section3: { label: tx('Actual Use'), icon: BarChart3 },
    section4: { label: tx('Efficiency'), icon: Leaf },
    section5: { label: tx('Environmental'), icon: Leaf },
    section6: { label: tx('Social/Gender'), icon: Users },
    section8: { label: tx('Future Plans'), icon: Calendar },
    section9: { label: tx('Declaration'), icon: FileSignature },
  };
  const tabs = tabOrder.map((id) => ({ id, ...tabMeta[id] }));

  // Heading helper: "Section N: Title" using the live numbering.
  const heading = (id: string) => `${tx("Section")} ${sectionNumberById[id]}: ${tx(sectionTitleById[id])}`;

  return (
    <Card className="border-2 border-blue-200">
      <CardHeader className="bg-blue-50 border-b border-blue-200">
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <BarChart3 className="h-5 w-5" />
          {tx("Annual Water Use Report")} - {reportingYear}
        </CardTitle>
        <CardDescription className="text-blue-700">
          {isNonOperational
            ? tx("Non-operational users complete only the sections below, then submit — the reporting session closes immediately.")
            : `${tx("Complete all")} ${tabOrder.length} ${tx("sections below. Click each tab to fill in the required information.")}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <Tabs value={activeTab} onValueChange={attemptTabChange} className="w-full">
          {/* Water Use Report Section Tabs - Made prominent */}
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border">
            <p className="text-sm font-medium text-slate-700 mb-3">📋 {tx("Report Sections (click to navigate)")}:</p>
            <TabsList className="flex flex-wrap gap-2 h-auto p-0 bg-transparent w-full">
              {tabs.map((tab, index) => (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id}
                  className="text-sm px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-100 rounded-md flex items-center gap-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:border-blue-600"
                >
                  <span className="font-bold">{index + 1}.</span>
                  <tab.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

        {/* SECTION 1: General Information (Read-only, prefilled from permit) */}
        <TabsContent value="section1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {heading("section1")}
              </CardTitle>
              <CardDescription>
                {tx("This information is automatically populated from your permit. It cannot be edited.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{tx("Name of Permit Holder")}</Label>
                  <div className="p-3 bg-slate-50 rounded-md border">
                    {permitHolderName}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{tx("Water Use Permit Number")}</Label>
                  <div className="p-3 bg-slate-50 rounded-md border font-mono">
                    {permit.permit_number}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{tx("Permit Issue Date")}</Label>
                  <div className="p-3 bg-slate-50 rounded-md border">
                    {formatDate(permit.issued_date)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{tx("Permit Expiry Date")}</Label>
                  <div className="p-3 bg-slate-50 rounded-md border">
                    {formatDate(permit.expiry_date)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{tx("Type of Water Use")}</Label>
                  <div className="p-3 bg-slate-50 rounded-md border capitalize">
                    {permit.purpose?.replace(/_/g, ' ') || 'N/A'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{tx("Water Source Type")}</Label>
                  <div className="p-3 bg-slate-50 rounded-md border capitalize">
                    {permit.water_source?.replace(/_/g, ' ') || 'N/A'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">{tx("Name of Water Body")}</Label>
                  <div className="p-3 bg-slate-50 rounded-md border">
                    {permit.application?.water_body_name || 'N/A'}
                  </div>
                </div>
              </div>

              {/* Administrative Location */}
              <div className="pt-4 border-t">
                <Label className="text-muted-foreground mb-3 block">{tx("Administrative Location")}</Label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{tx("Province")}</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.province || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{tx("District")}</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.district || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{tx("Sector")}</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.sector || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{tx("Cell")}</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.cell || 'N/A'}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">{tx("Village")}</span>
                    <div className="p-2 bg-slate-50 rounded-md border text-sm">
                      {permit.application?.village || 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reporting Year closes Section 1 per the 2026 template */}
              <div className="pt-4 border-t space-y-2">
                <Label className="text-muted-foreground">{tx("Reporting Year")}</Label>
                <div className="p-3 bg-blue-50 rounded-md border border-blue-200 font-semibold text-blue-800 md:max-w-xs">
                  {reportingYear}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 2: Permitted Water Use Summary */}
        <TabsContent value="section2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5" />
                {heading("section2")}
              </CardTitle>
              <CardDescription>
                {tx("Authorized values from your permit. These are read-only.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {template === 'abstraction' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">{tx("Maximum Abstraction Rate (m³/day)")}</Label>
                    <div className="p-3 bg-slate-50 rounded-md border">
                      {permit.application?.max_daily_volume_m3 
                        ? `${permit.application.max_daily_volume_m3.toLocaleString()} m³/day`
                        : permit.water_allowance 
                          ? `${permit.water_allowance.toLocaleString()} ${permit.allowance_unit || 'm³'}`
                          : tx('Not specified in permit')}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">{tx("Authorized Annual Volume (m³/year)")}</Label>
                    <div className="p-3 bg-slate-50 rounded-md border">
                      {permit.application?.max_yearly_volume_m3 
                        ? `${permit.application.max_yearly_volume_m3.toLocaleString()} m³/year`
                        : permit.water_allowance && permit.allowance_unit?.includes('year')
                          ? `${permit.water_allowance.toLocaleString()} ${permit.allowance_unit}`
                          : tx('Not specified in permit')}
                    </div>
                  </div>
                  {/* Show permit allowance if available as additional info */}
                  {permit.water_allowance && (
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-muted-foreground">{tx("Permit Water Allowance")}</Label>
                      <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                        {permit.water_allowance.toLocaleString()} {permit.allowance_unit || 'm³'}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-muted-foreground">{tx("Authorized Lake Surface Area (Ha)")}</Label>
                    <div className="p-3 bg-slate-50 rounded-md border">
                      {permit.application?.concession_area 
                        ? `${permit.application.concession_area.toLocaleString()} Ha`
                        : permit.water_allowance 
                          ? `${permit.water_allowance.toLocaleString()} ${permit.allowance_unit || 'Ha'}`
                          : tx('Not specified in permit')}
                    </div>
                  </div>
                  {/* Show permit allowance if available */}
                  {permit.water_allowance && (
                    <div className="space-y-2">
                      <Label className="text-muted-foreground">{tx("Permit Allowance")}</Label>
                      <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                        {permit.water_allowance.toLocaleString()} {permit.allowance_unit || 'Ha'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 3: Actual Water Use During Reporting Year */}
        <TabsContent value="section3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {heading("section3")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 3.1 Water Use Profile */}
              <h4 className="font-medium">{tx("3.1 Water Use Profile")}</h4>

              {/* Operational Status */}
              <div className="space-y-3">
                <Label>{tx("Operational Status")} *</Label>
                <RadioGroup
                  value={formData.section3.operationalStatus}
                  onValueChange={(value) => updateFormData('section3', 'operationalStatus', value)}
                  disabled={isReadOnly}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="operational" id="operational" />
                    <Label htmlFor="operational">{tx("Operational")}</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="non_operational" id="non_operational" />
                    <Label htmlFor="non_operational">{tx("Non-operational")}</Label>
                  </div>
                </RadioGroup>
                {isNonOperational && (
                  <Alert className="border-amber-200 bg-amber-50">
                    <Info className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      {tx("As a non-operational user, state your reason below and the reporting session will be closed on submission.")}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Non-operational: reason + optional water use data (3.2) */}
              {isNonOperational && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="nonOpReason">{tx("Reason for Non-Operational Status")} *</Label>
                    <Textarea
                      id="nonOpReason"
                      value={formData.section3.nonOperationalReason}
                      onChange={(e) => updateFormData('section3', 'nonOperationalReason', e.target.value)}
                      disabled={isReadOnly}
                      placeholder={tx("Explain why the water use activity was not operational...")}
                      rows={3}
                    />
                  </div>

                  {template === 'abstraction' && (
                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-4">{tx("3.2 Water Use Data (for non-operational) — if any")}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="nonOpVolume">{tx("Total Volume Used (m³)")}</Label>
                          <Input
                            id="nonOpVolume"
                            type="number"
                            step="0.01"
                            value={formData.section3.nonOperationalVolume}
                            onChange={(e) => updateFormData('section3', 'nonOperationalVolume', e.target.value)}
                            disabled={isReadOnly}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nonOpAvg">{tx("Average Use")}</Label>
                          <div className="flex gap-2">
                            <Input
                              id="nonOpAvg"
                              type="number"
                              step="0.01"
                              value={formData.section3.nonOperationalAverageUse}
                              onChange={(e) => updateFormData('section3', 'nonOperationalAverageUse', e.target.value)}
                              disabled={isReadOnly}
                            />
                            <Select
                              value={formData.section3.nonOperationalAverageUnit || 'day'}
                              onValueChange={(value) => updateFormData('section3', 'nonOperationalAverageUnit', value)}
                              disabled={isReadOnly}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="day">{tx("m³/day")}</SelectItem>
                                <SelectItem value="month">{tx("m³/month")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nonOpMethod">{tx("Measurement Method")}</Label>
                          <Select
                            value={formData.section3.nonOperationalMethod || ''}
                            onValueChange={(value) => updateFormData('section3', 'nonOperationalMethod', value)}
                            disabled={isReadOnly}
                          >
                            <SelectTrigger id="nonOpMethod">
                              <SelectValue placeholder={tx("Select")} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="meter">{tx("Meter Reading")}</SelectItem>
                              <SelectItem value="calculation">{tx("Calculation")}</SelectItem>
                              <SelectItem value="estimation">{tx("Estimation")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Concession-specific fields */}
              {template === 'concession' && !isNonOperational && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="totalSurface">{tx("Total Surface Area Occupied — current coverage (Ha)")}</Label>
                    <Input
                      id="totalSurface"
                      type="number"
                      step="0.01"
                      value={formData.section3.totalSurfaceAreaOccupied}
                      onChange={(e) => updateFormData('section3', 'totalSurfaceAreaOccupied', e.target.value)}
                      disabled={isReadOnly}
                      placeholder={tx("Enter surface area in hectares")}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="changesYear"
                        checked={formData.section3.changesduringYear}
                        onCheckedChange={(checked) => updateFormData('section3', 'changesduringYear', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="changesYear">{tx("Changes During Reporting Year?")}</Label>
                    </div>
                    {formData.section3.changesduringYear && (
                      <Textarea
                        value={formData.section3.changesDescription}
                        onChange={(e) => updateFormData('section3', 'changesDescription', e.target.value)}
                        disabled={isReadOnly}
                        placeholder={tx("Describe the changes...")}
                        rows={3}
                      />
                    )}
                  </div>
                </>
              )}

              {/* Water Use Conflicts + Payment — operational users only */}
              {!isNonOperational && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="conflicts">{tx("Water Use-Related Conflict or Challenges in the Area")}</Label>
                    <Textarea
                      id="conflicts"
                      value={formData.section3.waterUseConflicts}
                      onChange={(e) => updateFormData('section3', 'waterUseConflicts', e.target.value)}
                      disabled={isReadOnly}
                      placeholder={tx("Describe any conflicts or challenges...")}
                      rows={3}
                    />
                  </div>

                  {/* Payment Status */}
                  <div className="space-y-3">
                    <Label>{tx("Payment of Water Fees")}</Label>
                    <RadioGroup
                      value={formData.section3.paymentStatus}
                      onValueChange={(value) => updateFormData('section3', 'paymentStatus', value)}
                      disabled={isReadOnly}
                      className="flex gap-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="paid" id="paid" />
                        <Label htmlFor="paid">
                          {template === 'abstraction'
                            ? tx("Paid (approved by the system)")
                            : tx("Paid (attach proof of payment)")}
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="not_paid" id="not_paid" />
                        <Label htmlFor="not_paid">{tx("Not Paid")}</Label>
                      </div>
                    </RadioGroup>
                  </div>
                </>
              )}

              {/* 3.3 Quarterly Water Use Data - Abstraction, operational only */}
              {template === 'abstraction' && !isNonOperational && (
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-4">{tx("3.3 Quarterly Water Use Data (for operational)")}</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{tx("Quarter")}</TableHead>
                        <TableHead>{tx("Volume Used (m³/quarter)")}</TableHead>
                        <TableHead>{tx("Average Use")}</TableHead>
                        <TableHead>{tx("Measurement Method")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {['q1', 'q2', 'q3', 'q4'].map((q, idx) => (
                        <TableRow key={q}>
                          <TableCell className="font-medium">Q{idx + 1}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={(formData.section3_quarterly as any)[q]?.volume || ''}
                              onChange={(e) => updateNestedFormData('section3_quarterly', q, 'volume', e.target.value)}
                              disabled={isReadOnly}
                              className="w-28"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={(formData.section3_quarterly as any)[q]?.avgDaily || ''}
                                onChange={(e) => updateNestedFormData('section3_quarterly', q, 'avgDaily', e.target.value)}
                                disabled={isReadOnly}
                                className="w-24"
                              />
                              <Select
                                value={(formData.section3_quarterly as any)[q]?.avgUnit || 'day'}
                                onValueChange={(value) => updateNestedFormData('section3_quarterly', q, 'avgUnit', value)}
                                disabled={isReadOnly}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="day">{tx("m³/day")}</SelectItem>
                                  <SelectItem value="month">{tx("m³/month")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={(formData.section3_quarterly as any)[q]?.method || ''}
                              onValueChange={(value) => updateNestedFormData('section3_quarterly', q, 'method', value)}
                              disabled={isReadOnly}
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="meter">{tx("Meter Reading")}</SelectItem>
                                <SelectItem value="calculation">{tx("Calculation")}</SelectItem>
                                <SelectItem value="estimation">{tx("Estimation")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-slate-50">
                        <TableCell className="font-bold">{tx("Total")}</TableCell>
                        <TableCell className="font-bold">{quarterlyTotal.toFixed(2)} m³</TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 4: Water Use Efficiency and Management */}
        <TabsContent value="section4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Leaf className="h-5 w-5" />
                {heading("section4")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="recycling">{tx("Recycling / Reuse Practices")}</Label>
                <Textarea
                  id="recycling"
                  value={formData.section4.recyclingPractices}
                  onChange={(e) => updateFormData('section4', 'recyclingPractices', e.target.value)}
                  disabled={isReadOnly}
                  placeholder={tx("Describe recycling practices...")}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="waterSaved">{tx("Estimated Water Saved (m³/year)")}</Label>
                  <Input
                    id="waterSaved"
                    type="number"
                    step="0.01"
                    value={formData.section4.estimatedWaterSaved}
                    onChange={(e) => updateFormData('section4', 'estimatedWaterSaved', e.target.value)}
                    disabled={isReadOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reduction">{tx("Water Reduction Compared to the Previous Year (%)")}</Label>
                  <Input
                    id="reduction"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formData.section4.reductionPercentage}
                    onChange={(e) => updatePercentageField('section4', 'reductionPercentage', e.target.value)}
                    disabled={isReadOnly}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="losses">
                  {tx("Identified Losses (Leakage, Source Seepage, Source Dry-out Evaporation, etc.)")}
                </Label>
                <Textarea
                  id="losses"
                  value={formData.section4.identifiedLosses}
                  onChange={(e) => updateFormData('section4', 'identifiedLosses', e.target.value)}
                  disabled={isReadOnly}
                  placeholder={tx("Describe identified water losses...")}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 5: Environmental Compliance and Monitoring */}
        <TabsContent value="section5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Leaf className="h-5 w-5" />
                {heading("section5")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Concession-specific: 4.1 Environmental Practices */}
              {template === 'concession' && (
                <>
                  <h4 className="font-medium">{sectionNumberById.section5}.1 {tx("Environmental Practices")}</h4>
                  <div className="space-y-3">
                    <Label>{tx("Nature/Property of Used Infrastructure/Equipment Offshore")}</Label>
                    <div className="flex flex-wrap gap-4">
                      {['Stainless steel', 'Wood', 'Galvanized', 'Plastic', 'Any other'].map((item) => (
                        <div key={item} className="flex items-center space-x-2">
                          <Checkbox
                            id={`infra-${item}`}
                            checked={formData.section5_monitoring.infrastructureNature?.includes(item)}
                            onCheckedChange={(checked) => {
                              const current = formData.section5_monitoring.infrastructureNature || [];
                              const updated = checked
                                ? [...current, item]
                                : current.filter((i: string) => i !== item);
                              updateFormData('section5_monitoring', 'infrastructureNature', updated);
                            }}
                            disabled={isReadOnly}
                          />
                          <Label htmlFor={`infra-${item}`}>{tx(item)}</Label>
                        </div>
                      ))}
                    </div>
                    {formData.section5_monitoring.infrastructureNature?.includes('Any other') && (
                      <Input
                        value={formData.section5_monitoring.infrastructureOther || ''}
                        onChange={(e) => updateFormData('section5_monitoring', 'infrastructureOther', e.target.value)}
                        disabled={isReadOnly}
                        placeholder={tx("Specify other infrastructure/equipment...")}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pollution">{tx("Pollution Prevention & Control Practices")}</Label>
                    <Textarea
                      id="pollution"
                      value={formData.section5_monitoring.pollutionPrevention}
                      onChange={(e) => updateFormData('section5_monitoring', 'pollutionPrevention', e.target.value)}
                      disabled={isReadOnly}
                      placeholder={tx("Describe pollution prevention practices...")}
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* Environmental Incidents */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-4">{sectionNumberById.section5}.{template === 'concession' ? '2' : '1'} {tx("Environmental Incidents")}</h4>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasIncidents"
                      checked={formData.section5_incidents.hasIncidents}
                      onCheckedChange={(checked) => updateFormData('section5_incidents', 'hasIncidents', checked)}
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="hasIncidents">{tx("Any pollution, spills, or accidents?")}</Label>
                  </div>
                  {formData.section5_incidents.hasIncidents && (
                    <div className="space-y-4 pl-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="incidentDate">{tx("Date of Incident")}</Label>
                          <Input
                            id="incidentDate"
                            type="date"
                            max={new Date().toISOString().split('T')[0]}
                            value={formData.section5_incidents.incidentDate}
                            onChange={(e) => updateFormData('section5_incidents', 'incidentDate', e.target.value)}
                            disabled={isReadOnly}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reportedDate">{tx("Date Reported to Authority")}</Label>
                          <Input
                            id="reportedDate"
                            type="date"
                            max={new Date().toISOString().split('T')[0]}
                            value={formData.section5_incidents.dateReportedToAuthority}
                            onChange={(e) => updateFormData('section5_incidents', 'dateReportedToAuthority', e.target.value)}
                            disabled={isReadOnly}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="incidentDesc">{tx("Description")}</Label>
                        <Textarea
                          id="incidentDesc"
                          value={formData.section5_incidents.incidentDescription}
                          onChange={(e) => updateFormData('section5_incidents', 'incidentDescription', e.target.value)}
                          disabled={isReadOnly}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="corrective">{tx("Corrective Actions Taken")}</Label>
                        <Textarea
                          id="corrective"
                          value={formData.section5_incidents.correctiveActions}
                          onChange={(e) => updateFormData('section5_incidents', 'correctiveActions', e.target.value)}
                          disabled={isReadOnly}
                          rows={3}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 6: Social and Gender-Disaggregated Information */}
        <TabsContent value="section6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                {heading("section6")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Employment Table */}
              <div>
                <h4 className="font-medium mb-4">{sectionNumberById.section6}.1 {tx("Employment Related to Water Use Activity")}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tx("Category")}</TableHead>
                      <TableHead>{tx("Male")}</TableHead>
                      <TableHead>{tx("Female")}</TableHead>
                      <TableHead>{tx("Total")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{tx("Permanent Employees")}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.permanentMale}
                          onChange={(e) => updateFormData('section6_employment', 'permanentMale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.permanentFemale}
                          onChange={(e) => updateFormData('section6_employment', 'permanentFemale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{employmentTotals.permanent}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{tx("Temporary / Seasonal Workers")}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.temporaryMale}
                          onChange={(e) => updateFormData('section6_employment', 'temporaryMale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.temporaryFemale}
                          onChange={(e) => updateFormData('section6_employment', 'temporaryFemale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{employmentTotals.temporary}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{tx("Technical / Skilled Staff")}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.technicalMale}
                          onChange={(e) => updateFormData('section6_employment', 'technicalMale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.technicalFemale}
                          onChange={(e) => updateFormData('section6_employment', 'technicalFemale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{employmentTotals.technical}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>{tx("Unskilled / Support Staff")}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.unskilledMale}
                          onChange={(e) => updateFormData('section6_employment', 'unskilledMale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={formData.section6_employment.unskilledFemale}
                          onChange={(e) => updateFormData('section6_employment', 'unskilledFemale', e.target.value)}
                          disabled={isReadOnly}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{employmentTotals.unskilled}</TableCell>
                    </TableRow>
                    <TableRow className="bg-slate-50 font-bold">
                      <TableCell>{tx("Total Workforce")}</TableCell>
                      <TableCell>{employmentTotals.totalMale}</TableCell>
                      <TableCell>{employmentTotals.totalFemale}</TableCell>
                      <TableCell>{employmentTotals.total}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* OHS */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-4">{sectionNumberById.section6}.2 {tx("Occupational Health and Safety (Gender-Sensitive)")}</h4>
                <div className="space-y-4">
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center space-x-2 min-w-[250px]">
                      <Checkbox
                        id="genderSafety"
                        checked={formData.section6_ohs.genderInclusiveSafety}
                        onCheckedChange={(checked) => updateFormData('section6_ohs', 'genderInclusiveSafety', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="genderSafety">{tx("Gender-inclusive safety measures in place")}</Label>
                    </div>
                    <Input
                      placeholder={tx("Remarks")}
                      value={formData.section6_ohs.genderInclusiveSafetyRemarks}
                      onChange={(e) => updateFormData('section6_ohs', 'genderInclusiveSafetyRemarks', e.target.value)}
                      disabled={isReadOnly}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center space-x-2 min-w-[250px]">
                      <Checkbox
                        id="sanitation"
                        checked={formData.section6_ohs.separateSanitation}
                        onCheckedChange={(checked) => updateFormData('section6_ohs', 'separateSanitation', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="sanitation">{tx("Separate sanitation facilities")}</Label>
                    </div>
                    <Input
                      placeholder={tx("Remarks")}
                      value={formData.section6_ohs.separateSanitationRemarks}
                      onChange={(e) => updateFormData('section6_ohs', 'separateSanitationRemarks', e.target.value)}
                      disabled={isReadOnly}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="flex items-center space-x-2 min-w-[250px]">
                      <Checkbox
                        id="grievance"
                        checked={formData.section6_ohs.genderGrievance}
                        onCheckedChange={(checked) => updateFormData('section6_ohs', 'genderGrievance', checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor="grievance">{tx("Gender-responsive grievance mechanism")}</Label>
                    </div>
                    <Input
                      placeholder={tx("Remarks")}
                      value={formData.section6_ohs.genderGrievanceRemarks}
                      onChange={(e) => updateFormData('section6_ohs', 'genderGrievanceRemarks', e.target.value)}
                      disabled={isReadOnly}
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 8: Future Plans */}
        <TabsContent value="section8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {heading("section8")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="expectedChange">{tx("Expected Increase/Decrease (%) (if any)")}</Label>
                <Input
                  id="expectedChange"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.section8.expectedChangePercentage}
                  onChange={(e) => updatePercentageField('section8', 'expectedChangePercentage', e.target.value)}
                  disabled={isReadOnly}
                />
              </div>
              {template === 'abstraction' && (
                <div className="space-y-2">
                  <Label htmlFor="infrastructure">{tx("Planned Infrastructure Upgrades (if any)")}</Label>
                  <Textarea
                    id="infrastructure"
                    value={formData.section8.plannedInfrastructureUpgrades}
                    onChange={(e) => updateFormData('section8', 'plannedInfrastructureUpgrades', e.target.value)}
                    disabled={isReadOnly}
                    placeholder={tx("Describe planned upgrades...")}
                    rows={3}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="envImprove">{tx("Environmental Improvement Measures (if any)")}</Label>
                <Textarea
                  id="envImprove"
                  value={formData.section8.environmentalImprovements}
                  onChange={(e) => updateFormData('section8', 'environmentalImprovements', e.target.value)}
                  disabled={isReadOnly}
                  placeholder={tx("Describe environmental improvements...")}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="genderActions">{tx("Planned Actions to Enhance Gender Inclusion (if any)")}</Label>
                <Textarea
                  id="genderActions"
                  value={formData.section8.genderInclusionActions}
                  onChange={(e) => updateFormData('section8', 'genderInclusionActions', e.target.value)}
                  disabled={isReadOnly}
                  placeholder={tx("Describe gender inclusion plans...")}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTION 9: Declaration */}
        <TabsContent value="section9">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSignature className="h-5 w-5" />
                {heading("section9")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  {tx("I hereby certify that the information provided in this report is true, accurate, complete, and complies with the conditions of the Water Use Permit.")}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="declarantName">{tx("Full Name")} *</Label>
                  <Input
                    id="declarantName"
                    value={formData.section9_declaration.declarantName}
                    onChange={(e) => updateFormData('section9_declaration', 'declarantName', e.target.value)}
                    disabled={isReadOnly}
                    placeholder={tx("Enter your full name")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="declarationDate">{tx("Date")} *</Label>
                  <Input
                    id="declarationDate"
                    type="date"
                    value={formData.section9_declaration.declarationDate}
                    onChange={(e) => updateFormData('section9_declaration', 'declarationDate', e.target.value)}
                    disabled={isReadOnly}
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 p-4 border rounded-lg">
                <Checkbox
                  id="agreed"
                  checked={formData.section9_declaration.agreed}
                  onCheckedChange={(checked) => updateFormData('section9_declaration', 'agreed', checked)}
                  disabled={isReadOnly}
                />
                <Label htmlFor="agreed" className="text-sm">
                  {tx("I confirm that all information provided is accurate and I agree to the declaration above.")}
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!isReadOnly && (
        <div className="flex justify-between items-center pt-4 border-t mt-6">
          <Button
            variant="outline"
            onClick={handlePreviousSection}
            disabled={activeTab === tabOrder[0]}
          >
            {tx("Previous Section")}
          </Button>
          {activeTab !== tabOrder[tabOrder.length - 1] && (
            <Button onClick={handleNextSection}>
              {tx("Next Section")}
            </Button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {!isReadOnly && (
        <div className="space-y-3 pt-6 border-t">
          {validationError && (
            <Alert variant="destructive">
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}
          {draftSavedMessage && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {draftSavedMessage}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={isLoading || isSavingDraft}
          >
            {isSavingDraft ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {isSavingDraft ? tx('Saving...') : tx('Save as Draft')}
          </Button>
          <Button
            onClick={handleSubmitForm}
            disabled={isLoading || isSavingDraft || !formData.section9_declaration.agreed || !formData.section9_declaration.declarantName}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            {tx("Submit Report")}
          </Button>
          </div>
        </div>
      )}

        {/* Read-only message */}
        {isReadOnly && (
          <div className="flex items-center justify-center p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Info className="h-5 w-5 text-amber-600 mr-2" />
            <span className="text-amber-800">{tx("This report has been submitted and cannot be edited.")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
