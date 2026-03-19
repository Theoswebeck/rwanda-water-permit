import { redirect } from "next/navigation";

export default async function InspectionPermitRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/staffrole/inspection/permit/${encodeURIComponent(id)}`);
}
