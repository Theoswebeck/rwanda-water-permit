import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PermitRegistryEntry } from "@/types/database";

export const permitRegistryKeys = {
  all: ["permit-registry"] as const,
  list: () => [...permitRegistryKeys.all, "list"] as const,
};

export function usePermitRegistryQuery(enabled: boolean = true) {
  return useQuery({
    queryKey: permitRegistryKeys.list(),
    queryFn: async (): Promise<PermitRegistryEntry[]> => {
      const { data, error } = await supabase
        .from("permit_registry")
        .select("*")
        .order("serial_number", { ascending: true, nullsFirst: false });

      if (error) {
        console.error("❌ Error fetching permit registry:", error.message);
        throw error;
      }
      return data || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
