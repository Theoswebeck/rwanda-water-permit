import { useQuery, keepPreviousData } from "@tanstack/react-query";

export const inspectionRegistryKeys = {
  all: ["inspection-registry"] as const,
  list: (params: InspectionRegistryQueryParams) =>
    [...inspectionRegistryKeys.all, "list", params] as const,
};

export interface InspectionRegistryDocument {
  id: string;
  doc_name: string;
  doc_mime_type: string;
  uploaded_by: string | null;
  uploaded_at: string;
  file_available: boolean;
}

export interface InspectionRegistryEntry {
  id: string;
  row_index: number | null;
  inspection_number: string | null;
  permit_holder: string | null;
  permit_number: string | null;
  activity: string | null;
  district: string | null;
  compliance_status: string | null;
  observation: string | null;
  action: string | null;
  inspection_date_text: string | null;
  inspection_date_iso: string | null;
  created_at: string | null;
  updated_at: string | null;
  source_kind: "registry" | "system";
  documents: InspectionRegistryDocument[];
}

export interface InspectionRegistryQueryParams {
  q?: string;
  compliance?: string;
  action?: string;
  observations?: string;
  source?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface InspectionRegistryQueryResult {
  items: InspectionRegistryEntry[];
  total: number;
  summary: {
    total: number;
    complying: number;
    notComplying: number;
    warnings: number;
    cancellations: number;
    fined: number;
    suspended: number;
  };
  pagination: { limit: number; offset: number; returned: number };
}

export function useInspectionRegistryQuery(params: InspectionRegistryQueryParams) {
  return useQuery({
    queryKey: inspectionRegistryKeys.list(params),
    queryFn: async (): Promise<InspectionRegistryQueryResult> => {
      const searchParams = new URLSearchParams();
      searchParams.set("limit", String(params.limit ?? 50));
      searchParams.set("offset", String(params.offset ?? 0));
      searchParams.set("sort_by", params.sort_by ?? "row_index");
      searchParams.set("sort_dir", params.sort_dir ?? "asc");
      if (params.q) searchParams.set("q", params.q);
      if (params.compliance && params.compliance !== "all") searchParams.set("compliance", params.compliance);
      if (params.action && params.action !== "all") searchParams.set("action", params.action);
      if (params.observations && params.observations !== "all") searchParams.set("observations", params.observations);
      if (params.source && params.source !== "all") searchParams.set("source", params.source);

      const res = await fetch(`/api/staff/inspection-registry?${searchParams.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load inspection registry");
      return json as InspectionRegistryQueryResult;
    },
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
