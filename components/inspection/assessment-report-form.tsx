"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Droplet, MapPin, Factory, AlertCircle, ThumbsUp, ThumbsDown, CheckCircle, XCircle, Loader2, Save } from "lucide-react";
import type { AssessmentReportData } from "@/lib/assessment-report-utils";
import { BulkNetworksTable } from "@/components/dashboard/bulk-networks-table";
import type { BulkNetworkRow } from "@/types/database";
import {
  getFormattedCellOptions,
  getFormattedDistrictOptions,
  getFormattedProvinceOptions,
  getFormattedSectorOptions,
  getFormattedVillageOptions,
} from "@/lib/rwanda-administrative-data";

const VOLUME_RATE_UNITS = ["m3/day", "m3/year"] as const;

type VolumeRateUnit = (typeof VOLUME_RATE_UNITS)[number];
type VolumeRateUnitField =
  | "sourceFlowUnit"
  | "flowRateUnit"
  | "flowRateM3DayUnit"
  | "availableWaterQUnit"
  | "waterDemandDUnit"
  | "existingDemandEDUnit"
  | "remainingWaterUnit";
type StringReportField =
  | "sourceFlowValue"
  | "flowRateLps"
  | "flowRateM3Day"
  | "availableWaterQ"
  | "waterDemandD"
  | "existingDemandED"
  | "remainingWater";

function parseResidenceParts(residence?: string) {
  const parts = String(residence || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    province: parts.at(-1) || "",
    district: parts.at(-2) || "",
    sector: parts.at(-3) || "",
    cell: parts.at(-4) || "",
    village: parts.length > 4 ? parts.slice(0, -4).join(", ") : "",
  };
}

function buildResidence(parts: {
  province: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
}) {
  return [parts.village, parts.cell, parts.sector, parts.district, parts.province]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

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
  onSourceCoordinatesSave?: (coords: { latitude: string; longitude: string }) => Promise<void>;
  onSourcePolygonSave?: (points: Array<{ latitude: string; longitude: string }>) => Promise<void>;
  coordinatesSaving?: boolean;
  // Bulk water supply props
  isBulkApplication?: boolean;
  bulkNetworks?: BulkNetworkRow[];
  onBulkNetworksSave?: (networks: BulkNetworkRow[]) => Promise<void>;
  bulkNetworksSaving?: boolean;
}

