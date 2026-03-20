"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

type PermitPublicActionsProps = {
  permitNumber: string;
  canViewPdf: boolean;
};

function openBlobInNewTab(blob: Blob, fallbackFilename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const win = window.open(objectUrl, "_blank", "noopener,noreferrer");
  if (!win) {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fallbackFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function PermitPublicActions({ permitNumber, canViewPdf }: PermitPublicActionsProps) {
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const tx = useCallback((value: string) => translateText(value, language), [language]);

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const handleViewPdf = async () => {
    if (isLoadingPdf || !canViewPdf) return;
    setError(null);
    setIsLoadingPdf(true);
    try {
      const url = `/api/public/permits/${encodeURIComponent(permitNumber)}/pdf`;
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(json?.message || "Failed to load permit PDF.");
      }
      const pdfBlob = await res.blob();
      openBlobInNewTab(pdfBlob, `permit-${permitNumber}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load permit PDF.");
    } finally {
      setIsLoadingPdf(false);
    }
  };

  return (
    <div className="mt-6 rounded-xl border bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleViewPdf} disabled={!canViewPdf || isLoadingPdf}>
          {isLoadingPdf ? tx("Generating PDF...") : tx("View official permit PDF")}
        </Button>
        <Link
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
          href={`/contract/terms/${encodeURIComponent(permitNumber)}`}
        >
          {tx("View hosted terms")}
        </Link>
      </div>
      {!canViewPdf ? (
        <p className="mt-2 text-xs text-slate-600">
          {tx("This permit exists in the public registry, but a system-issued PDF is not available for this record.")}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

