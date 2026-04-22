import { useMutation, useQueryClient } from "@tanstack/react-query";
import { permitRegistryKeys } from "@/hooks/usePermitRegistryQuery";
import type { PermitRegistryEntry } from "@/types/database";

export interface UpdatePermitRegistryPayload {
  id: string;
  expectedUpdatedAt: string;
  data: Partial<
    Pick<
      PermitRegistryEntry,
      | "permit_holder"
      | "permit_number"
      | "regime"
      | "water_source"
      | "volume_or_area"
      | "method_of_water_taking"
      | "authorized_activity"
      | "location"
      | "latitude"
      | "longitude"
      | "issuance_date"
      | "duration"
      | "expiration_date"
      | "status"
      | "contact"
    >
  >;
}

export function useUpdatePermitRegistry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, expectedUpdatedAt, data }: UpdatePermitRegistryPayload) => {
      const qs = new URLSearchParams({ expected_updated_at: expectedUpdatedAt });
      const response = await fetch(`/api/staff/permit-registry/${id}?${qs.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || "Failed to update permit registry row");
      }
      return json.item as PermitRegistryEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: permitRegistryKeys.all });
    },
  });
}
