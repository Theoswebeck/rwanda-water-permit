import { redirect } from "next/navigation";
import { resolveInspectionIdentifier } from "@/lib/inspection/resolve-inspection-identifier";

export default async function VerificationInspectionRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  try {
    const identifier = await resolveInspectionIdentifier(id);
    if (!identifier) {
      redirect("/verification?inspectionRedirect=unresolved");
    }
    redirect(`/staffrole/inspection/permit/${encodeURIComponent(identifier)}`);
  } catch (e) {
    console.error("Failed to resolve verification inspection redirect:", e);
    redirect("/verification?inspectionRedirect=error");
  }
}
