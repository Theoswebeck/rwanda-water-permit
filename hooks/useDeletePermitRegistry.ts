import { useMutation, useQueryClient } from "@tanstack/react-query";
import { permitRegistryKeys } from "@/hooks/usePermitRegistryQuery";

export function useDeletePermitRegistry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/staff/permit-registry/${id}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(json?.message || "Failed to delete permit registry row");
      }
      return json as { success: true; id: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: permitRegistryKeys.all });
    },
  });
}
