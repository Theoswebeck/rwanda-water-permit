import { useQuery } from "@tanstack/react-query";
import type { PermitRegistryEntry } from "@/types/database";

export const permitRegistryKeys = {
  all: ["permit-registry"] as const,
  list: () => [...permitRegistryKeys.all, "list"] as const,
};

export function usePermitRegistryQuery(enabled: boolean = true) {
  return useQuery({
    queryKey: permitRegistryKeys.list(),
    queryFn: async (): Promise<PermitRegistryEntry[]> => {
      const res = await fetch("/api/staff/permit-registry?limit=500&offset=0&sort_by=serial_number&sort_dir=asc", {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch permit registry (${res.status})`);
      }
      const json = (await res.json()) as { items?: PermitRegistryEntry[] };
      return json.items || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
