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

export const ABSTRACTION_METHODS = [
  { value: "pumping_system", label: "Abstraction by Pumping System" },
  { value: "gravity_flow", label: "Gravity Flow" },
  { value: "other", label: "Other" },
];

export type BulkTableMode = "editable" | "assessor" | "readonly";

interface BulkNetworksTableProps {
  rows: BulkNetworkRow[];
  onChange?: (rows: BulkNetworkRow[]) => void;
  mode?: BulkTableMode;
  /** Optional permit numbers to show in first column (issued permits only) */
  permitNumbers?: string[];
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
  permitNumbers,
}: BulkNetworksTableProps) {
  const isReadonly = mode === "readonly";
  const canAddDelete = mode === "editable";
  const showPermitNumbers = Array.isArray(permitNumbers) && permitNumbers.length > 0;

  function updateRow(index: number, field: keyof BulkNetworkRow, value: unknown) {
    if (!onChange) return;
    const next = rows.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
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
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                {showPermitNumbers && (
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                    {permitNumbers?.[i] ?? ""}
                  </td>
                )}
                <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">{row.number}</td>
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
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.sector}</span>
                  ) : (
                    <Input
                      value={row.sector}
                      onChange={(e) => updateRow(i, "sector", e.target.value)}
                      disabled={mode === "assessor"}
                      className="h-8 text-sm min-w-[90px]"
                      placeholder="Sector"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.cell}</span>
                  ) : (
                    <Input
                      value={row.cell}
                      onChange={(e) => updateRow(i, "cell", e.target.value)}
                      disabled={mode === "assessor"}
                      className="h-8 text-sm min-w-[80px]"
                      placeholder="Cell"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span>{row.village ?? ""}</span>
                  ) : (
                    <Input
                      value={row.village ?? ""}
                      onChange={(e) => updateRow(i, "village", e.target.value)}
                      disabled={mode === "assessor"}
                      className="h-8 text-sm min-w-[80px]"
                      placeholder="Village"
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isReadonly ? (
                    <span className="font-mono text-xs">{row.coordinates ?? ""}</span>
                  ) : (
                    <Input
                      value={row.coordinates ?? ""}
                      onChange={(e) => updateRow(i, "coordinates", e.target.value)}
                      className="h-8 text-sm font-mono min-w-[110px]"
                      placeholder="lat, lng"
                    />
                  )}
                </td>
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
            ))}
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
