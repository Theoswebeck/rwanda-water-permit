import { redirect } from "next/navigation";

type PageProps = {
  params: { id: string };
};

export default function VerifierApplicationAliasPage({ params }: PageProps) {
  const id = encodeURIComponent(params.id);
  redirect(`/verification/application/${id}`);
}


