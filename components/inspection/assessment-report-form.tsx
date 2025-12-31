"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FileText, Droplet, MapPin, Factory, AlertCircle, Plus, X, ExternalLink, ThumbsUp, ThumbsDown, CheckCircle, XCircle } from "lucide-react";
import type { AssessmentReportData } from "@/lib/assessment-report-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AssessmentReportFormProps {
  reportData: Partial<AssessmentReportData>;
  onReportDataChange: (data: Partial<AssessmentReportData>) => void;
  reportType: 'abstraction' | 'concession';
  readOnly?: boolean;
  applicationActivities?: string[] | null;
  inspectionDate?: string;
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
  recommendation,
  onRecommendationChange
}: AssessmentReportFormProps) {
  const [localData, setLocalData] = useState<Partial<AssessmentReportData>>(reportData);

  useEffect(() => {
    setLocalData(reportData);
  }, [reportData]);

  useEffect(() => {
    if (inspectionDate && !localData.reportDate) {
      const updated = { ...localData, reportDate: inspectionDate };
      setLocalData(updated);
      onReportDataChange(updated);
    }
  }, [inspectionDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateField = <K extends keyof AssessmentReportData>(field: K, value: AssessmentReportData[K]) => {
    const updated = { ...localData, [field]: value };
    setLocalData(updated);
    onReportDataChange(updated);
  };

  const updateBeacon = (index: number, field: 'latitude' | 'longitude', value: string) => {
    const beacons = [...(localData.beacons || [])];
    if (!beacons[index]) {
      beacons[index] = { id: `B${index + 1}`, latitude: '', longitude: '' };
    }
    beacons[index][field] = value;
    updateField('beacons', beacons);
  };

  const addBeacon = () => {
    const beacons = localData.beacons || [];
    const newId = `B${beacons.length + 1}`;
    updateField('beacons', [...beacons, { id: newId, latitude: '', longitude: '' }]);
  };

  const removeBeacon = (index: number) => {
    const beacons = localData.beacons || [];
    updateField('beacons', beacons.filter((_, i) => i !== index));
  };

  const readOnlyClass = readOnly ? "bg-muted/50 cursor-not-allowed" : "";
  const prefilledClass = `bg-muted/50${readOnly ? " cursor-not-allowed" : ""}`;

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

      {/* Section 2: Required Documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            2. Required Documents
          </CardTitle>
          <CardDescription>
            List of provided documents (prefilled from application)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.isArray(localData.requiredDocuments) && localData.requiredDocuments.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  List the provided documents as required (attached as annex)
                </p>
                <div className="space-y-2">
                  {localData.requiredDocuments.map((d, idx) => {
                    // Backward compatibility: if old saved data exists
                    if (typeof (d as any) === "string") {
                      return (
                        <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                          <div className="text-sm">{String(d)}</div>
                        </div>
                      );
                    }

                    const doc = d as any;
                    const label = String(doc.label || doc.name || "");
                    const provided = Boolean(doc.provided);
                    const url = typeof doc.url === "string" ? doc.url : undefined;
                    const fileName = typeof doc.name === "string" ? doc.name : undefined;

                    const setProvided = (nextProvided: boolean) => {
                      const current = Array.isArray(localData.requiredDocuments) ? [...localData.requiredDocuments] : [];
                      const next = current.map((x: any) => {
                        if (!x || typeof x !== "object") return x;
                        if (x.key === doc.key) return { ...x, provided: nextProvided };
                        return x;
                      });
                      updateField("requiredDocuments" as any, next as any);
                    };

                    return (
                      <div key={doc.key || idx} className="flex items-start justify-between gap-3 p-3 bg-muted/50 rounded-lg border">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{idx + 1}. {label}</div>
                          {provided && fileName && (
                            <div className="text-xs text-muted-foreground">
                              Uploaded:{" "}
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  {fileName}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                fileName
                              )}
                            </div>
                          )}
                        </div>
                        {readOnly ? (
                          <Badge variant={provided ? "default" : "outline"} className={provided ? "bg-green-600 text-white" : ""}>
                            {provided ? "Provided" : "Missing"}
                          </Badge>
                        ) : (
                          <div className="w-[160px]">
                            <Select
                              value={provided ? "provided" : "missing"}
                              onValueChange={(v) => setProvided(v === "provided")}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="provided">Provided</SelectItem>
                                <SelectItem value="missing">Missing</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No required document checklist available</p>
            )}

            {Array.isArray((localData as any).annexDocuments) && (localData as any).annexDocuments.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Annex (All uploaded documents)</Label>
                <div className="space-y-2">
                  {(localData as any).annexDocuments.map((ad: any, i: number) => (
                    <div key={`${ad?.name || "doc"}-${i}`} className="flex items-center justify-between p-3 bg-background rounded-lg border">
                      <div className="text-sm">{ad?.name}</div>
                      {ad?.url ? (
                        <a
                          href={ad.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                        >
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">No URL</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Water Source */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Droplet className="h-5 w-5" />
            3. Water Source
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
                  onChange={(e) => updateField('sourceFlowLps' as any, e.target.value as any)}
                  placeholder="L/sec"
                  disabled={readOnly}
                  className={readOnlyClass}
                />
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Equivalent to m³/day</Label>
                <Input
                  value={(localData as any).sourceFlowM3Day || ''}
                  onChange={(e) => updateField('sourceFlowM3Day' as any, e.target.value as any)}
                  placeholder="m³/day"
                  disabled={readOnly}
                  className={readOnlyClass}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Activity-Specific Fields */}
      {reportType === 'abstraction' ? (
        <>
          {/* Amount of water to be abstracted */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Droplet className="h-5 w-5" />
                4. Amount of water to be abstracted
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Quantity (l/s, m³/s, m³/day, etc)</Label>
                  <Input
                    value={localData.flowRateM3Day || ''}
                    onChange={(e) => updateField('flowRateM3Day', e.target.value)}
                    placeholder="m³/day"
                    disabled={readOnly}
                    className={readOnlyClass}
                  />
                </div>
                <div>
                  <Label>Flow rate (L/sec)</Label>
                  <Input
                    value={localData.flowRateLps || ''}
                    onChange={(e) => updateField('flowRateLps', e.target.value)}
                    placeholder="L/sec"
                    disabled={readOnly}
                    className={readOnlyClass}
                  />
                </div>
                <div>
                  <Label>Intended abstraction method</Label>
                  <Input
                    value={localData.abstractionMethod || ''}
                    onChange={(e) => updateField('abstractionMethod', e.target.value)}
                    placeholder="e.g., Pump, Gravity, etc."
                    disabled={readOnly}
                    className={readOnlyClass}
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
                5. Water balance assessment <span className="text-destructive">*</span>
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
                4. Surface area to be covered
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Surface Area (Ha) (attach field pictures)</Label>
                <Input
                  value={localData.surfaceAreaHa || ''}
                  onChange={(e) => updateField('surfaceAreaHa', e.target.value)}
                  placeholder="Hectares (Ha)"
                  disabled={readOnly}
                  className={readOnlyClass}
                />
              </div>
              <div>
                <Label>Concession boundaries (attach concession area map)</Label>
                <div className="space-y-3 mt-2">
                  {(localData.beacons || []).map((beacon, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-1">
                        <Label className="text-sm">{beacon.id}</Label>
                      </div>
                      <div className="col-span-5">
                        <Input
                          value={beacon.latitude}
                          onChange={(e) => updateBeacon(index, 'latitude', e.target.value)}
                          placeholder="Latitude"
                          disabled={readOnly}
                          className={readOnlyClass}
                        />
                      </div>
                      <div className="col-span-5">
                        <Input
                          value={beacon.longitude}
                          onChange={(e) => updateBeacon(index, 'longitude', e.target.value)}
                          placeholder="Longitude"
                          disabled={readOnly}
                          className={readOnlyClass}
                        />
                      </div>
                      {!readOnly && (
                        <div className="col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeBeacon(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addBeacon}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Beacon
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Other people's rights */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertCircle className="h-5 w-5" />
                5. Other people's rights <span className="text-destructive">*</span>
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

      {/* Section 6: Planned wastewater management system */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Factory className="h-5 w-5" />
            {reportType === 'abstraction' ? '6' : '6'}. Planned wastewater management system <span className="text-destructive">*</span>
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

      {/* Section 7: Field report Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            {reportType === 'abstraction' ? '7' : '7'}. Field report Summary <span className="text-destructive">*</span>
          </CardTitle>
          <CardDescription>
            Provide a brief summary of the field visit findings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Provide a general conclusion and recommendations</Label>
            <Textarea
              value={localData.conclusion || ''}
              onChange={(e) => updateField('conclusion', e.target.value)}
              placeholder="Provide general conclusion and recommendations..."
              rows={6}
              disabled={readOnly}
              className={readOnlyClass}
              required
            />
          </div>
          <div className="text-sm text-muted-foreground mt-4">
            Done at Kigali, on {localData.reportDate || new Date().toLocaleDateString()}
          </div>
        </CardContent>
      </Card>

      {/* Section 8: Assessor Recommendation */}
      {recommendation !== undefined && onRecommendationChange && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ThumbsUp className="h-5 w-5" />
              8. Assessor Recommendation <span className="text-destructive">*</span>
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

