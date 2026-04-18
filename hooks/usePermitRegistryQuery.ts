import { useQuery } from "@tanstack/react-query";
import type { PermitRegistryEntry } from "@/types/database";

export const permitRegistryKeys = {
  all: ["permit-registry"] as const,
  list: (params: PermitRegistryQueryParams) => [...permitRegistryKeys.all, "list", params] as const,
};

export interface PermitRegistryQueryParams {
  q?: string;
  regime?: string;
  status?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface PermitRegistryQueryResult {
  items: PermitRegistryEntry[];
  total: number;
  summary: {
    total: number;
    distinctPermits: number;
    operational: number;
    expired: number;
    expiringSoon: number;
    regimeTypes: number;
  };
  pagination: { limit: number; offset: number; returned: number };
}

export function usePermitRegistryQuery(params: PermitRegistryQueryParams, enabled: boolean = true) {
  return useQuery({
    queryKey: permitRegistryKeys.list(params),
    queryFn: async (): Promise<PermitRegistryQueryResult> => {
      const searchParams = new URLSearchParams();
      searchParams.set("limit", String(params.limit ?? 50));
      searchParams.set("offset", String(params.offset ?? 0));
      searchParams.set("sort_by", params.sort_by ?? "row_index");
      searchParams.set("sort_dir", params.sort_dir ?? "asc");
      if (params.q && params.q.trim()) searchParams.set("q", params.q.trim());
      if (params.regime && params.regime !== "all") searchParams.set("regime", params.regime);
      if (params.status && params.status !== "all") searchParams.set("status", params.status);

      const res = await fetch(`/api/staff/permit-registry?${searchParams.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch permit registry (${res.status})`);
      }
      const json = (await res.json()) as PermitRegistryQueryResult;
      return {
        items: json.items || [],
        total: Number(json.total || 0),
        summary: {
          total: Number(json.summary?.total || json.total || 0),
          distinctPermits: Number(json.summary?.distinctPermits || 0),
          operational: Number(json.summary?.operational || 0),
          expired: Number(json.summary?.expired || 0),
          expiringSoon: Number(json.summary?.expiringSoon || 0),
          regimeTypes: Number(json.summary?.regimeTypes || 0),
        },
        pagination: json.pagination || { limit: params.limit ?? 50, offset: params.offset ?? 0, returned: 0 },
      };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