export function AssessmentReportForm({
  reportData,
  onReportDataChange,
  reportType,
  readOnly = false,
  inspectionDate,
  assessmentSubmittedDate,
  recommendation,
  onRecommendationChange,
  onSourceCoordinatesSave,
  onSourcePolygonSave,
  coordinatesSaving = false,
  isBulkApplication = false,
  bulkNetworks,
  onBulkNetworksSave,
  bulkNetworksSaving = false,
}: AssessmentReportFormProps) {
  const [localData, setLocalData] = useState<Partial<AssessmentReportData>>(reportData);
  const [localBulkNetworks, setLocalBulkNetworks] = useState<BulkNetworkRow[]>(bulkNetworks ?? []);
  const [residenceProvince, setResidenceProvince] = useState("");
  const [residenceDistrict, setResidenceDistrict] = useState("");
  const [residenceSector, setResidenceSector] = useState("");
  const [residenceCell, setResidenceCell] = useState("");
  const [residenceVillage, setResidenceVillage] = useState("");

  useEffect(() => {
    setLocalData(reportData);
  }, [reportData]);

  useEffect(() => {
    setLocalBulkNetworks(bulkNetworks ?? []);
  }, [bulkNetworks]);

  useEffect(() => {
    const parsed = parseResidenceParts(reportData.residence);
    setResidenceProvince(parsed.province);
    setResidenceDistrict(parsed.district);
    setResidenceSector(parsed.sector);
    setResidenceCell(parsed.cell);
    setResidenceVillage(parsed.village);
  }, [reportData.residence]);

  useEffect(() => {
    const targetDate = assessmentSubmittedDate || inspectionDate;
    if (!targetDate) return;
    setLocalData((prev) => {
      if (prev.reportDate) return prev;
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

  const updateResidence = (parts: {
    province: string;
    district: string;
    sector: string;
    cell: string;
    village: string;
  }) => {
    setResidenceProvince(parts.province);
    setResidenceDistrict(parts.district);
    setResidenceSector(parts.sector);
    setResidenceCell(parts.cell);
    setResidenceVillage(parts.village);
    updateField("residence", buildResidence(parts));
  };

  const updateVolumeRateField = (
    valueField: StringReportField,
    value: string,
    unitField: VolumeRateUnitField,
    unit: VolumeRateUnit,
  ) => {
    setLocalData((prev) => {
      const updated: Partial<AssessmentReportData> = {
        ...prev,
        [valueField]: value,
        [unitField]: unit,
      };
      if (valueField === "sourceFlowValue" && unit === "m3/day") {
        updated.sourceFlowM3Day = value;
      }
      onReportDataChange(updated);
      return updated;
    });
  };

  const renderVolumeRateField = (
    label: string,
    valueField: StringReportField,
    unitField: VolumeRateUnitField,
    placeholder = "Enter value",
    defaultUnit: VolumeRateUnit = "m3/day",
    fallbackValueField?: StringReportField,
  ) => {
    const unit = localData[unitField] && VOLUME_RATE_UNITS.includes(localData[unitField])
      ? localData[unitField]
      : defaultUnit;
    const value = String(localData[valueField] ?? (fallbackValueField ? localData[fallbackValueField] : "") ?? "");

    return (
      <div>
        <Label className="text-sm text-muted-foreground">{label}</Label>
        <div className="grid grid-cols-3 gap-2">
          <Input
            type="number"
            value={value}
            onChange={(e) => updateVolumeRateField(valueField, e.target.value, unitField, unit)}
            placeholder={placeholder}
            disabled={readOnly}
            className={`col-span-2 ${readOnlyClass}`}
          />
          <Select
            value={unit}
            onValueChange={(nextUnit) => updateVolumeRateField(valueField, value, unitField, nextUnit as VolumeRateUnit)}
            disabled={readOnly}
          >
            <SelectTrigger className={readOnlyClass}>
              <SelectValue placeholder="Unit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="m3/day">m3/day</SelectItem>
              <SelectItem value="m3/year">m3/year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  const readOnlyClass = readOnly ? "bg-muted/50 cursor-not-allowed" : "";
  const prefilledClass = `bg-muted/50${readOnly ? " cursor-not-allowed" : ""}`;
  const coordinateInputClass = readOnly ? prefilledClass : "bg-white";
  const isSurfaceSectionReadOnly = readOnly;
  const coordinateSaveDisabled =
    readOnly ||
    coordinatesSaving ||
    !String(localData.sourceLatitude || "").trim() ||
    !String(localData.sourceLongitude || "").trim();

  const updatePolygonPoint = (
    index: number,
    field: "latitude" | "longitude",
    value: string,
  ) => {
    const next = [...(localData.sourcePolygonPoints || [])];
    next[index] = { ...next[index], [field]: value };
    const beacons = next.map((point, idx) => ({
      id: `B${idx + 1}`,
      latitude: point.latitude,
      longitude: point.longitude,
    }));
    setLocalData((prev) => {
      const updated = { ...prev, sourcePolygonPoints: next, beacons };
      onReportDataChange(updated);
      return updated;
    });
  };

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
                onChange={(e) => updateField('applicantName', e.target.value)}
                readOnly={readOnly}
                className={readOnly ? prefilledClass : "bg-white"}
              />
            </div>
            <div>
              <Label>ID/ TIN</Label>
              <Input
                value={localData.applicantIdTin || ''}
                onChange={(e) => updateField('applicantIdTin', e.target.value)}
                readOnly={readOnly}
                className={readOnly ? prefilledClass : "bg-white"}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Residence</Label>
              {readOnly ? (
                <Input value={localData.residence || ''} readOnly className={prefilledClass} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <Select
                    value={residenceProvince}
                    onValueChange={(province) => updateResidence({
                      province,
                      district: "",
                      sector: "",
                      cell: "",
                      village: "",
                    })}
                  >
                    <SelectTrigger><SelectValue placeholder="Province" /></SelectTrigger>
                    <SelectContent>
                      {getFormattedProvinceOptions().map((province) => (
                        <SelectItem key={province.value} value={province.value}>{province.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={residenceDistrict}
                    onValueChange={(district) => updateResidence({
                      province: residenceProvince,
                      district,
                      sector: "",
                      cell: "",
                      village: "",
                    })}
                    disabled={!residenceProvince}
                  >
                    <SelectTrigger><SelectValue placeholder="District" /></SelectTrigger>
                    <SelectContent>
                      {getFormattedDistrictOptions(residenceProvince).map((district) => (
                        <SelectItem key={district.value} value={district.value}>{district.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={residenceSector}
                    onValueChange={(sector) => updateResidence({
                      province: residenceProvince,
                      district: residenceDistrict,
                      sector,
                      cell: "",
                      village: "",
                    })}
                    disabled={!residenceProvince || !residenceDistrict}
                  >
                    <SelectTrigger><SelectValue placeholder="Sector" /></SelectTrigger>
                    <SelectContent>
                      {getFormattedSectorOptions(residenceProvince, residenceDistrict).map((sector) => (
                        <SelectItem key={sector.value} value={sector.value}>{sector.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={residenceCell}
                    onValueChange={(cell) => updateResidence({
                      province: residenceProvince,
                      district: residenceDistrict,
                      sector: residenceSector,
                      cell,
                      village: "",
                    })}
                    disabled={!residenceProvince || !residenceDistrict || !residenceSector}
                  >
                    <SelectTrigger><SelectValue placeholder="Cell" /></SelectTrigger>
                    <SelectContent>
                      {getFormattedCellOptions(residenceProvince, residenceDistrict, residenceSector).map((cell) => (
                        <SelectItem key={cell.value} value={cell.value}>{cell.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={residenceVillage}
                    onValueChange={(village) => updateResidence({
                      province: residenceProvince,
                      district: residenceDistrict,
                      sector: residenceSector,
                      cell: residenceCell,
                      village,
                    })}
                    disabled={!residenceProvince || !residenceDistrict || !residenceSector || !residenceCell}
                  >
                    <SelectTrigger><SelectValue placeholder="Village" /></SelectTrigger>
                    <SelectContent>
                      {getFormattedVillageOptions(residenceProvince, residenceDistrict, residenceSector, residenceCell).map((village) => (
                        <SelectItem key={village.value} value={village.value}>{village.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label>Type of activity</Label>
              <Input
                value={localData.typeOfActivity || ''}
                onChange={(e) => updateField('typeOfActivity', e.target.value)}
                readOnly={readOnly}
                className={readOnly ? prefilledClass : "bg-white"}
              />
            </div>
            <div>
              <Label>Representative</Label>
              <Input
                value={localData.representative || ''}
                onChange={(e) => updateField('representative', e.target.value)}
                readOnly={readOnly}
                className={readOnly ? prefilledClass : "bg-white"}
              />
            </div>
            <div>
              <Label>Contact (Tel. & Email)</Label>
              <div className="space-y-2">
                <Input
                  value={localData.contactTel || ''}
                  onChange={(e) => updateField('contactTel', e.target.value)}
                  readOnly={readOnly}
                  className={readOnly ? prefilledClass : "bg-white"}
                  placeholder="Tel:"
                />
                <Input
                  value={localData.contactEmail || ''}
                  onChange={(e) => updateField('contactEmail', e.target.value)}
                  readOnly={readOnly}
                  className={readOnly ? prefilledClass : "bg-white"}
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
                onChange={(e) => updateField('sourceName', e.target.value)}
                readOnly={readOnly}
                className={readOnly ? prefilledClass : "bg-white"}
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
                          onChange={(e) => updatePolygonPoint(index, "latitude", e.target.value)}
                          readOnly={readOnly}
                          className={coordinateInputClass}
                        />
                      </div>
                      <div className="col-span-5">
                        <Label className="text-xs text-muted-foreground">Longitude</Label>
                        <Input
                          value={point.longitude}
                          onChange={(e) => updatePolygonPoint(index, "longitude", e.target.value)}
                          readOnly={readOnly}
                          className={coordinateInputClass}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {!readOnly && (
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      disabled={coordinatesSaving || !localData.sourcePolygonPoints?.length}
                      onClick={() => onSourcePolygonSave?.(localData.sourcePolygonPoints || [])}
                    >
                      {coordinatesSaving ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1.5" />
                      )}
                      Save coordinates
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <Label>Latitude</Label>
                  <Input
                    value={localData.sourceLatitude || ''}
                    onChange={(e) => updateField('sourceLatitude', e.target.value)}
                    readOnly={readOnly}
                    className={coordinateInputClass}
                  />
                </div>
                <div>
                  <Label>Longitude</Label>
                  <Input
                    value={localData.sourceLongitude || ''}
                    onChange={(e) => updateField('sourceLongitude', e.target.value)}
                    readOnly={readOnly}
                    className={coordinateInputClass}
                  />
                </div>
                {!readOnly && (
                  <div className="md:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={coordinateSaveDisabled}
                      onClick={() => onSourceCoordinatesSave?.({
                        latitude: String(localData.sourceLatitude || ""),
                        longitude: String(localData.sourceLongitude || ""),
                      })}
                    >
                      {coordinatesSaving ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1.5" />
                      )}
                      Save coordinates
                    </Button>
                  </div>
                )}
              </>
            )}

            <div className="md:col-span-2">
              <Label>Location: Coordinates, village, cell, sector, district, level one and level two catchments</Label>
              <Input
                value={localData.sourceLocation || ''}
                onChange={(e) => updateField('sourceLocation', e.target.value)}
                readOnly={readOnly}
                className={readOnly ? prefilledClass : "bg-white"}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Level 1 Catchment</Label>
                  <Input
                    value={localData.catchmentLevel1 || ''}
                    onChange={(e) => updateField('catchmentLevel1', e.target.value)}
                    readOnly={readOnly}
                    className={readOnly ? prefilledClass : "bg-white"}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Level 2 Catchment</Label>
                  <Input
                    value={localData.catchmentLevel2 || ''}
                    onChange={(e) => updateField('catchmentLevel2', e.target.value)}
                    readOnly={readOnly}
                    className={readOnly ? prefilledClass : "bg-white"}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Abstraction template includes flow of the water source */}
          {reportType === "abstraction" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="md:col-span-2">
                <Label>Flow of the water source (attach field pictures)</Label>
              </div>
              {renderVolumeRateField("Flow", "sourceFlowValue", "sourceFlowUnit", "Enter source flow", "m3/day", "sourceFlowM3Day")}
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
                {renderVolumeRateField("Quantity", "flowRateM3Day", "flowRateM3DayUnit", "Enter quantity", "m3/year")}
                {renderVolumeRateField("Flow rate", "flowRateLps", "flowRateUnit", "Enter flow rate")}
                <div>
                  <Label>Intended abstraction method</Label>
                  <Input
                    value={localData.abstractionMethod || ''}
                    onChange={(e) => updateField('abstractionMethod', e.target.value)}
                    readOnly={readOnly}
                    disabled={readOnly}
                    className={readOnly ? prefilledClass : "bg-white"}
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
                  value={localData.waterBalanceDescription || ''}
                  onChange={(e) => updateField('waterBalanceDescription', e.target.value)}
                  placeholder="Describe the water balance..."
                  rows={3}
                  disabled={readOnly}
                  className={readOnlyClass}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  {renderVolumeRateField("Available water (Q)", "availableWaterQ", "availableWaterQUnit")}
                  {renderVolumeRateField("Water demand (D)", "waterDemandD", "waterDemandDUnit")}
                  {renderVolumeRateField("Existing demand (ED)", "existingDemandED", "existingDemandEDUnit")}
                  {renderVolumeRateField("Remaining Water (Q-D-ED)", "remainingWater", "remainingWaterUnit")}
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
                  className={readOnly ? prefilledClass : "bg-white"}
                />
              </div>
              <div>
                <Label>Surface Area Unit</Label>
                <Input
                  value={localData.surfaceAreaUnit || ''}
                  onChange={(e) => updateField('surfaceAreaUnit', e.target.value)}
                  placeholder="Ha"
                  readOnly={readOnly}
                  disabled={readOnly}
                  className={readOnly ? prefilledClass : "bg-white"}
                />
              </div>
            </CardContent>
          </Card>

          {/* Other people&apos;s rights */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertCircle className="h-5 w-5" />
                4. Other people&apos;s rights <span className="text-destructive">*</span>
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
            <Textarea
              value={localData.conclusion || ''}
              onChange={(e) => updateField('conclusion', e.target.value)}
              placeholder="Enter completion note"
              rows={5}
              disabled={readOnly}
              className={readOnlyClass}
            />
          </div>
          <div className="text-sm text-muted-foreground mt-4">
            <Label>Done at Kigali, on</Label>
            <Input
              value={localData.reportDate || ''}
              onChange={(e) => updateField('reportDate', e.target.value)}
              placeholder={new Date().toLocaleDateString()}
              readOnly={readOnly}
              disabled={readOnly}
              className={readOnly ? readOnlyClass : "bg-white"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bulk Water Supply Networks (assessor edits values only) */}
      {isBulkApplication && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Droplet className="h-5 w-5" />
              Water Supply Networks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BulkNetworksTable
              rows={localBulkNetworks}
              onChange={readOnly ? undefined : setLocalBulkNetworks}
              mode={readOnly ? "readonly" : "assessor"}
            />
            {onBulkNetworksSave && !readOnly && (
              <div className="flex justify-end">
                <Button
                  onClick={() => onBulkNetworksSave(localBulkNetworks)}
                  disabled={bulkNetworksSaving}
                >
                  {bulkNetworksSaving
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <Save className="h-4 w-4 mr-2" />}
                  Save Network Adjustments
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  This explanation is provided for the approver&apos;s consideration.
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

