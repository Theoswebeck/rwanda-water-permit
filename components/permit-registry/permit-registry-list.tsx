"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
  BookOpen,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
  Upload,
  X,
} from "lucide-react";
import { usePermitRegistryQuery } from "@/hooks/usePermitRegistryQuery";
import type { PermitRegistryEntry } from "@/types/database";

type SortField =
  | "serial_number"
  | "permit_holder"
  | "permit_number"
  | "issuance_date"
  | "expiration_date"
  | "status";
type SortDir = "asc" | "desc";

interface PermitRegistryListProps {
  showCard?: boolean;
}

export function PermitRegistryList({ showCard = true }: PermitRegistryListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [regimeFilter, setRegimeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("serial_number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // CSV upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    inserted: number;
    skipped: number;
    errors?: string[];
  } | null>(null);

  const { data: entries = [], isLoading, error, refetch } = usePermitRegistryQuery();

  const availableRegimes = useMemo(() => {
    const regimes = new Set(entries.map((e) => e.regime).filter(Boolean) as string[]);
    return Array.from(regimes).sort();
  }, [entries]);

  const availableStatuses = useMemo(() => {
    const statuses = new Set(entries.map((e) => e.status).filter(Boolean) as string[]);
    return Array.from(statuses).sort();
  }, [entries]);

  const filteredAndSorted = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    let result = entries.filter((entry) => {
      if (regimeFilter !== "all" && entry.regime !== regimeFilter) return false;
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      if (q) {
        const haystack = [
          entry.permit_holder,
          entry.permit_number,
          entry.location,
          entry.water_source,
          entry.authorized_activity,
          entry.regime,
          entry.method_of_water_taking,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let cmp = 0;
      const valA = a[sortField];
      const valB = b[sortField];

      if (valA == null && valB == null) cmp = 0;
      else if (valA == null) cmp = 1;
      else if (valB == null) cmp = -1;
      else if (typeof valA === "number" && typeof valB === "number") cmp = valA - valB;
      else cmp = String(valA).localeCompare(String(valB));

      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [entries, searchTerm, regimeFilter, statusFilter, sortField, sortDir]);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField]
  );

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);

    try {
      const text = await file.text();
      const res = await fetch("/api/staff/permit-registry/ingest", {
        method: "POST",
        body: text,
        headers: { "Content-Type": "text/plain" },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      setUploadResult({ inserted: json.inserted, skipped: json.skipped, errors: json.errors });
      refetch();
    } catch (err) {
      setUploadResult({
        inserted: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "Unknown error"],
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string | null | undefined) => {
    const s = (status || "").toUpperCase();
    switch (s) {
      case "OPERATIONAL":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
            Operational
          </Badge>
        );
      case "EXPIRED":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            Expired
          </Badge>
        );
      case "SUSPENDED":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Suspended
          </Badge>
        );
      case "REVOKED":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            Revoked
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
            {status || "Unknown"}
          </Badge>
        );
    }
  };

  const getRegimeBadge = (regime: string | null | undefined) => {
    if (!regime) return null;
    if (regime.toLowerCase() === "concession") {
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
          Concession
        </Badge>
      );
    }
    if (regime.toLowerCase() === "authorization") {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
          Authorization
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
        {regime}
      </Badge>
    );
  };

  const activeFilterCount = [
    regimeFilter !== "all",
    statusFilter !== "all",
    searchTerm.trim() !== "",
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchTerm("");
    setRegimeFilter("all");
    setStatusFilter("all");
  };

  const content = (
    <>
      {/* Filters */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search permit holder, number, location, water source, activity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={regimeFilter} onValueChange={setRegimeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Regime" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regimes</SelectItem>
                {availableRegimes.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {availableStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10 px-3">
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filteredAndSorted.length}</span>
            {filteredAndSorted.length !== entries.length && (
              <> of {entries.length}</>
            )}{" "}
            permit{entries.length !== 1 ? "s" : ""}
          </p>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
              disabled={uploading}
            />
            <Button variant="outline" size="sm" asChild disabled={uploading}>
              <span>
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {uploading ? "Importing..." : "Import CSV"}
              </span>
            </Button>
          </label>
        </div>

        {uploadResult && (
          <div
            className={`p-3 rounded-lg border text-sm ${
              uploadResult.errors?.length
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-green-50 border-green-200 text-green-800"
            }`}
          >
            Imported {uploadResult.inserted} record{uploadResult.inserted !== 1 ? "s" : ""}, skipped{" "}
            {uploadResult.skipped}.
            {uploadResult.errors?.length ? (
              <ul className="mt-1 list-disc list-inside">
                {uploadResult.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {uploadResult.errors.length > 5 && (
                  <li>...and {uploadResult.errors.length - 5} more errors</li>
                )}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="ml-3 text-sm text-muted-foreground">Loading permit registry...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex items-center justify-center py-12 text-destructive">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span>Failed to load permit registry: {error.message}</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredAndSorted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground font-medium">
            {entries.length === 0
              ? "No permits in the registry"
              : "No permits match your filters"}
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            {entries.length === 0
              ? "Import a CSV file to populate the registry"
              : "Try adjusting your search or filter criteria"}
          </p>
        </div>
      )}

      {/* Registry Table */}
      {!isLoading && !error && filteredAndSorted.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("serial_number")}
                >
                  <span className="flex items-center">
                    S/N
                    <SortIcon field="serial_number" />
                  </span>
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("permit_holder")}
                >
                  <span className="flex items-center">
                    Permit Holder
                    <SortIcon field="permit_holder" />
                  </span>
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("permit_number")}
                >
                  <span className="flex items-center">
                    Permit Number
                    <SortIcon field="permit_number" />
                  </span>
                </TableHead>
                <TableHead className="whitespace-nowrap">Regime</TableHead>
                <TableHead className="whitespace-nowrap">Water Source</TableHead>
                <TableHead className="whitespace-nowrap hidden lg:table-cell">Volume/Area</TableHead>
                <TableHead className="whitespace-nowrap hidden xl:table-cell">Activity</TableHead>
                <TableHead className="whitespace-nowrap hidden lg:table-cell">Location</TableHead>
                <TableHead
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("issuance_date")}
                >
                  <span className="flex items-center">
                    Issued
                    <SortIcon field="issuance_date" />
                  </span>
                </TableHead>
                <TableHead className="whitespace-nowrap hidden md:table-cell">Duration</TableHead>
                <TableHead
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("expiration_date")}
                >
                  <span className="flex items-center">
                    Expires
                    <SortIcon field="expiration_date" />
                  </span>
                </TableHead>
                <TableHead
                  className="cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("status")}
                >
                  <span className="flex items-center">
                    Status
                    <SortIcon field="status" />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSorted.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TableCell className="font-medium text-muted-foreground">
                    {entry.serial_number ?? "-"}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium max-w-[200px] truncate">{entry.permit_holder}</div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{entry.permit_number}</span>
                  </TableCell>
                  <TableCell>{getRegimeBadge(entry.regime)}</TableCell>
                  <TableCell>
                    <span className="text-sm max-w-[150px] truncate block">
                      {entry.water_source || "N/A"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <span className="text-sm">{entry.volume_or_area || "N/A"}</span>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <span className="text-sm max-w-[180px] truncate block">
                      {entry.authorized_activity || "N/A"}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-start gap-1 max-w-[220px]">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-xs text-muted-foreground truncate">
                        {entry.location || "N/A"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(entry.issuance_date)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {entry.duration || "N/A"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDate(entry.expiration_date)}
                  </TableCell>
                  <TableCell>{getStatusBadge(entry.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );

  if (!showCard) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Water Permit Registry
        </CardTitle>
        <CardDescription>
          Registry of all water use permits issued across Rwanda
        </CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}
