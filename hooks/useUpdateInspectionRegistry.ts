import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inspectionRegistryKeys } from "@/hooks/useInspectionRegistryQuery";

export interface UpdateInspectionRegistryPayload {
  id: string;
  expectedUpdatedAt: string;
  data: Partial<{
    permit_holder: string | null;
    permit_number: string | null;
    activity: string | null;
    district: string | null;
    compliance_status: string | null;
    observation: string | null;
    action: string | null;
    /** ISO yyyy-mm-dd; the server formats + stores the display text. */
    inspection_date: string | null;
  }>;
}

export function useUpdateInspectionRegistry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, expectedUpdatedAt, data }: UpdateInspectionRegistryPayload) => {
      const qs = new URLSearchParams({ expected_updated_at: expectedUpdatedAt });
      const response = await fetch(`/api/staff/inspection-registry/${id}?${qs.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || "Failed to update inspection registry row");
      }
      return json.item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: inspectionRegistryKeys.all });
    },
  });
}
