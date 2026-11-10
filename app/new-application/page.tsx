import { redirect } from "next/navigation";

interface NewApplicationPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewApplicationRedirectPage({
  searchParams,
}: NewApplicationPageProps) {
  const sp = searchParams ? await searchParams : {};
  const params = new URLSearchParams();

  for (const [key, val] of Object.entries(sp)) {
    if (typeof val === "string") {
      params.set(key, val);
    } else if (Array.isArray(val)) {
      val.forEach((v) => params.append(key, v));
    }
  }

  // Ensure default mode=new if mode is not specified
  if (!params.has("mode") && !params.has("id")) {
    params.set("mode", "new");
  }

  const query = params.toString();
  redirect(`/dashboard/new-application${query ? `?${query}` : "?mode=new"}`);
}

