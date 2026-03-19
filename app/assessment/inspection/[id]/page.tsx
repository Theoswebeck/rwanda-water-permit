import { redirect } from "next/navigation";
import { getInspectionById } from "@/lib/supabase";

function isRegistryApplication(applicationNumber?: string): boolean {
  return Boolean(applicationNumber && applicationNumber.startsWith("REG-"));
}

function extractPermitNumber(applicationNumber: string): string {
  return applicationNumber.replace(/^REG-/, "");
}

export default async function AssessmentInspectionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const inspection = await getInspectionById(id);
    const app = inspection?.application as { application_number?: string } | undefined;
    const applicationNumber = app?.application_number;

    if (!applicationNumber) {
      // Fallback: try to get permit_number from permits table
      const applicationId = (inspection as { application_id?: string })?.application_id;
      if (applicationId) {
        const { supabase } = await import("@/lib/supabase");
        const { data: permit } = await supabase
          .from("permits")
          .select("permit_number")
          .eq("application_id", applicationId)
          .maybeSingle();

        if (permit?.permit_number) {
          redirect(`/staffrole/inspection/permit/${encodeURIComponent(permit.permit_number)}`);
        }
      }
      // Cannot resolve - return to assessment dashboard
      redirect("/assessment");
    }

    // Use permit number for registry (fetchInspectionData accepts it), or application_number for normal
    const identifier = isRegistryApplication(applicationNumber)
      ? extractPermitNumber(applicationNumber)
      : applicationNumber;

    redirect(`/staffrole/inspection/permit/${encodeURIComponent(identifier)}`);
  } catch (e) {
    console.error("❌ Failed to resolve inspection for redirect:", e);
    redirect("/assessment");
  }
}
