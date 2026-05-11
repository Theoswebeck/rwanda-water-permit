"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, PlusCircle } from "lucide-react";
import type { BulkNetworkRow } from "@/types/database";
import {
  getFormattedSectorOptions,
  getFormattedCellOptions,
  getFormattedVillageOptions,
} from "@/lib/rwanda-administrative-data";

export const ABSTRACTION_METHODS = [
  { value: "Pumping", label: "Pumping" },
  { value: "Gravity", label: "Gravity" },
  { value: "Diversion Channel", label: "Diversion Channel" },
  { value: "Dam/Reservoir", label: "Dam/Reservoir" },
  { value: "Borehole", label: "Borehole" },
  { value: "Spring Capture", label: "Spring Capture" },
  { value: "Hand Dug Well", label: "Hand Dug Well" },
  { value: "Other", label: "Other" },
];

export type BulkTableMode = "editable" | "assessor" | "readonly";

interface BulkNetworksTableProps {
  rows: BulkNetworkRow[];
  onChange?: (rows: BulkNetworkRow[]) => void;
  mode?: BulkTableMode;
  /** Province + district selected in the bulk section — drives sector/cell/village dropdowns */
  province?: string;
  district?: string;
  /** Optional permit numbers to show in first column (issued permits only) */
  permitNumbers?: string[];
}

function validateCoordinates(value: string): string | null {
  if (!value.trim()) return null;
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length !== 2) return "Format: lat, lng";
  const [lat, lng] = parts.map(Number);
  if (isNaN(lat) || isNaN(lng)) return "Must be numbers";
  if (lat < -3 || lat > 0) return "Lat out of Rwanda range (-3 to 0)";
  if (lng < 28 || lng > 31) return "Lng out of Rwanda range (28 to 31)";
  return null;
}

function renumber(rows: BulkNetworkRow[]): BulkNetworkRow[] {
  return rows.map((r, i) => ({ ...r, number: i + 1 }));
}

export function emptyBulkRow(number: number): BulkNetworkRow {
  return {
    number,
    network_name: "",
    sector: "",
    cell: "",
    village: "",
    coordinates: "",
    capacity_m3_day: undefined,
    abstraction_method: "",
  };
}

