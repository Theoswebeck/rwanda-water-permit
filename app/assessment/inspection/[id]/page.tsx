import { redirect } from "next/navigation";
import { resolveInspectionIdentifier } from "@/lib/inspection/resolve-inspection-identifier";

export default async function AssessmentInspectionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const identifier = await resolveInspectionIdentifier(id);
    if (!identifier) {
      redirect("/assessment?inspectionRedirect=unresolved");
    }
    redirect(`/staffrole/inspection/permit/${encodeURIComponent(identifier)}`);
  } catch (e) {
    console.error("❌ Failed to resolve inspection for redirect:", e);
    redirect("/assessment?inspectionRedirect=error");
  }
}
