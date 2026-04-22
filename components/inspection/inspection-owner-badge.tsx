"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";

type AssessorRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

interface InspectionOwnerBadgeProps {
  inspectorId?: string | null;
}

export function InspectionOwnerBadge({ inspectorId }: InspectionOwnerBadgeProps) {
  const [assessor, setAssessor] = useState<AssessorRow | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!inspectorId) {
      setAssessor(null);
      return;
    }

    const load = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, first_name, last_name, email")
        .eq("id", inspectorId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.warn("⚠️ InspectionOwnerBadge: failed to load assessor", error);
        setAssessor(null);
        return;
      }

      setAssessor((data as AssessorRow | null) ?? null);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [inspectorId]);

  if (!inspectorId || !assessor) return null;

  const fullName = [assessor.first_name, assessor.last_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");

  const email = (assessor.email ?? "").trim();

  if (!fullName && !email) return null;

  return (
    <Badge
      variant="outline"
      className="max-w-[320px] truncate font-normal"
      title={fullName ? `${fullName}${email ? ` · ${email}` : ""}` : email}
    >
      <span className="truncate">
        Assessor: {fullName || email}
        {fullName && email ? (
          <>
            {" · "}
            <a
              href={`mailto:${email}`}
              className="underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {email}
            </a>
          </>
        ) : null}
      </span>
    </Badge>
  );
}
