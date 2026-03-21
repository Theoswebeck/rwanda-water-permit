"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FileText, Droplet, MapPin, Factory, AlertCircle, ThumbsUp, ThumbsDown, CheckCircle, XCircle } from "lucide-react";
import type { AssessmentReportData } from "@/lib/assessment-report-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AssessmentReportFormProps {
  reportData: Partial<AssessmentReportData>;
  onReportDataChange: (data: Partial<AssessmentReportData>) => void;
  reportType: 'abstraction' | 'concession';
  readOnly?: boolean;
  applicationActivities?: string[] | null;
  inspectionDate?: string;
  assessmentSubmittedDate?: string;
  // Recommendation props
  recommendation?: { recommendation: "yes" | "no" | null; explanationText: string };
  onRecommendationChange?: (recommendation: { recommendation: "yes" | "no" | null; explanationText: string }) => void;
}

export function AssessmentReportForm({
  reportData,
  onReportDataChange,
  reportType,
  readOnly = false,
  applicationActivities,
  inspectionDate,
  assessmentSubmittedDate,
  recommendation,
  onRecommendationChange
}: AssessmentReportFormProps) {
  const [localData, setLocalData] = useState<Partial<AssessmentReportData>>(reportData);

  useEffect(() => {
    setLocalData(reportData);
  }, [reportData]);

  useEffect(() => {
    const targetDate = assessmentSubmittedDate || inspectionDate;
    if (!targetDate) return;
    setLocalData((prev) => {
      if (prev.reportDate === targetDate) return prev;
      const updated = { ...prev, reportDate: targetDate };
      onReportDataChange(updated);
      return updated;
    });
  }, [assessmentSubmittedDate, inspectionDate, onReportDataChange]);

  const updateField = <K extends keyof AssessmentReportData>(field: K, value: AssessmentReportData[K]) => {
    setLocalData((prev) => {
      const updated = { ...prev, [field]: value };
      onReportDataChange(updated);
      return updated;
    });
  };

  const toDerivedM3Day = (lpsRaw: string): string => {
    const parsed = Number(lpsRaw);
    if (!Number.isFinite(parsed)) return "";
    // 1 L/s = 86.4 m3/day
    return (parsed * 86.4).toFixed(2);
  };
  const sourceFlowLpsValue = ((localData as any).sourceFlowLps as string | undefined) || "";
  const sourceFlowM3DayValue = ((localData as any).sourceFlowM3Day as string | undefined) || "";

  useEffect(() => {
    if (!sourceFlowLpsValue || sourceFlowM3DayValue) return;
    updateField("sourceFlowM3Day" as any, toDerivedM3Day(sourceFlowLpsValue) as any);
  }, [sourceFlowLpsValue, sourceFlowM3DayValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const readOnlyClass = readOnly ? "bg-muted/50 cursor-not-allowed" : "";
  const prefilledClass = `bg-muted/50${readOnly ? " cursor-not-allowed" : ""}`;
  const isSurfaceSectionReadOnly = true;

  return (
    <div className="space-y-6">
      {/* Section 1: Permit Applicant Identification */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            1. Permit Applicant Identification
          </CardTitle>
          <CardDescription>
            Applicant information (prefilled from application)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Name</Label>
              <Input
                value={localData.applicantName || ''}
                readOnly
                className={prefilledClass}
              />
            </div>
            <div>
              <Label>ID/ TIN</Label>
              <Input
                value={localData.applicantIdTin || ''}
                readOnly
                className={prefilledClass}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Residence</Label>
              <Input
                value={localData.residence || ''}
                readOnly
                className={prefilledClass}
              />
            </div>
            <div>
              <Label>Type of activity</Label>
              <Input
                value={localData.typeOfActivity || ''}
                readOnly
                className={prefilledClass}
              />
            </div>
            <div>
              <Label>Representative</Label>
              <Input
                value={localData.representative || ''}
                readOnly
                className={prefilledClass}
              />
            </div>
            <div>
              <Label>Contact (Tel. & Email)</Label>
              <div className="space-y-2">
                <Input
                  value={localData.contactTel || ''}
                  readOnly
                  className={prefilledClass}
                  placeholder="Tel:"
                />
                <Input
                  value={localData.contactEmail || ''}
                  readOnly
                  className={prefilledClass}
                  placeholder="e-mail:"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Water Source */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Droplet className="h-5 w-5" />
            2. Water Source
          </CardTitle>
          <CardDescription>
            Water source information (prefilled from application)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>{reportType === 'concession' ? 'Name of the lake' : 'Name of the source'}</Label>
              <Input
                value={localData.sourceName || ''}
                readOnly
                className={prefilledClass}
              />
            </div>

            {reportType === 'concession' && localData.sourcePolygonPoints && localData.sourcePolygonPoints.length > 0 ? (
              <div className="md:col-span-2">
                <Label>Concession polygon coordinates</Label>
                <div className="space-y-3 mt-2">
                  {localData.sourcePolygonPoints.map((point, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2">
                        <Label className="text-sm font-medium">Point {index + 1}</Label>
                      </div>
                      <div className="col-span-5">
                        <Label className="text-xs text-muted-foreground">Latitude</Label>
                        <Input
                          value={point.latitude}
                          readOnly
                          className={prefilledClass}
                        />
                      </div>
                      <div className="col-span-5">
                        <Label className="text-xs text-muted-foreground">Longitude</Label>
                        <Input
                          value={point.longitude}
                          readOnly
                          className={prefilledClass}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div>
                  <Label>Latitude</Label>
                  <Input
                    value={localData.sourceLatitude || ''}
                    readOnly
                    className={prefilledClass}
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    value={localData.sourceLongitude || ''}
                    readOnly
                    className={prefilledClass}
                  />
                </div>
              </>
            )}

            <div className="md:col-span-2">
              <Label>Location: Coordinates, village, cell, sector, district, level one and level two catchments</Label>
              <Input
                value={localData.sourceLocation || ''}
                readOnly
                className={prefilledClass}
              />
              {localData.catchmentLevel1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Level 1 Catchment: {localData.catchmentLevel1}
                </p>
              )}
              {localData.catchmentLevel2 && (
                <p className="text-xs text-muted-foreground">
                  Level 2 Catchment: {localData.catchmentLevel2}
                </p>
              )}
            </div>
          </div>

          {/* Abstraction template includes flow of the water source */}
          {reportType === "abstraction" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="md:col-span-2">
                <Label>Flow of the water source (attach field pictures)</Label>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">L/sec</Label>
                <Input
                  value={(localData as any).sourceFlowLps || ''}
                  onChange={(e) => {
                    const sourceFlowLps = e.target.value;
                    setLocalData((prev) => {
                      const updated = {
                        ...prev,
                        sourceFlowLps,
                        sourceFlowM3Day: toDerivedM3Day(sourceFlowLps),
                      };
                      onReportDataChange(updated);
                      return updated;
                    });
                  }}
                  placeholder="L/sec"
                  disabled={readOnly}
                  className={readOnlyClass}
                />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Equivalent to m³/day</Label>
                <Input
                  value={(localData as any).sourceFlowM3Day || ''}
                  placeholder="m³/day"
                  readOnly
                  disabled
                  className={readOnlyClass}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Activity-Specific Fields */}
      {reportType === 'abstraction' ? (
        <>
          {/* Amount of water to be abstracted */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Droplet className="h-5 w-5" />
                3. Amount of water to be abstracted
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Quantity (m³/year)</Label>
                  <Input
                    value={localData.flowRateM3Day || ''}
                    placeholder="m³/year"
                    readOnly
                    disabled
                    className={prefilledClass}
                  />
                </div>
                <div>
                  <Label>Flow rate (m³/s)</Label>
                  <Input
                    value={localData.flowRateLps || ''}
                    placeholder="m³/s"
                    readOnly
                    disabled
                    className={prefilledClass}
                  />
                </div>
                <div>
                  <Label>Intended abstraction method</Label>
                  <Input
                    value={localData.abstractionMethod || ''}
                    readOnly
                    disabled
                    className={prefilledClass}
                  />
                </div>
                <div>
                  <Label>Return flow</Label>
                  <RadioGroup
                    value={localData.returnFlow || ''}
                    onValueChange={(value) => updateField('returnFlow', value as 'yes' | 'no')}
                    disabled={readOnly}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="return-yes" />
                      <Label htmlFor="return-yes" className="cursor-pointer">Yes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="return-no" />
                      <Label htmlFor="return-no" className="cursor-pointer">No</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Water balance assessment */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Droplet className="h-5 w-5" />
                4. Water balance assessment <span className="text-destructive">*</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Description of the water balance</Label>
                <Textarea
                  value={(localData as any).waterBalanceDescription || ''}
                  onChange={(e) => updateField('waterBalanceDescription' as any, e.target.value as any)}
                  placeholder="Describe the water balance..."
                  rows={3}
                  disabled={readOnly}
                  className={readOnlyClass}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div>
                    <Label className="text-sm text-muted-foreground">Available water (Q)</Label>
                    <Input
                      type="number"
                      value={localData.availableWaterQ || ''}
                      onChange={(e) => updateField('availableWaterQ', e.target.value)}
                      placeholder="L/sec equivalent to m³/day"
                      disabled={readOnly}
                      className={readOnlyClass}
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Water demand (D)</Label>
                    <Input
                      type="number"
                      value={localData.waterDemandD || ''}
                      onChange={(e) => updateField('waterDemandD', e.target.value)}
                      placeholder="m³/day"
                      disabled={readOnly}
                      className={readOnlyClass}
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Existing demand (ED)</Label>
                    <Input
                      type="number"
                      value={localData.existingDemandED || ''}
                      onChange={(e) => updateField('existingDemandED', e.target.value)}
                      placeholder="m³/day"
                      disabled={readOnly}
                      className={readOnlyClass}
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Remaining Water (Q-D-ED)</Label>
                    <Input
                      type="number"
                      value={localData.remainingWater || ''}
                      onChange={(e) => updateField('remainingWater', e.target.value)}
                      placeholder="m³/day"
                      disabled={readOnly}
                      className={readOnlyClass}
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Water Storage</Label>
                    <Input
                      type="number"
                      value={localData.waterStorage || ''}
                      onChange={(e) => updateField('waterStorage', e.target.value)}
                      placeholder="m³"
                      disabled={readOnly}
                      className={readOnlyClass}
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label>Description of any potential water use conflict in the area</Label>
                <Textarea
                  value={localData.waterUseConflict || ''}
                  onChange={(e) => updateField('waterUseConflict', e.target.value)}
                  placeholder="Describe any potential conflicts..."
                  rows={4}
                  disabled={readOnly}
                  className={readOnlyClass}
                />
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Surface area to be covered */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5" />
                3. Surface area to be covered
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Surface Area ({localData.surfaceAreaUnit || 'Ha'}) (attach field pictures)</Label>
                <Input
                  value={localData.surfaceAreaHa || ''}
                  onChange={(e) => updateField('surfaceAreaHa', e.target.value)}
                  placeholder={localData.surfaceAreaUnit || 'Ha'}
                  readOnly={isSurfaceSectionReadOnly}
                  disabled={isSurfaceSectionReadOnly}
                  className={prefilledClass}
                />
              </div>
            </CardContent>
          </Card>

          {/* Other people's rights */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertCircle className="h-5 w-5" />
                4. Other people's rights <span className="text-destructive">*</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Existing water uses in the lake areas</Label>
                <Textarea
                  value={localData.existingWaterUses || ''}
                  onChange={(e) => updateField('existingWaterUses', e.target.value)}
                  placeholder="Describe existing water uses..."
                  rows={4}
                  disabled={readOnly}
                  className={readOnlyClass}
                />
              </div>
              <div>
                <Label>Description of any potential water use conflict in the area</Label>
                <Textarea
                  value={localData.waterUseConflict || ''}
                  onChange={(e) => updateField('waterUseConflict', e.target.value)}
                  placeholder="Describe any potential conflicts..."
                  rows={4}
                  disabled={readOnly}
                  className={readOnlyClass}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Section 5: Planned wastewater management system */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Factory className="h-5 w-5" />
            5. Planned wastewater management system <span className="text-destructive">*</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Type of the system and description</Label>
            <Textarea
              value={localData.wastewaterSystemDescription || ''}
              onChange={(e) => updateField('wastewaterSystemDescription', e.target.value)}
              placeholder="Describe the wastewater management system..."
              rows={4}
              disabled={readOnly}
              className={readOnlyClass}
            />
          </div>
          <div>
            <Label>Describe potential pollution to be caused by the activity and the level of impact</Label>
            <Textarea
              value={localData.pollutionDescription || ''}
              onChange={(e) => updateField('pollutionDescription', e.target.value)}
              placeholder="Describe potential pollution and impact level..."
              rows={4}
              disabled={readOnly}
              className={readOnlyClass}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 6: Assessment Report Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            6. Assessment Report Completion
          </CardTitle>
          <CardDescription>
            Report completion details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Assessment report completion note</Label>
            <Input
              value={localData.conclusion || ''}
              onChange={(e) => updateField('conclusion', e.target.value)}
              placeholder="Enter completion note"
              disabled={readOnly}
              className={readOnlyClass}
            />
          </div>
          <div className="text-sm text-muted-foreground mt-4">
            Done at Kigali, on {localData.reportDate || new Date().toLocaleDateString()}
          </div>
        </CardContent>
      </Card>

      {/* Section 7: Assessor Recommendation */}
      {recommendation !== undefined && onRecommendationChange && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ThumbsUp className="h-5 w-5" />
              7. Assessor Recommendation <span className="text-destructive">*</span>
            </CardTitle>
            <CardDescription>
              Based on your field assessment, provide your recommendation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Recommendation Radio Group */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Your Recommendation *</Label>
              <RadioGroup
                value={recommendation.recommendation || ""}
                onValueChange={(value) => {
                  onRecommendationChange({
                    ...recommendation,
                    recommendation: value as "yes" | "no",
                    explanationText: value === "yes" ? "" : recommendation.explanationText
                  });
                }}
                disabled={readOnly}
                className="space-y-3"
              >
                <div
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    recommendation.recommendation === "yes"
                      ? 'border-green-500 bg-green-50'
                      : 'border-muted hover:border-green-300'
                  }`}
                >
                  <RadioGroupItem 
                    value="yes" 
                    id="recommend-yes"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor="recommend-yes"
                      className={`font-medium cursor-pointer flex items-center gap-2 ${
                        recommendation.recommendation === "yes" ? 'text-green-900' : ''
                      }`}
                    >
                      <ThumbsUp className={`h-5 w-5 ${
                        recommendation.recommendation === "yes" ? 'text-green-600' : 'text-muted-foreground'
                      }`} />
                      Yes - Recommend for Approval
                    </Label>
                  </div>
                </div>

                <div
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    recommendation.recommendation === "no"
                      ? 'border-red-500 bg-red-50'
                      : 'border-muted hover:border-red-300'
                  }`}
                >
                  <RadioGroupItem value="no" id="recommend-no" />
                  <div className="flex-1">
                    <Label
                      htmlFor="recommend-no"
                      className={`font-medium cursor-pointer flex items-center gap-2 ${
                        recommendation.recommendation === "no" ? 'text-red-900' : ''
                      }`}
                    >
                      <ThumbsDown className={`h-5 w-5 ${
                        recommendation.recommendation === "no" ? 'text-red-600' : 'text-muted-foreground'
                      }`} />
                      No - Do Not Recommend for Approval
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Explanation Text (required if "No") */}
            {recommendation.recommendation === "no" && (
              <div className="space-y-2">
                <Label htmlFor="explanation" className="text-base font-medium">
                  Explanation for Recommendation *
                </Label>
                <Textarea
                  id="explanation"
                  value={recommendation.explanationText}
                  onChange={(e) => onRecommendationChange({
                    ...recommendation,
                    explanationText: e.target.value
                  })}
                  placeholder="Please explain the reasons for not recommending approval. Include specific concerns or observations for the approver to consider..."
                  rows={5}
                  disabled={readOnly}
                  required
                  className={readOnlyClass}
                />
                <p className="text-xs text-muted-foreground">
                  This explanation is provided for the approver's consideration.
                </p>
              </div>
            )}

            {/* Summary Banner */}
            {recommendation.recommendation && (
              <div className={`p-4 rounded-lg ${
                recommendation.recommendation === "yes"
                  ? 'bg-green-100 border border-green-300'
                  : 'bg-red-100 border border-red-300'
              }`}>
                <div className="flex items-center gap-2">
                  {recommendation.recommendation === "yes" ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-700" />
                      <span className="font-medium text-green-900">
                        {readOnly 
                          ? "This application is recommended for approval"
                          : "You are recommending this application for approval"}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-red-700" />
                      <span className="font-medium text-red-900">
                        {readOnly 
                          ? "This application is not recommended for approval"
                          : "You are not recommending this application for approval"}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      )}
    </div>
  );
}