export function BulkNetworksTable({
  rows,
  onChange,
  mode = "readonly",
  province = "",
  district = "",
  permitNumbers,
}: BulkNetworksTableProps) {
  const isReadonly = mode === "readonly";
  const canAddDelete = mode === "editable";
  const showPermitNumbers = Array.isArray(permitNumbers) && permitNumbers.length > 0;
  const hasLocation = Boolean(province && district);

  function updateRow(index: number, field: keyof BulkNetworkRow, value: unknown) {
    if (!onChange) return;
    const next = rows.map((r, i) => {
      if (i !== index) return r;
      const updated = { ...r, [field]: value };
      // Cascade resets
      if (field === "sector") { updated.cell = ""; updated.village = ""; }
      if (field === "cell") { updated.village = ""; }
      return updated;
    });
    onChange(next);
  }

  function addRow() {
    if (!onChange) return;
    onChange([...rows, emptyBulkRow(rows.length + 1)]);
  }

  function deleteRow(index: number) {
    if (!onChange) return;
    onChange(renumber(rows.filter((_, i) => i !== index)));
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {showPermitNumbers && (
                <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 w-36">
                  Permit Number
                </th>
              )}
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300 w-10">#</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Network Name</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Sector</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Cell</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Village</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Coordinates</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Capacity (m³/day)</th>
              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Water Abstraction Method</th>
              {canAddDelete && <th className="px-3 py-2 w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const sectorOptions = hasLocation
                ? getFormattedSectorOptions(province, district)
                : [];
              const cellOptions =
                hasLocation && row.sector
                  ? getFormattedCellOptions(province, district, row.sector)
                  : [];
              const villageOptions =
                hasLocation && row.sector && row.cell
                  ? getFormattedVillageOptions(province, district, row.sector, row.cell)
                  : [];

              return (
                <tr key={i} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {showPermitNumbers && (
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {permitNumbers?.[i] ?? ""}
                    </td>
                  )}
                  <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">{row.number}</td>

                  {/* Network Name */}
                  <td className="px-3 py-2">
                    {isReadonly ? (
                      <span>{row.network_name}</span>
                    ) : (
                      <Input
                        value={row.network_name}
                        onChange={(e) => updateRow(i, "network_name", e.target.value)}
                        disabled={mode === "assessor"}
                        className="h-8 text-sm min-w-[120px]"
                        placeholder="Network name"
                      />
                    )}
                  </td>

                  {/* Sector */}
                  <td className="px-3 py-2">
                    {isReadonly ? (
                      <span>{row.sector}</span>
                    ) : (
                      <Select
                        value={row.sector ?? ""}
                        onValueChange={(v) => updateRow(i, "sector", v)}
                        disabled={mode === "assessor" || !hasLocation}
                      >
                        <SelectTrigger className="h-8 text-sm min-w-[130px]">
                          <SelectValue placeholder={hasLocation ? "Select sector" : "Select district first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {sectorOptions.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>

                  {/* Cell */}
                  <td className="px-3 py-2">
                    {isReadonly ? (
                      <span>{row.cell}</span>
                    ) : (
                      <Select
                        value={row.cell ?? ""}
                        onValueChange={(v) => updateRow(i, "cell", v)}
                        disabled={mode === "assessor" || !row.sector}
                      >
                        <SelectTrigger className="h-8 text-sm min-w-[120px]">
                          <SelectValue placeholder={row.sector ? "Select cell" : "Select sector first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {cellOptions.map((c) => (
                            <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>

                  {/* Village */}
                  <td className="px-3 py-2">
                    {isReadonly ? (
                      <span>{row.village ?? ""}</span>
                    ) : (
                      <Select
                        value={row.village ?? ""}
                        onValueChange={(v) => updateRow(i, "village", v)}
                        disabled={mode === "assessor" || !row.cell}
                      >
                        <SelectTrigger className="h-8 text-sm min-w-[120px]">
                          <SelectValue placeholder={row.cell ? "Select village" : "Select cell first"} />
                        </SelectTrigger>
                        <SelectContent>
                          {villageOptions.map((v) => (
                            <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>

                  {/* Coordinates */}
                  <td className="px-3 py-2">
                    {isReadonly ? (
                      <span className="font-mono text-xs">{row.coordinates ?? ""}</span>
                    ) : (
                      <div className="space-y-0.5">
                        <Input
                          value={row.coordinates ?? ""}
                          onChange={(e) => updateRow(i, "coordinates", e.target.value)}
                          className={`h-8 text-sm font-mono min-w-[110px] ${validateCoordinates(row.coordinates ?? "") ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                          placeholder="lat, lng"
                        />
                        {validateCoordinates(row.coordinates ?? "") && (
                          <div className="text-xs text-red-500">{validateCoordinates(row.coordinates ?? "")}</div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Capacity */}
                  <td className="px-3 py-2">
                    {isReadonly ? (
                      <span>{row.capacity_m3_day ?? ""}</span>
                    ) : (
                      <Input
                        type="number"
                        value={row.capacity_m3_day ?? ""}
                        onChange={(e) =>
                          updateRow(
                            i,
                            "capacity_m3_day",
                            e.target.value ? Number(e.target.value) : undefined
                          )
                        }
                        className="h-8 text-sm w-24"
                        placeholder="0"
                        min={0}
                      />
                    )}
                  </td>

                  {/* Abstraction Method */}
                  <td className="px-3 py-2">
                    {isReadonly ? (
                      <span>
                        {ABSTRACTION_METHODS.find((m) => m.value === row.abstraction_method)?.label ??
                          row.abstraction_method ??
                          ""}
                      </span>
                    ) : (
                      <Select
                        value={row.abstraction_method ?? ""}
                        onValueChange={(v) => updateRow(i, "abstraction_method", v)}
                      >
                        <SelectTrigger className="h-8 text-sm min-w-[160px]">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          {ABSTRACTION_METHODS.map((m) => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>

                  {canAddDelete && (
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deleteRow(i)}
                        title="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8 + (showPermitNumbers ? 1 : 0) + (canAddDelete ? 1 : 0)}
                  className="px-3 py-6 text-center text-gray-400 text-sm"
                >
                  No network rows. Click &quot;Add Row&quot; to add networks.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canAddDelete && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          className="flex items-center gap-2"
        >
          <PlusCircle className="h-4 w-4" />
          Add Row
        </Button>
      )}
    </div>
  );
}
