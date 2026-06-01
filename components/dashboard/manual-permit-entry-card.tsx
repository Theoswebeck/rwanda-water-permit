"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2, FileSearch, Loader2 } from "lucide-react";
import type { ManualPermitSelectionPayload, PermitReference, PermitRegistrySnapshot } from "@/lib/permit/permit-reference";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";

interface LookupResponse {
  success: boolean;
  inputPermitNumber?: string;
  normalizedPermitNumber?: string;
  found?: boolean;
  permit?: Record<string, unknown> & {
    source?: "permits" | "permit_registry";
    permit_number?: string;
    status?: string;
    water_source?: string;
    purpose?: string;
    permit_holder?: string;
    registry_location?: string;
    issued_date?: string | null;
    expiry_date?: string | null;
    water_allowance?: string | null;
  };
  message?: string;
}

interface ManualPermitEntryCardProps {
  title: string;
  description: string;
  onContinue: (payload: ManualPermitSelectionPayload) => void;
}

export function ManualPermitEntryCard({ title, description, onContinue }: ManualPermitEntryCardProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const [permitNumber, setPermitNumber] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);

  const handleLookup = async () => {
    const trimmed = permitNumber.trim();
    if (!trimmed) return;
    try {
      setLookupLoading(true);
      setLookupError(null);
      const res = await fetch(`/api/dashboard/permit-lookup?permitNumber=${encodeURIComponent(trimmed)}`, {
        credentials: "include",
      });
      const data = (await res.json()) as LookupResponse;
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Lookup failed.");
      }
      setLookupResult(data);
    } catch (err) {
      setLookupResult(null);
      setLookupError(err instanceof Error ? err.message : "Lookup failed.");
    } finally {
      setLookupLoading(false);
    }
  };

  const canContinue = useMemo(() => {
    return permitNumber.trim().length > 0;
  }, [permitNumber]);

  const registrySnapshot = useMemo<PermitRegistrySnapshot | null>(() => {
    if (!lookupResult?.permit) return null;
    if (lookupResult.permit.source !== "permit_registry") return null;
    return {
      source: "permit_registry",
      registry_id: (lookupResult.permit.registry_id as string | undefined) || null,
      permit_number: String(lookupResult.permit.permit_number || permitNumber),
      status: lookupResult.permit.status || null,
      water_source: lookupResult.permit.water_source || null,
      purpose: lookupResult.permit.purpose || null,
      permit_holder: lookupResult.permit.permit_holder || null,
      registry_location: lookupResult.permit.registry_location || null,
      issued_date: (lookupResult.permit.issued_date as string | null | undefined) || null,
      expiry_date: (lookupResult.permit.expiry_date as string | null | undefined) || null,
      water_allowance: (lookupResult.permit.water_allowance as string | null | undefined) || null,
    };
  }, [lookupResult, permitNumber]);

  const handleContinue = () => {
    const normalized = lookupResult?.normalizedPermitNumber || permitNumber.trim();
    const permitReference: PermitReference = {
      source: "registry_unlinked",
      inputPermitNumber: permitNumber.trim(),
      normalizedPermitNumber: normalized,
      lookupStatus: lookupResult?.found ? "found" : "not_found",
      registrySnapshot,
    };
    onContinue({
      permitReference,
      identityProofFile: null,
    });
  };

  return (
    <Card className="border-dashed border-gray-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSearch className="h-4 w-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{tx("Old Permit Number")}</Label>
          <div className="flex gap-2">
            <Input
              value={permitNumber}
              onChange={(event) => setPermitNumber(event.target.value)}
              placeholder={tx("Example: 000001/RWB/2026")}
            />
            <Button type="button" variant="outline" onClick={handleLookup} disabled={lookupLoading || !permitNumber.trim()}>
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : tx("Lookup")}
            </Button>
          </div>
        </div>

        {lookupResult?.found ? (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-700" />
            <AlertDescription className="text-green-800">
              {tx("Registry match found for")} <strong>{lookupResult.inputPermitNumber}</strong>.
            </AlertDescription>
          </Alert>
        ) : lookupResult && !lookupResult.found ? (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-800">
              {tx("Permit not found in registry. You can still continue; staff will verify against registry records manually.")}
            </AlertDescription>
          </Alert>
        ) : null}

        {lookupError && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-800">
              {tx("Lookup could not be completed")} ({lookupError}). {tx("You can continue with manual details.")}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={handleContinue} disabled={!canContinue}>
            {tx("Continue")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ManualPermitEntryCard;
